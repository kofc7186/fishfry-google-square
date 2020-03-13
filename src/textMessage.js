function sendTextMessage(message, phones) {
  var payload = {
    message: message,
    phones: phones
  };

  var options = {
    method: "post",
    contentType : "application/json",
    headers: {
      "x-api-key": PropertiesService.getScriptProperties().getProperty("SMS_API_KEY")
    },
    muteHttpExceptions: true,
    payload: JSON.stringify(payload)
  };

  var url = "https://m1h1qq15y0.execute-api.us-east-1.amazonaws.com/prod/"
  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() != 200)
    return null;
}

function sendOrderReadySMS(rowIndex){
  var worksheet = new Worksheet();
  var order = worksheet.worksheet.getRowAsObject(rowIndex);

  var api = new squareAPI();
  var customerInfo = api.CustomerInfo(order['Customer ID']);

  // if we don't have a phone number, just bail
  if (!customerInfo.hasOwnProperty("phone_number") || customerInfo.phone_number.trim() == "")
    return;

  // strip all non digit characters from phone number
  var phone = customerInfo.phone_number.replace(/\D+/g,"");

  // amazon SMS requires all phone numbers to be '+{countrycode}{number}' with no spaces; we assume all #s are US
  var prefix = '1';
  if (phone.substr(0, prefix.length) !== prefix)
    phone = prefix + phone;
  phone = '+' + phone;

  sendTextMessage(order['Customer Name'] + ", your order #" + order['Order Number'] + " has left the cafeteria and will be delivered to your car shortly. Thanks for supporting the K of C Fish Fry! Reply with STOP to stop receiving these messages.",
                  [phone]);
}