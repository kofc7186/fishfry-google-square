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
  console.log({message: 'doPost: received payload', initialData: e});

  if (e.hasOwnProperty('postData') && e.postData.type != "application/json") {
    var errMsg = "doPost: invalid input content type for payload";
    console.error(errMsg);
    throw errMsg;
  }
  
  var input = JSON.parse(e.postData.contents);
  console.log({message:"doPost: postData contents", initialData: input});

  var worksheet = new Worksheet();
  // test for query param to see if we should act to update online order data
  if (!isEmpty(e.parameter) && e.parameter.uploadOnlineOrder == "true") {
    worksheet.updateNotesForOnlineOrders(input);
  }
  else { // treat as webhook call
    // PAYMENT_UPDATED will be sent regardless of creation or update
    if (input.event_type == 'PAYMENT_UPDATED'){
      /* we do a form submit here because:
         - doPost has to return within 3 seconds or else it returns a non-200 code to Square;
           by having a trigger installed on the formSubmit, we can have an "asynch"-style response
           that lasts more than 3 seconds without having to do magic within this code
         - if we return a non-200 code to Square, they continue to retry the webhook (via exponential
           backoff) which causes numerous iterations of the code to get run, creating new orders, 
           PDFs/google docs, etc
      */
      submitForm(input.location_id,input.entity_id);
      /*
      var fmt_order = new FormatOrder();
      //FYI: this call can sleep up until 31 seconds waiting for a customer name to appear
      var txnObj = fmt_order.SquareTransactionToSheet(input.location_id, input.entity_id);
      worksheet.upsertTransaction(txnObj.txn, txnObj.payment);
      */
    }
  }
  
  // return an HTTP 200 OK with no content for webhook request
  return HtmlService.createHtmlOutput("");
}

function processWebhook(e) {
  console.log({message: "processWebhook: running for form post", initialData: JSON.stringify(e)});
  
  var location_id = e.namedValues['location_id'][0];
  var entity_id   = e.namedValues['entity_id'][0];
  
  if (location_id.trim() == "" || entity_id.trim() == "") {
    console.error("processWebhook: location_id or entity_id not found");
    return;
  }

  var fmt_order = new FormatOrder();
  var worksheet = new Worksheet();

  //FYI: this call can sleep up until 31 seconds waiting for a customer name to appear
  var txnObj = fmt_order.SquareTransactionToSheet(location_id, entity_id);
  worksheet.upsertTransaction(txnObj.txn, txnObj.payment);
}

function submitForm(location_id,entity_id) {
  /*this simply puts the two relevant values from the webhook post into the form, saving us having to marshall/demarshall the JSON data */
  var url = "https://docs.google.com/forms/d/e/1FAIpQLSfMhsHXz-Rm6JLgBtFiE4s6JCs9t42NNx8ZieXE8JBa5AOQrg/formResponse";
  url += "?entry.2012294624=" + location_id;
  url += "&entry.1610179935=" + entity_id;
  url += "&submit=Submit";
  loggedUrlFetch(url, {'method':'post'});
}

