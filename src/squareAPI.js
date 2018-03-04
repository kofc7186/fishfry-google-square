function test() {
  var a = squareAPI();
  a.OrderDetails('ctOhb9LkHmz83Dt1ivXkLQB');
}

function squareAPI() {
  this.default_location_id = 'D8BZ0GPZ20V86'; //default location id
}

squareAPI.prototype.call = function(url, params) {
  if (params == undefined || params == null) {
    params = {};
  }
  // always include authorization in header
  if (!('headers' in params)) {
    params['headers'] = {
      "Authorization": "Bearer " + PropertiesService.getScriptProperties().getProperty("SQUARE_ACCESS_TOKEN")
    }
  }

  var response = loggedUrlFetch(url, params);
  if (isEmpty(response)) {
    console.error("squareAPI.call: invoking square API failed");
    return "";
  }

  return response;
}

/**
 * Retrieves order information from the Square V1 Payment API.
 *
 * Assumes SQUARE_ACCESS_TOKEN for authentication is stored in Script Property of same name
 *
 * @param {string} order_id
 *   Order ID corresponding to Square Payment object
 * @returns {object} payment object from Square V1 API
 *   https://docs.connect.squareup.com/api/connect/v1#datatype-payment
 * @throws Will throw an error if the API call to Square is not successful for any reason
 */
squareAPI.prototype.OrderDetails = function(order_id){
  var url = "https://connect.squareup.com/v1/me/payments/" + order_id;
  return this.call(url);
}

/**
 * Retrieves the origin of a given order from the Square V2 Transactions API.
 *
 * Assumes SQUARE_ACCESS_TOKEN for authentication is stored in Script Property of same name
 *
 * @param {string} location_id
 *   Location ID corresponding to Square Location
 * @param {string} order_id
 *   Order ID corresponding to Square Payment object
 * @param {string} created_at
 *   date when the order was created in RFC3339 format (e.g. 2016-01-15T00:00:00Z)
 * @returns {object} payment object from Square V2 API
 *   https://docs.connect.squareup.com/api/connect/v1#datatype-payment
 * @throws Will throw an error if the transaction can not be found or
 *         if the API call to Square is not successful for any reason
 */
squareAPI.prototype.TransactionDetails = function(location_id, order_id, created_at) {
  // when sort_order parameter is ASC, the results will be inclusive of the record we're looking for.
  var url = "https://connect.squareup.com/v2/locations/" + location_id + "/transactions?begin_time=" + created_at + "&sort_order=ASC";
  return this.call(url);
}


/**
 * Retrieves the customer's last name (aka family name) for a specified customer record
 *
 * Assumes SQUARE_ACCESS_TOKEN for authentication is stored in Script Property of same name
 * Uses Square Connect V2 API as the V1 API does not expose customer objects
 *
 * @param {string} customer_id
 *   Customer ID corresponding to Square Customer Object
 * @returns {string} customer's last name
 * @throws Will throw an error if the API call to Square is not successful for any reason (including customer_id not found)
 */
squareAPI.prototype.CustomerFamilyName = function(customer_id) {
  console.log("CustomerFamilyName: input is " + customer_id);
  if (customer_id == "")
    return "";

  var url = "https://connect.squareup.com/v2/customers/" + customer_id;
  responseObj = this.call(url);

  try {
    return responseObj.customer.family_name;
  } catch (e) {
    console.error({message: "CustomerFamilyName: could not fetch family name from Square API response", data: responseObj});
    return "";
  }
}

squareAPI.prototype.TransactionMetadata = function (location_id, order_id, created_at) {
  var responseObj = this.TransactionDetails(location_id, order_id, created_at);
  // the Square V1 API returns the payment information;
  // the Square V2 API nests this data underneath a transaction object
  var origin = "";
  var customer_id = "";
  var note = "";
  
  console.log({message: "TransactionMetadata: Txn details", data: responseObj});

  // because we're searching on a time-based window, the call may return up to 50 transactions (via pagination).
  // we safely? assume that our transactional load is so low that we do not receive more than 50 transactions within the same second.
  // the following loop finds the appropriate transaction object that corresponds to the payment ID (aka tender.id)
  responseObj.transactions.some ( function(txn) {
    txn.tenders.some( function (tender){
      if (tender.id == order_id) {
        origin = txn.product; //REGISTER or ONLINE_STORE or EXTERNAL_API
        customer_id = tender.customer_id; //we store this to query the customer's last name
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

  return {origin: origin, customer_id: customer_id, note: note};
}

squareAPI.prototype.locations = function() {
  // https://docs.connect.squareup.com/api/connect/v1#get-locations
  var url = 'https://connect.squareup.com/v1/me/locations'
  return this.call(url);
}

squareAPI.prototype.pullPaymentsSince = function(sinceX) {
  // https://docs.connect.squareup.com/api/connect/v1#navsection-payments
  var url = 'https://connect.squareup.com/v1/me/payments?begin_time=' + sinceX + '&end_time=' + new Date().toISOString();
  return this.call(url);
}

/**
 * Retrieves current item descriptions from catalog.
 *
 * Assumes SQUARE_ACCESS_TOKEN for authentication is stored in Script Property of same name
 *
 * @returns {object} array of items in catalog for specified location
 *   https://docs.connect.squareup.com/api/connect/v1#datatype-item
 * @throws Will throw an error if the API call to Square is not successful for any reason
 */
squareAPI.prototype.itemCatalog = function(){
  var url = "https://connect.squareup.com/v1/" + this.default_location_id + "/items";
  return this.call(url);
}

var api = squareAPI();
