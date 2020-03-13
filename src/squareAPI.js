function squareAPI() {
  this.default_location_id = 'D8BZ0GPZ20V86'; //default location id
}

squareAPI.prototype.call = function(url, params, paginate) {
  if (params == undefined || params == null) {
    params = {};
  }
  if (paginate == undefined || paginate == null) {
    paginate = true; //default to true for square
  }

  // always include authorization in header
  if (!('headers' in params)) {
    params['headers'] = {
      "Authorization": "Bearer " + PropertiesService.getScriptProperties().getProperty("SQUARE_ACCESS_TOKEN"),
      "Square-Version": "2020-02-26",
      "Content-Type": "application/json"
    }
  }

  var response = loggedUrlFetch(url, params, paginate);
  if (isEmpty(response)) {
    console.error("squareAPI.call: invoking square API failed");
    return "";
  }

  return response;
}

/**
 * Retrieves payment information from the Square V1 Payment API.
 *
 * Assumes SQUARE_ACCESS_TOKEN for authentication is stored in Script Property of same name
 *
 * @param {string} payment_id
 *   Payment ID corresponding to Square Payment object
 * @returns {object} payment object from Square V1 API
     https://developer.squareup.com/reference/square/objects/Payment
 * @throws Will throw an error if the API call to Square is not successful for any reason
 */
squareAPI.prototype.PaymentDetails = function(payment_id){
  var url = "https://connect.squareup.com/v1/" + this.default_location_id + "/payments/" + payment_id;
  return this.call(url);
}
/**
 * Retrieves order information from the Square V2 Order API.
 *
 * Assumes SQUARE_ACCESS_TOKEN for authentication is stored in Script Property of same name
 *
 * @param {string} order_id
 *   Order ID corresponding to Square Order object
 * @returns {object} payment object from Square V2 API
     https://developer.squareup.com/reference/square/objects/Order
 * @throws Will throw an error if the API call to Square is not successful for any reason
 */
squareAPI.prototype.OrderDetails = function(order_id){
  var params = {
    "payload": JSON.stringify({ "order_ids": [order_id] }),
    "method": "post"
  }
  var url = "https://connect.squareup.com/v2/locations/"+ this.default_location_id + "/orders/batch-retrieve";
  var responseObj = this.call(url,params);

  try {
    if (responseObj.orders.length == 1)
      return responseObj.orders[0];
    else
      throw "array is not of length 1!";
  } catch (e) {
    console.error({message: "OrderDetails: could not order details from Square API response", data: responseObj});
    return "";
  }
}

/**
 * Retrieves the origin of a given order from the Square V2 Transactions API.
 *
 * Assumes SQUARE_ACCESS_TOKEN for authentication is stored in Script Property of same name
 *
 * @param {string} location_id
 *   Location ID corresponding to Square Location
 * @param {string} created_at
 *   date when the order was created in RFC3339 format (e.g. 2016-01-15T00:00:00Z)
 * @returns {object} payment object from Square V2 API
 *   https://docs.connect.squareup.com/api/connect/v1#datatype-payment
 * @throws Will throw an error if the transaction can not be found or
 *         if the API call to Square is not successful for any reason
 */
squareAPI.prototype.TransactionDetails = function(location_id, created_at) {
  // when sort_order parameter is ASC, the results will be inclusive of the record we're looking for.
  var url = "https://connect.squareup.com/v2/locations/" + location_id + "/transactions?begin_time=" + created_at + "&sort_order=ASC";
  // we do not want to paginate here as the transaction we're looking for should be the first in the response
  return this.call(url, null, false);
}


/**
 * Retrieves the customer's name for a specified customer record
 *
 * Assumes SQUARE_ACCESS_TOKEN for authentication is stored in Script Property of same name
 * Uses Square Connect V2 API as the V1 API does not expose customer objects
 *
 * @param {string} customer_id
 *   Customer ID corresponding to Square Customer Object
 * @returns {object} customer object
 * @throws Will throw an error if the API call to Square is not successful for any reason (including customer_id not found)
 */
squareAPI.prototype.CustomerInfo = function(customer_id) {
  console.log("CustomerInfo: input is " + customer_id);
  if (customer_id == "")
    return "";

  var url = "https://connect.squareup.com/v2/customers/" + customer_id;
  responseObj = this.call(url);

  try {
    return responseObj.customer;//.given_name + " " + responseObj.customer.family_name;
  } catch (e) {
    console.error({message: "CustomerInfo: could not fetch name from Square API response", data: responseObj});
    return "";
  }
}

squareAPI.prototype.TransactionMetadata = function (location_id, order_id, created_at) {
  var responseObj = this.TransactionDetails(location_id, created_at);
  // the Square V1 API returns the payment information;
  // the Square V2 API nests this data underneath a transaction object
  var origin = "";
  var customer_id = "";
  var xaction_id = "";
  var note = "";
  
  console.log({message: "TransactionMetadata: Txn details", data: responseObj});

  // because we're searching on a time-based window, the call may return up to 50 transactions (via pagination).
  // we safely? assume that our transactional load is so low that we do not receive more than 50 transactions within the same second.
  // the following loop finds the appropriate transaction object that corresponds to the payment ID (aka tender.id)
  responseObj.transactions.some ( function(txn) {
    txn.tenders.some( function (tender){
      if (tender.id == order_id) {
        origin = txn.product; //REGISTER or ONLINE_STORE or EXTERNAL_API
        customer_id = tender.customer_id; //we store this to query the customer's name
        xaction_id = txn.id;
        note = tender.note;
        return true;
      }
    });
    return origin !== "";
  });

  if (origin == ""){
    var errMsg = "Transaction " + order_id + " not found in TransactionMetadata!";
    console.error(errMsg);
    throw errMsg;
  }

  return {origin: origin, customer_id: customer_id, note: note, xaction_id: xaction_id};
}

squareAPI.prototype.locations = function() {
  var url = 'https://connect.squareup.com/v2/locations'
  return this.call(url);
}

squareAPI.prototype.pullPaymentsSince = function(sinceX) {
  var url = 'https://connect.squareup.com/v1/' + this.default_location_id + '/payments?begin_time=' + sinceX + '&end_time=' + new Date().toISOString();
  return this.call(url);
}

/**
 * Retrieves current items from catalog.
 *
 * Assumes SQUARE_ACCESS_TOKEN for authentication is stored in Script Property of same name
 *
 * @returns {object} array of items in catalog
 *   https://developer.squareup.com/reference/square/objects/CatalogObject
 * @throws Will throw an error if the API call to Square is not successful for any reason
 */
squareAPI.prototype.itemCatalog = function(useCache){
  if (useCache == undefined || useCache == null) {
    useCache = true; //default to true for item catalog
  }

  var cache = CacheService.getDocumentCache();
  if (useCache) {
    var cached = cache.get("square-item-catalog");
    if (cached != null) {
      return JSON.parse(cached);
    }
  }
  var url = "https://connect.squareup.com/v2/catalog/list?types=ITEM";
  var response = this.call(url);
  if (useCache) {
    cache.put("square-item-catalog", JSON.stringify(response), 3600);// cache for 1 hour
  }
  return response;
}

squareAPI.prototype.markOrderReady = function(order_id) {
  var currentOrderDetails = this.OrderDetails(order_id);
  var params = {
    "method" : "put",
    "payload" : {
      "idempotency_key": Date.now(), //number of milliseconds since epoch should be good enough here
      "order" : {
        "version": currentOrderDetails.version,
        "fulfillments": [
          {
            "uid": currentOrderDetails.fulfillments[0].uid,
            "state" : "PREPARED"
          }
        ]
      }
    }
  };

  var url = "https://connect.squareup.com/v2/locations/" + this.default_location_id + "/orders/" + order_id;

  return this.call(url, params);
}

squareAPI.prototype.markOrderComplete = function(order_id) {
  var currentOrderDetails = this.OrderDetails(order_id);
  var params = {
    "method" : "put",
    "payload" : {
      "idempotency_key": Date.now(), //number of milliseconds since epoch should be good enough here
      "order" : {
        "version": currentOrderDetails.version,
        "fulfillments": [
          {
            "uid": currentOrderDetails.fulfillments[0].uid,
            "state" : "COMPLETED"
          }
        ]
      }
    }
  };

  var url = "https://connect.squareup.com/v2/locations/" + this.default_location_id + "/orders/" + order_id;

  return this.call(url, params);
}

var api = squareAPI();
