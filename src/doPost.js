function doGet(e) {
  Logger.log('doGet');
  return HtmlService.createHtmlOutput("doGet from fish fry");
}

/**
 * This script processes two styles of requests:
 *
 * (1) the webhook request from the Square Connect V1 API which
 * indicates that an order has been created or updated. We use the information
 * passed in the webhook request to query the Square Connect API for additional
 * order information (meals, sides, quantities, etc).
 * 
 * NOTE: Google Apps Script will not show us POST headers, so we'll have to trust that 
 * the input is valid from the webhook... normally we should be doing an HMAC-SHA1 on
 * a request header, but since GAS won't show us the value we can't validate it.
 * 
 * We are expecting data in payload that looks like this:
 * {
 *   "merchant_id": "18YC4JBH91E1H",
 *   "location_id": "JGHJ0343",
 *   "event_type": "PAYMENT_UPDATED",
 *   "entity_id": "Jq74mCczmFXk1tC10GB"
 * }
 * 
 * https://docs.connect.squareup.com/api/connect/v1#setupwebhooks
 *
 * (2) an import of online order data extracted from the export Order Details feature
 * of the Square Online Store interface (described at:
 * https://squareup.com/help/us/en/article/5141-manage-your-online-store-orders#export-online-store-order-details )
 *
 * We use this data currently to extract per-order Notes to Merchant, and store that
 * note on each meal ticket to be printed.
 *
 * Posts to this endpoint for type (2) need to have a query parameter named
 * 'uploadOnlineOrder' set to the value of 'true' in order to be successfully
 * processed.
 *
 */
function doPost(e) {  
  console.log('doPost: received payload: ' + e);

  if (e.hasOwnProperty('postData') && e.postData.type != "application/json") {
    var errMsg = "doPost: invalid input content type for payload";
    console.error(errMsg);
    throw errMsg;
  }
  
  var input = JSON.parse(e.postData.contents);
  console.log("doPost: request contents: " + e.postData.contents);

  // test for query param to see if we should act to update online order data
  if (!isEmpty(e.parameter) && e.parameter.uploadOnlineOrder == true) {
    worksheet.updateNotesForOnlineOrders(input);
  }
  else { // treat as webhook call
    // PAYMENT_UPDATED will be sent regardless of creation or update
    if (input.event_type == 'PAYMENT_UPDATED'){
      var fmt_order = new FormatOrder();
      var worksheet = new Worksheet();
      var txn = fmt_order.SquareTransactionToSheet(input.location_id, input.entity_id);
      worksheet.upsertTransaction(txn);
    }
  }
  
  // return an HTTP 200 OK with no content for webhook request
  return HtmlService.createHtmlOutput("");
}
