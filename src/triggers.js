function onOpen() {
  //TODO: Check for SQUARE_ACCESS_TOKEN in Properties; throw exception / warning if that is not present
  SpreadsheetApp.getUi()
      .createMenu('Station Menu')
      .addItem('Online Check-In Page','showOnlineCheckinPageUrl')
      .addItem('Cashier Station', 'showCashierSidebar')
      .addItem('Labeling Station', 'showLabelingSidebar')
      .addItem('Ready Station', 'showReadySidebar')
      .addItem('Closing Station', 'showClosingSidebar')
      .addToUi();

  SpreadsheetApp.getUi()
    .createMenu('SquareUp')
    .addItem('Enable Pull Payments', 'pullPaymentsOn')
    .addItem('Disable Pull Payments', 'pullPaymentsOff')
    .addItem('Simulate New Order', 'simulateNewOrder')
    .addToUi();

  SpreadsheetApp.getUi()
    .createMenu('CloudPrint')
    .addItem('Authorization URL', 'testPrinterAccess')
    .addItem('Show Printers', 'showPrinters')
    .addItem('Logout','logoutPrintOAuth')
    .addToUi();
  //TODO: validate/install triggers
}

// this must be an installed trigger as simple triggers do not have external permissions
function onEditInstalled(e){
  var editedRange = e.range;

  // skip if edits are made on any other sheet other than the transaction log
  if (editedRange.getSheet().getName() !== "Current Event Transaction Log"){
    return;
  }

  // if its a large edit, log and skip
  if ((editedRange.getNumRows() > 1) || (editedRange.getNumColumns() > 1)){
    Browser.msgBox("onEdit: trigger cannot handle this large of an edit!");
    console.log("onEdit: can't handle this large of an edit - " + editedRange.getA1Notation());
    return;
  }
  else {
    var cell = editedRange.getA1Notation();
    var column   = cell.replace(/[^a-zA-Z]/gi,'');
    var rowIndex = cell.replace(/[a-zA-Z]/gi,'');

    var worksheet = new ManagedWorksheet(editedRange.getSheet().getParent(), editedRange.getSheet().getName());

    // if edit is in customer name, or note - regenerate label doc
    if ((worksheet.getColumnLetter("Customer Name") == column) ||
        (worksheet.getColumnLetter("Note on Order") == column)) {
      var orderDetails = worksheet.getRowAsObject(rowIndex);
      console.log("onEdit: received update for " + cell + "; regenerating label doc");

      var formatLabel = new FormatLabel();
      var url = formatLabel.createLabelFileFromSheet(orderDetails);
      console.log("onEdit: new label doc for " + cell + ": " + url);

      worksheet.updateCell(rowIndex, 'Label Doc Link', url);
    }
  }
}

function pullPaymentsOff() {
  // Delete existing triggers
  // TODO: this blindly deletes ALL clock triggers
  var clockTriggers = ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getEventType() === ScriptApp.EventType.CLOCK; });
  for(var i in clockTriggers) {
    ScriptApp.deleteTrigger(clockTriggers[i]);
  }

  Browser.msgBox("Script successfully deleted all scheduled triggers.");
}

function pullPaymentsOn() {
  pullPaymentsOff();

  // Create new trigger to run hourly.
  ScriptApp.newTrigger("pullSquarePayments")
    .timeBased()
    .everyMinutes(1)
    .create();

  Browser.msgBox("Script successfully scheduled to run every minute.");
}

function pullSquarePayments() {
  var worksheet = new Worksheet();
  var fmt = new FormatOrder();
  var api = new squareAPI();
  var payments = api.pullPaymentsSince(getStartOrderSearchTime().toISOString());
  //pull all entries in Payment ID column
  var knownPaymentIDs = worksheet.worksheet.indices('Payment ID');
  //make 2 passes to minimize likelihood of collisions
  //pass1: do the filtering before trying to upsert anything
  payments = payments.filter( function (payment) {
    //we don't know about this transaction OR we know about it and there is a refund attached
    if ((knownPaymentIDs.indexOf(payment.id) == -1) || (payment.refunds.length > 0)){
      console.log({message: "pullSquarePayments: relevant payment found", data: payment});
      return true;
    }
    else {
      console.log({message: "pullSquarePayments: payment already found and no refunds pending; skipping " + payment.id});
      return false;
    }
  });

  //pass 2: try to upsert each one
  // it is still possible that in between the API call to square above and now that a webhook would have fired
  // duplicate entries for the same Square ID are protected inside upsertTransaction with a lock
  payments.forEach( function(payment) {
    var txnObj = fmt.SquareTransactionToSheet(api.default_location_id, payment.id, payment);
    console.log({message: "pullSquarePayments: attempting upsert for payment", data: payment, order: order});
    //3/3/19: pass payment object here to save separate API call back to Square
    worksheet.upsertTransaction(txnObj.txn, payment);
  });
}

function simulateNewOrder() {
  var fmt_order = new FormatOrder();
  var worksheet = new Worksheet();
  var simulation = new simulateSquare();
  var new_txn = simulation.NewTransaction();
  var new_order = simulation.NewOrder();
  var customer = {given_name:'simulated', family_name: simulation.randomString(10)};
  var txn = fmt_order.ConvertSquareToSheet(new_txn, new_order, customer);
  worksheet.upsertTransaction(txn);

  Browser.msgBox("Script successfully simulated an Order.");
}

function showCashierSidebar() {
  var html = HtmlService.createTemplateFromFile('src/html/sidebarTemplate');
  html.futureState = "Present";
  var htmlOutput = html.evaluate()
                       .setTitle('Cashier sidebar')
                       .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(htmlOutput);
}

function showLabelingSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('src/html/labelingSidebar')
                        .setTitle('Labeling sidebar')
                        .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}

function showReadySidebar() {
  var html = HtmlService.createTemplateFromFile('src/html/sidebarTemplate');
  html.futureState = "Ready";
  var htmlOutput = html.evaluate()
                       .setTitle('Ready sidebar')
                       .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(htmlOutput);
}

function showClosingSidebar() {
  var html = HtmlService.createTemplateFromFile('src/html/sidebarTemplate');
  html.futureState = "Closed";
  var htmlOutput = html.evaluate()
                       .setTitle('Closing sidebar')
                       .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(htmlOutput);
}

function showOnlineCheckinPageUrl() {
  Browser.msgBox(ScriptApp.getService().getUrl());
}

function testPrinterAccess() {
  var printer = new Printer();
  Browser.msgBox(printer.showAuthorizationURL());
}

function logoutPrintOAuth() {
  var printer = new Printer();
  Browser.msgBox(printer.logout());
}

function showPrinters(returnList) {
  var printer = new Printer();
  var printers = printer.getPrinterList();
  if (returnList === undefined) {
    var str_printers = '';
    for (var p in printers) {
      str_printers += printers[p].id + ' ' + printers[p].name + ' ' + printers[p].description + '\\n';
    }
    Browser.msgBox(str_printers);
  } else if (returnList === true) {
    return printers;
  }
}

function printLabel(order_id, printer_id) {
  var worksheet = new Worksheet();
  // the following call will print label & advance state
  worksheet.printLabel(order_id, printer_id);
}

function reprintLabel(order_id, printer_id) {
  var worksheet = new Worksheet();
  // we do not validate nor check state for reprinting here
  worksheet.reprintLabel(order_id, printer_id);
}

function markPresent(order_id) {
  var worksheet = new Worksheet();
  var rowIndex = worksheet.validateAndAdvanceState(order_id,'Paid Online');
  worksheet.updateWaitTimeFormulas(rowIndex);
}

function markReady(order_id) {
  var worksheet = new Worksheet();
  worksheet.validateAndAdvanceState(order_id,'Labeled');
}

function markClosed(order_id) {
  var worksheet = new Worksheet();
  worksheet.validateAndAdvanceState(order_id,'Ready');
}

function advanceState(order_id) {
  var worksheet = new Worksheet();
  var state = worksheet.advanceState(order_id);

  Browser.msgBox(order_id + " transitioned to " + state);
}
