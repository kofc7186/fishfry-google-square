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
    case "Weebly":
    case "ONLINE_STORE":
    case "EXTERNAL_API":
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
 * @param {string} payment_id
 *   Payment ID corresponding to Square Payment object
 * @param {string} paymentDetails
 *   Square Payment object, if exists
 */
FormatOrder.prototype.SquareTransactionToSheet = function (payment_id, paymentDetails) {
  // try to get updated order details from Square
  if (paymentDetails == null | paymentDetails === undefined)
    paymentDetails = this.api.PaymentDetails(payment_id);

  // last token of payment_url based on / delimiter will be v2 order ID
  var order_id = paymentDetails.payment_url.split("/").pop();

  // this may not be set at the time the payment info was fetched; will only work when we get v2 webhooks
  //var customer_id = paymentDetails.hasOwnProperty('customer_id') ? paymentDetails.customer_id : undefined;
  var customer_id = undefined;

  var orderDetails = this.api.OrderDetails(order_id);
  if (orderDetails.hasOwnProperty('customer_id')) {
    customer_id = orderDetails.customer_id;
  }

  orderMetadata = {
    paymentDetails: paymentDetails,
    origin: (orderDetails.hasOwnProperty('source') ? orderDetails.source.name : "REGISTER"),
    order_id: order_id,
    pickup_time: orderDetails.fulfillments[0].pickup_details.pickup_at
  };

  orderDetails.tenders.some( function (tender){
    if (tender.id == payment_id) {
      orderMetadata.customer_id = (customer_id === undefined) ? tender.customer_id : customer_id;
      orderMetadata.note = tender.note;
      return true;
    }
  });

  var sleepTimer = 1000;
  while (orderMetadata.customer_id == undefined && sleepTimer <= 4000){
    console.log("SquareTransactionToSheet: didnt find customer ID, trying again");
    //put sleep before API call to make sure we get up-to-date information when evaluating while predicate
    Utilities.sleep(sleepTimer);

    orderDetails = this.api.OrderDetails(order_id);
    if ((customer_id === undefined) && orderDetails.hasOwnProperty('customer_id')){
      orderMetadata.customer_id = orderDetails.customer_id;
    }
    if (orderMetadata.customer_id === undefined) {
      orderDetails.tenders.some( function (tender){
        if (tender.id == payment_id) {
          orderMetadata.customer_id = tender.customer_id;
          orderMetadata.note = tender.note;
          return true;
        }
      });
    }
    sleepTimer *= 2;
  }

  /*
  // once you have the v2 transaction ID, you would need to reimplement TransactionMetadata to use RetrieveTransaction
  var txnMetadata = this.api.TransactionMetadata(location_id, payment_id, orderDetails.created_at);
  var sleepTimer = 1000;
  while (txnMetadata.customer_id == undefined && sleepTimer <= 4000){
    console.log("SquareTransactionToSheet: didnt find customer name, trying again");
    //put sleep before API call to make sure we get up-to-date information when evaluating while predicate
    Utilities.sleep(sleepTimer);
    txnMetadata = this.api.TransactionMetadata(location_id, payment_id, orderDetails.created_at);
    sleepTimer *= 2;
  }
  */
  var customerInfo = {};
  // don't bother calling to get a customer name if we don't have the customer ID
  if (orderMetadata.customer_id !== undefined){
    customerInfo = this.api.CustomerInfo(orderMetadata.customer_id);
    console.log({message:"customerInfo result", data: customerInfo});
    sleepTimer = 1000;
    while ((!customerInfo.hasOwnProperty("given_name")) && (customerInfo.creation_source == "INSTANT_PROFILE") && (sleepTimer <= 4000)) {
      console.log("SquareTransactionToSheet: didnt find customer name, trying again");
      //put sleep before API call to make sure we get up-to-date information when evaluating while predicate
      Utilities.sleep(sleepTimer);
      customerInfo = this.api.CustomerInfo(orderMetadata.customer_id);
      console.log({message:"customerInfo result", data: customerInfo});
      sleepTimer *= 2;
    }
  }

  return {txn: this.ConvertSquareToSheet(orderMetadata, orderDetails, customerInfo), payment: paymentDetails};
}

FormatOrder.prototype.ConvertSquareToSheet = function(orderMetadata, orderDetails, customerInfo) {
  // convert Square schema to Sheet schema
  var order = new menuItems();
  orderDetails.line_items.forEach( function (item) {
    //item.name will be for meals
    var key = item.name;
    console.log("ConvertSquareToSheet: menuItem found: " + key);
    if (item.variation_name == "Child") {
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
  var extractedNames = extractCustomerNames(customerInfo);

  // format data for Sheet
  var result = {
    "Order Number": orderNumber,
    'Odd / Even': (orderNumber % 2) === 0 ? 'Even' : 'Odd',
    "Payment ID": orderMetadata.paymentDetails.id,
    "Payment ID Prefix": orderMetadata.paymentDetails.id.substring(0,4),
    "Total Amount": parseInt(orderMetadata.paymentDetails.total_collected_money.amount)/100,
    "Order Received Date/Time": convertISODate(new Date(orderDetails.created_at)),
    "Last Name": extractedNames.lastName,
    "Customer Name": extractedNames.customerName,
    "Expedite": "No",
    "Pickup Time": convertISODate(new Date(orderMetadata.pickup_time)),
    "Note on Order": notes,
    "Label Doc ID": fmtLabel.createLabelFile(orderNumber, orderDetails, extractedNames.customerName, JSON.parse(notes), mealCount, soupCount),
    "Order Venue": (this.getStateFromOrigin(orderMetadata.origin) == "Present") ? "In Person" : "Online",
    "Order State": this.getStateFromOrigin(orderMetadata.origin),
    "Square Receipt Link": orderMetadata.paymentDetails.receipt_url,
    "Time Present": (this.getStateFromOrigin(orderMetadata.origin) == "Present") ? convertISODate(new Date()) : "",
    "Total Meals": mealCount,
    "Total Soups": soupCount,
    "Soup": soupCount,
    "Order ID": orderMetadata.order_id,
    "Customer ID": customerInfo.id
  };
  // Add item details
  for (var attrname in ingredients) {
    result[attrname] = ingredients[attrname];
  }

  if (result['Label Doc ID'] == '') {
    // attempt to create the label again, using the data from Sheet rather than
    result['Label Doc ID'] = createLabelFileFromSheet(result);
  }
  
  return result;
}

FormatOrder.prototype.createNoteString = function(orderDetails) {

  var descriptions = [];
  //query catalog for current item descriptions
  var itemCatalog = this.api.itemCatalog();

  //if item catalog is empty, then we will print all values to labels
  itemCatalog.objects.forEach( function (item) {
    //only store unique descriptions
    if (item.hasOwnProperty('item_data')) {
      if (item.item_data.hasOwnProperty('description') && (descriptions.indexOf(item.item_data.description) == -1)) {
        descriptions.push(item.item_data.description);
      }
    }
  });

  var notes = [];
  orderDetails.line_items.forEach( function (item) {
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

function extractCustomerNames(customerInfo) {
  //Below filter removes empty strings, undefined, null values and will return appropriate string
  var customerName = [customerInfo.given_name, customerInfo.family_name].filter(function(el) { return el; }).join(" ");
  //var customerName = ((customerInfo.given_name === undefined) ? "" : customerInfo.given_name) + " " + customerInfo.family_name;
  //TODO: if family_name has multiple tokens, just choose the last one for lastName
  var lastName = (customerInfo.family_name === undefined) ? customerName.split(" ").slice(-1)[0] : customerInfo.family_name ;
  return {customerName: customerName, lastName: lastName};
}