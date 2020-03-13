function doGet(e) {
  var service = HtmlService.createHtmlOutputFromFile('src/html/onlineCheckin').setTitle('KofC 7186 Fish Fry: Online Order Check-in');
  service.addMetaTag('viewport', 'width=device-width, initial-scale=1');
  return service;
}

/**
 * This method extracts the list of online orders that have a state of 'Paid Online' 
 * as these are the ones that have yet to be checked in. 
 *
 * This should return a list of orders pending check in, following the schema below
 *
 * [
 *   {
 *    'order_number': '2124',
 *    'customer_name': 'Jane Smith',
 *    'payment_id': 'RdEtVikd0IvR7B6ffzsOlwMF',
 *    'total_amount': '29.5',
 *    'receipt_link': 'https://squareup.com/receipt/preview/RdEtVikd0IvR7B6ffzsOlwMF',
 *   },
 * ...
 * ]
 */
function getOnlineOrdersForCheckin() {
  var worksheet = new Worksheet();
  var pendingOnlineOrders = worksheet.worksheet.findAllWhere(function (obj, rowIndex) { return (obj['Order State'] == "Paid Online"); });
  return pendingOnlineOrders.map(function (order) { 
    return {
      'order_number':  order['Order Number'],
      'customer_name': order['Customer Name'],
      'payment_id':    order['Payment ID'],
      'total_amount':  order['Total Amount'],
      'receipt_link':  order['Square Receipt Link'],
     };
  });
}

//TODO: rewrite this method using Square API calls and native table rendering in case
// Square changes their receipt HTML/CSS
/**
 * This method retrieves the HTML for the Square Receipt. We can not do this in an iframe 
 * due to x-frame-options: sameorigin being returned by Square.
 */
function fetchOrderTableFromSquareReceipt(receipt_link) {
  var content = UrlFetchApp.fetch(receipt_link);
  return content.getContentText();
}