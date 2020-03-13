function Worksheet(spreadsheet_id, worksheet_name) {
  var spreadsheet_id = PropertiesService.getScriptProperties().getProperty("ssId");
  if (spreadsheet_id === null || spreadsheet_id == undefined) {
    spreadsheet_id = '1NbNqn87RH-T9CoScqKejJlSxOo_CW4VMUnDKzgcE8TU';
  }
  if (worksheet_name === null || worksheet_name == undefined) {
    worksheet_name = "Current Event Transaction Log";
  }

  // https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app#openbyidid
  // The code below opens a spreadsheet using its ID and logs the name for it.
  // Note that the spreadsheet is NOT physically opened on the client side.
  // It is opened on the server only (for modification by the script).
  this.spreadsheet = new ManagedSpreadsheet(spreadsheet_id);
  this.worksheet = this.spreadsheet.sheet(worksheet_name);
  this.order_states = [
    'Cancelled',
    'Paid Online',
    'Present',
    'Labeled',
    'Ready',
    'Closed'
  ];
}

/**
 * Searches transaction log to see if an entry exists for a given ID
 *
 * @param {string} column
 *   Column to search in
 * @param {string} value
 *   Value corresponding to the input column
 * @returns {integer} row_index
 *   Returns the row number corresponding to the entry if present, -1 if not present
 */
Worksheet.prototype.searchForTransaction = function(column, value) {
  return this.worksheet.rowIndex(column, value);
}

/**
 * Appends or updates a row in the current transaction sheet for a new inbound transaction
 *
 * @param {object} proposedOrder
 *   proposed Order in Sheet object schema to be committed to transaction log
 * @param {object} paymentData
 *   proposed Order in Square object schema that was source for Sheet object order
 */
Worksheet.prototype.upsertTransaction = function (proposedOrder, paymentData) {
  var lock = LockService.getScriptLock();
  while (!lock.tryLock(1000)) {
    console.log ('upsertTransaction: failed getting script lock, trying again');
  }
  try {
    // we have the lock if we've gotten this far
    var rowIndex = this.searchForTransaction('Payment ID', proposedOrder['Payment ID']);

    if (rowIndex == -1) {
      // the transaction hasn't been inserted yet; let's just insert it
      console.info({message:"upsertTransaction: adding order to sheet for payment " + proposedOrder['Payment ID'], initialData: proposedOrder});
      this.worksheet.append(proposedOrder);

      //set formula for wait time columns for the row you just inserted
      if (proposedOrder['Order State'] == "Present") {
        // fetch rowIndex again because it should be in spreadsheet now
        rowIndex = this.searchForTransaction('Payment ID', proposedOrder['Payment ID']);
        this.updateWaitTimeFormulas(rowIndex);
      }
    } else {
      // the transaction has already been inserted; we may need to update it
      var existingOrder = this.worksheet.getRowAsObject(rowIndex);
      console.warn({message:"upsertTransaction: received an update to order " + proposedOrder['Payment ID'], initialData: proposedOrder});

      // reasons we'd be here:
      // (1) we're polling square instead of dealing with webhooks
      //     - in this case, the common path is that we don't need to make any changes
      // (2) we got an updated customer name for the order
      // (3) we got a webhook for a payment update (refund)

      if (existingOrder['Order State'] == "Cancelled") {
        console.log("upsertTransaction: payment " + proposedOrder['Payment ID'] + " has already been cancelled; skipping");
        return;
      }

      // check to see if name is not set for this order, and if we have an updated name
      // set Customer Name and Last Name fields
      if ((existingOrder['Customer Name'].trim() == "") && (proposedOrder['Customer Name'].trim() !== "")) {
        console.log("upsertTransaction: received updated customer name for order " + proposedOrder['Payment ID']);
        this.worksheet.updateCell(rowIndex,'Customer Name', proposedOrder['Customer Name']);
        this.worksheet.updateCell(rowIndex,'Last Name', proposedOrder['Last Name']);
        //we need to copy these values to use the old order number when passing the values to the label code
        existingOrder['Customer Name'] = proposedOrder['Customer Name'];
        existingOrder['Last Name'] = proposedOrder['Last Name'];
        //these edits do not trigger a re-build of the label doc, so we need to manually do it here

        var formatLabel = new FormatLabel();
        var id = formatLabel.createLabelFileFromSheet(existingOrder);
        console.log("new label doc for name update on order " + existingOrder['Payment ID'] + ": " + url);

        this.worksheet.updateCell(rowIndex,'Label Doc ID', id);
      }

      // actions to take: check for refunds associated with this payment ID
      if ((paymentData === undefined) || (paymentData == null)){
        var api = new squareAPI();
        paymentData = api.PaymentDetails(proposedOrder['Payment ID']);
      }
      if (paymentData.refunds.length == 0){
        // did not find refunds, simply return
        console.log("upsertTransaction: did not find any refunds for payment " + proposedOrder['Payment ID'] + "; skipping");
        return;
      }
      else {
        var fullRefund = false;
        // either we will see a FULL refund type or the sum of all partial refunds == the total collected money
        if ((paymentData.refunds.filter(function (refund) { return refund.type == "FULL"; }).length > 0) ||
            (parseInt(paymentData.total_collected_money.amount) == Math.abs(parseInt(paymentData.refunded_money.amount))))
          fullRefund = true;

        var currentState = existingOrder['Order State'];

        //compute new total amount
        var newAmount = (parseInt(paymentData.total_collected_money.amount) +
                         parseInt(paymentData.refunded_money.amount))/100;//refunded money is a negative #
        console.log("upsertTransaction: comparing newAmount ("+newAmount+") to existingAmount ("+parseInt(existingOrder['Total Amount'])+")");
        if (newAmount == parseInt(existingOrder['Total Amount'])){
          console.log("upsertTransaction: received refund webhook but it appears we're up to date.. skipping");
          return;
        }

        // find the "latest" refund as we (correctly?) assume that all prior refunds have been processed.
        var refund = paymentData.refunds.sort(function compare(a,b) {
          var aDate = new Date(a.created_at);
          var bDate = new Date(b.created_at);
          // a < b
          if (aDate < bDate) {
            return 1; // we want this in desc order
          }
          // a > b
          if (aDate > bDate) {
            return -1;// we want this in desc order
          }
          // a must be equal to b
          return 0;
        })[0];

        if (fullRefund) {
          // if full refund, we should act dependent on existing order state:
          // states: cancelled (do nothing, we should have bailed above)
          //         paid online|present (change state to cancelled)
          //         labeled|ready|closed (leave state alone, update only total amount)
          if ((currentState == "Paid Online") || (currentState == "Present")) {
            console.log("upsertTransaction: detected full refund, cancelling order");
            this.worksheet.updateCell(rowIndex,'Order State', 'Cancelled');
            this.worksheet.updateCell(rowIndex,'Total Amount', newAmount);
            //delete meals/soups/serving counts for this transaction
            this.worksheet.updateCell(rowIndex,'Total Meals', 0);
            this.worksheet.updateCell(rowIndex,'Total Soups', 0);
            this.worksheet.updateCell(rowIndex,'Fried Fish', 0);
            this.worksheet.updateCell(rowIndex,'Baked Fish', 0);
            this.worksheet.updateCell(rowIndex,'Fried Shrimp', 0);
            this.worksheet.updateCell(rowIndex,'Sauteed Shrimp', 0);
            this.worksheet.updateCell(rowIndex,'Mac & Cheese', 0);
            this.worksheet.updateCell(rowIndex,'Grilled Cheese', 0);
            this.worksheet.updateCell(rowIndex,'French Fries', 0);
            this.worksheet.updateCell(rowIndex,'Red Potato', 0);
            this.worksheet.updateCell(rowIndex,'Soup', 0);

          }
          else if (currentState !== "Cancelled") {
            console.log("upsertTransaction: detected full refund, order has already been processed so setting total to " + newAmount);
            this.worksheet.updateCell(rowIndex,'Total Amount', newAmount);
          }
        }
        else {
          // if partial refund, we should act dependent on existing order state:
          // states: cancelled (do nothing, we should have bailed above)
          //         all other states (leave state alone, update only total amount)
          //
          // we can not explicitly update the meal counts/servings/etc as Square does not update the itemization based on the refund

          //compute new total amount
          console.log("upsertTransaction: detected partial refund, setting total to " + newAmount);

          if (currentState !== "Cancelled") {
            this.worksheet.updateCell(rowIndex,'Total Amount', newAmount);
          }
        }

        var refundsSheet = new Worksheet(null,"Refunds");
        var refundObject = {
          'Order Number': existingOrder['Order Number'],
          'Square Payment ID': existingOrder['Payment ID'],
          'Receipt URL': existingOrder['Square Receipt Link'],
          'State When Refunded': existingOrder['Order State'],
          'Total Amount': existingOrder['Total Amount'],
          'Refund Amount': Math.abs(parseInt(refund.refunded_money.amount)/100),
          'Reason for Refund': refund.reason,
          'Refund Type': refund.type,
          'Time of Refund': convertISODate(new Date(refund.created_at))
        };
        refundsSheet.worksheet.append(refundObject);
      }
    }
  }
  catch (e) {
    throw e;
  }
  finally {
    if (lock)
      lock.releaseLock();
  }
}

Worksheet.prototype.updateWaitTimeFormulas = function (rowIndex) {
  if (rowIndex < 0) {
    console.error('updateWaitTimeFormulas: Invalid rowIndex: ' + rowIndex);
    return;
  }
  // find the column letters that represents "current wait time", "order state", "time present"
  var curWaitTimeCell = this.worksheet.getColumnLetter("Current Wait Time") + rowIndex;
  var orderStateCell  = this.worksheet.getColumnLetter("Order State") + rowIndex;
  var timePresentCell = this.worksheet.getColumnLetter("Time Present") + rowIndex;

  this.worksheet.worksheet.getRange(timePresentCell).setNumberFormat("h:mmam/pm");

  var curWaitTimeFormula = "IF(OR("+orderStateCell+"=\"Present\","+
                                    orderStateCell+"=\"Labeled\"),Globals!$B$5-"+timePresentCell+",\"\")";

  this.worksheet.worksheet.getRange(curWaitTimeCell).setFormula(curWaitTimeFormula).setNumberFormat("[m] \"minutes\"");

  var finalWaitTimeCell = this.worksheet.getColumnLetter("Final Wait Time") + rowIndex;
  var timeReadyCell     = this.worksheet.getColumnLetter("Time Ready") + rowIndex;

  var finalWaitTimeFormula = "IF(OR("+orderStateCell+"=\"Closed\","+orderStateCell+"=\"Ready\"),"+timeReadyCell+"-"+timePresentCell+",\"\")";

  this.worksheet.worksheet.getRange(finalWaitTimeCell).setFormula(finalWaitTimeFormula).setNumberFormat("[m] \"minutes\"");

  var orderStateMessageCell = this.worksheet.getColumnLetter("Order State Message") + rowIndex;
  var orderStateMessageFormula = "IF("+orderStateCell+"=\"Present\",\"Being Cooked\","+
                                 "IF("+orderStateCell+"=\"Labeled\",\"Being Plated\","+
                                 "IF("+orderStateCell+"=\"Ready\",\"Ready for Pickup\","+orderStateCell+")))";

  this.worksheet.worksheet.getRange(orderStateMessageCell).setFormula(orderStateMessageFormula);
}

Worksheet.prototype.reprintLabel = function (orderNumber, printerId) {
  this.printLabel(orderNumber, printerId, false);
}

Worksheet.prototype.printLabel = function(orderNumber, printerId, advanceState) {
  if (typeof(advanceState)==='undefined'){
    advanceState = true;
  }

  var rowIndex = this.searchForTransaction('Order Number', parseInt(orderNumber));
  if (rowIndex == -1) {
    var errMsg = "printLabel: Unable to locate Order Number: " + orderNumber;
    console.error(errMsg);
    Browser.msgBox(errMsg);
    return false;
  }

  var order = this.worksheet.getRowAsObject(rowIndex);
  console.log({message: "printLabel: order data from sheet", data: order});

  if (order['Customer Name'] == "") {
    var errMsg = 'printLabel: Missing customer name for order: ' + orderNumber;
    console.error(errMsg);
    Browser.msgBox(errMsg);
    return false;
  }

  // retrieve filename from row
  if (order['Label Doc ID'] == "") {
    // the label was not generated yet, so attempt now
    var fmtLabel = new FormatLabel();
    order['Label Doc ID'] = fmtLabel.createLabelFileFromSheet(order);
    // we need to update this cell directly as orm.update() will blow away formulas
    this.worksheet.updateCell(rowIndex, 'Label Doc ID', order['Label Doc ID']);
  }

  var printer = new Printer(printerId);
  if (printer.PrintFileUrl(order['Label Doc ID']) !== true) {
    var errMsg = 'printLabel: Print was unsuccessful for order: ' + orderNumber;
    console.error(errMsg);
    Browser.msgBox(errMsg);
    return false;
  }

  if (advanceState && (rowIndex != this.validateAndAdvanceState(orderNumber, 'Present')))
    return false;

  return true;
}

Worksheet.prototype.setState = function(orderNumber, newState) {
  var column = 'Order State';
  var rowIndex = this.searchForTransaction('Order Number', parseInt(orderNumber));
  if (rowIndex == -1) {
    var errMsg = "setState: Unable to locate Order Number: " + orderNumber;
    console.error(errMsg);
    Browser.msgBox(errMsg);
    return false;
  }

  // update state
  var orderStateCell = this.worksheet.getColumnLetter(column) + rowIndex;
  this.worksheet.worksheet.getRange(orderStateCell).setValue(newState);

  // update state time
  var timeCell = this.worksheet.getColumnLetter('Time ' + newState);
  if (timeCell !== "") {
    this.worksheet.worksheet.getRange(timeCell+rowIndex).setValue(convertISODate(new Date()));
  }
  return newState;
}

Worksheet.prototype.validateAndAdvanceState = function(orderNumber, fromState) {
  var rowIndex = this.searchForTransaction('Order Number', parseInt(orderNumber));
  if (rowIndex == -1) {
    var errMsg = "validateAndAdvanceState: Unable to locate Order Number: " + orderNumber;
    console.error(errMsg);
    Browser.msgBox(errMsg);
    return -1;
  }
  if (this.order_states.indexOf(fromState) == -1){
    var errMsg = "validateAndAdvanceState: State '"+fromState+"' not found in state machine!";
    console.error(errMsg);
    Browser.msgBox(errMsg);
    return -1;
  }

  var order = this.worksheet.getRowAsObject(rowIndex);

  // locate current state in state machine
  var current_state = order['Order State'];
  var stateIndex = this.order_states.indexOf(current_state);

  if (stateIndex == this.order_states.length - 1) {
    var errMsg = "validateAndAdvanceState: Order " + orderNumber + " is already at the end of the State Machine!";
    console.error(errMsg);
    Browser.msgBox(errMsg);
    return -1;
  }

  // increment state
  var new_state = this.order_states[stateIndex + 1];
  var desired_new_state = this.order_states.indexOf(fromState) + 1;
  if (new_state != this.order_states[desired_new_state]){
    var errMsg = "validateAndAdvanceState: Order " + orderNumber + " cannot transition to " + this.order_states[desired_new_state] + ' from ' + current_state;
    console.error(errMsg);
    Browser.msgBox(errMsg);
    return -1;
  }

  // update state in object
  order['Order State'] = new_state;

  // test to make sure field is in spreadsheet
  if (!order.hasOwnProperty('Time ' + new_state)) {
    var errMsg = 'validateAndAdvanceState: State: ' + new_state + ' is not a column in the spreadsheet .. but probably should be?';
    console.error(errMsg);
    Browser.msgBox(errMsg);
    return -1;
  } else {
    // update state time in object only if it's a valid column
    order['Time ' + new_state] = convertISODate(new Date());
  }
  //commit state change and timestamp to spreadsheet
  this.worksheet.updateCell(rowIndex, 'Order State', order['Order State']);
  this.worksheet.updateCell(rowIndex, 'Time ' + new_state, order['Time ' + new_state]);

  var timeCell = this.worksheet.getColumnLetter("Time " + new_state) + rowIndex;
  this.worksheet.worksheet.getRange(timeCell).setNumberFormat("h:mmam/pm");

  return rowIndex;
}

/**
 * This method extracts the note field for a given online order, and sets the cell in
 * the spreadsheet that will store the note across all meals, so that the message shows
 * up on every label that is printed.
 *
 * The input data to this method should be an array of Objects, that looks like this:
 *
 * [{'Order Placed At': '2018-02-22 14:30:46 EST',
 *   'Receipt Number': 'PXp3',
 *   'Order Description': 'Clam Chowder Soup (Regular)',
 *   'Fulfillment Type': 'ELECTRONIC',
 *   'Order State': 'COMPLETED',
 *   'Pickup At': '',
 *   'Pickup Time Window': '',
 *   'Subtotal': '$3.50',
 *   'Tax': '$0.00',
 *   'Shipping': '$0.00',
 *   'Total': '$3.50',
 *   ...
 *   'Shipping Address': '',
 *   'CC Brand': 'VISA',
 *   'Note': 'test note to merchant' }
 */
Worksheet.prototype.updateNotesForOnlineOrders = function(onlineOrderData) {
  //fetch once for faster iteration
  var allOrders = this.worksheet.all();

  onlineOrderData.forEach( function(onlineOrder) {
    var match = allOrders.filter(function(sheetOrder) {
      //search based on receipt number && total amount to match as data does not
      //provide the entire payment ID, just the first four characters
      //also need to strip the $ character off of the onlineOrder Total value
      return ((sheetOrder['Payment ID'].substring(0,4) == onlineOrder['Receipt Number']) &&
              sheetOrder['Total Amount'] == onlineOrder['Total'].substring(1));
    });

    //match should be an array of size 1, but if we don't find it then just return
    if (match.length == 0){
      console.log('updateNotesForOnlineOrders: did not find matches for ' + onlineOrder['Receipt Number']);
      return;
    }
    else if (match.length > 1){
      console.error('updateNotesForOnlineOrders: found multiple matches for ' + onlineOrder['Receipt Number']);
      return;
    }

    //set a note for each meal to be a copy of the online order note.
    var notes = [];
    for (var i = 0; i < parseInt(match[0]['Total Meals']); i++){
      notes.push(onlineOrder['Note']);
    }

    var rowIndex = this.searchForTransaction('Payment ID',match[0]['Payment ID']);

    this.worksheet.updateCell(rowIndex,'Note on Order',JSON.stringify(notes));
    // we manually update the match object to save a round trip to the sheet
    match[0]['Note on Order'] = JSON.stringify(notes);

    //regenerate the labels now that we have the notes
    var fmtLabel = new FormatLabel();
    var newLabelId = fmtLabel.createLabelFileFromSheet(match[0]);
    this.worksheet.updateCell(rowIndex,'Label Doc ID', newLabelId);
  }, this);
}
