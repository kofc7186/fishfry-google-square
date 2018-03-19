function FormatOrder() {
  this.api = new squareAPI();
}

/**
 * Get atomically incrementing order number
 * 
 * The Document Properties store is used to persist the value.
 *
 * @returns {integer} next order number for use
 */
FormatOrder.prototype.getOrderNumberAtomic = function() {
  // get global lock before fetching property
  var lock = LockService.getDocumentLock();
  while (!lock.tryLock(1000)) {
    console.log ('getOrderNumberAtomic: failed getting lock, trying again');
  }
  // we have the lock if we've gotten this far
  var next = null;

  try {
    var props = PropertiesService.getDocumentProperties();
  
    var current = props.getProperty('atomicOrderNumber');
    if (current == null) { //not stored yet
      next = "2018";
    }
    else {
      next = (parseInt(current) + 1).toFixed();
    }
    props.setProperty('atomicOrderNumber', next);
  }
  catch (e) {
    console.error({message: 'getOrderNumberAtomic: Exception in setting/incrementing atomic order integer', data: e});
  }
  finally {
    lock.releaseLock();
  }

  if (next === null) {
    var errMsg = "getOrderNumberAtomic: Unable to acquire next order number!"
    console.error(errMsg);
    throw errMsg;
  }

  return next;
};


/**
 * Retrieves the appropriate order state based on where an order was received
 *
 * @param {string} origin
 *   Square product that processed order
 * @returns {string} appropriate state
 * @throws Will throw an error if Square product string is unknown
 */
FormatOrder.prototype.getStateFromOrigin = function (origin){
  switch (origin) {
    case "REGISTER":
      return "Present";
      break;
    case "ONLINE_STORE":
      return "Paid Online";
      break;
    default:
      var errMsg = "getStateFromOrigin: Unknown origin (" + origin + ") of transaction!";
      console.error(errMsg);
      throw errMsg;
  }
}

/**
 * Appends or updates a row in the current transaction sheet for a new inbound transaction
 *
 * Invokes other functions that call out to Square APIs
 *
 * @param {string} location_id
 *   Location ID corresponding to Square Location
 * @param {string} payment_id
 *   Order ID corresponding to Square Payment object
 */
FormatOrder.prototype.SquareTransactionToSheet = function (location_id, payment_id) {
  // try to get updated order details from Square
  var orderDetails = this.api.OrderDetails(payment_id);
  var txnMetadata = this.api.TransactionMetadata(location_id, payment_id, orderDetails.created_at);
  var sleepTimer = 1000;
  while (txnMetadata.customer_id == undefined && sleepTimer <= 16000){
    console.log("SquareTransactionToSheet: didnt find customer name, trying again");
    txnMetadata = this.api.TransactionMetadata(location_id, payment_id, orderDetails.created_at);
    Utilities.sleep(sleepTimer);
    sleepTimer *= 2;
  }
  var customerInfo = {};
  // don't bother calling to get a customer name if we don't have the customer ID
  if (txnMetadata.customer_id !== undefined){
    customerInfo = this.api.CustomerName(txnMetadata.customer_id);
  }
  return this.ConvertSquareToSheet(txnMetadata, orderDetails, customerInfo);
}

FormatOrder.prototype.ConvertSquareToSheet = function(txnMetadata, orderDetails, customerInfo) {
  // convert Square schema to Sheet schema
  var order = new menuItems();
  orderDetails.itemizations.forEach( function (item) {
    //item.name will be for meals
    var key = item.name;
    console.log("ConvertSquareToSheet: menuItem found: " + key);
    if (item.item_variation_name == "Child") {
      if (order.items[key].serving == 'MEAL') {
        key += ' (Child)';
      }
    }
    if (!(key in order.items)) {
      console.warn({message: "ConvertSquareToSheet: unknown menu item found in Square Order", data: item});
    }
    order.items[key].increment_quantity(item.quantity);

    //sides are stored in "item modifiers"
    item.modifiers.forEach( function(modifier) {
      var side = modifier.name;
      console.log("ConvertSquareToSheet: sideItem found: " + side);

      //Mac and Cheese can be both a side & a meal so we need a special case for it
      if (side == "Mac & Cheese") {
        side += ' (Side)';
      }
      if (!(side in order.items)) {
        console.warn({message: "ConvertSquareToSheet: unknown side item found in Square Order", data: modifier});
      }
      order.items[side].increment_quantity(item.quantity);
    });
  });

  // get totals for Sheet
  var ingredients = order.ingredientTotals();
  var mealCount = order.servingCount('MEAL');
  var soupCount = order.servingCount('SOUP');
  var orderNumber = this.getOrderNumberAtomic();
  var fmtLabel = new FormatLabel();
  var notes = this.createNoteString(orderDetails);
  var customerName = customerInfo.given_name + " " + customerInfo.family_name;

  // format data for Sheet
  var result = {
    "Order Number": orderNumber,
    'Odd / Even': (orderNumber % 2) === 0 ? 'Even' : 'Odd',
    "Payment ID": orderDetails.id,
    "Payment ID Prefix": orderDetails.id.substring(0,4),
    "Total Amount": parseInt(orderDetails.total_collected_money.amount)/100,
    "Order Received Date/Time": convertISODate(new Date(orderDetails.created_at)),
    "Last Name": customerInfo.family_name,
    "Customer Name": customerName,
    "Expedite": "No",
    "Note on Order": notes,
    "Label Doc Link": fmtLabel.createLabelFile(orderNumber, orderDetails, customerName, JSON.parse(notes), mealCount, soupCount),
    "Order Venue": (this.getStateFromOrigin(txnMetadata.origin) == "Present") ? "In Person" : "Online",
    "Order State": this.getStateFromOrigin(txnMetadata.origin),
    "Square Receipt Link": orderDetails.receipt_url,
    "Time Present": (this.getStateFromOrigin(txnMetadata.origin) == "Present") ? convertISODate(new Date()) : "",
    "Total Meals": mealCount,
    "Total Soups": soupCount,
    "Soup": soupCount
  };
  // Add item details
  for (var attrname in ingredients) {
    result[attrname] = ingredients[attrname];
  }

  if (result['Label Doc Link'] == '') {
    // attempt to create the label again, using the data from Sheet rather than
    result['Label Doc Link'] = createLabelFileFromSheet(result);
  }

  return result;
}

FormatOrder.prototype.createNoteString = function(orderDetails) {

  var descriptions = [];
  //query catalog for current item descriptions
  var itemCatalog = this.api.itemCatalog();

  //if item catalog is empty, then we will print all values to labels
  itemCatalog.forEach( function (item) {
    //only store unique descriptions
    if (item.hasOwnProperty('description') && (descriptions.indexOf(item.description) == -1)) {
      descriptions.push(item.description);
    }
  });

  var notes = [];
  orderDetails.itemizations.forEach( function (item) {
    if (item.name == "Clam Chowder Soup")
      return;

    var noteString = "";
    //if there's no note or its simply a copy of the known descriptions, put nothing
    if (item.notes !== undefined && (descriptions.indexOf(item.notes) == -1))
      noteString = item.notes;

    for (var i = 0; i < parseInt(item.quantity); i++)
      notes.push(noteString);
  });

  return JSON.stringify(notes);
}
