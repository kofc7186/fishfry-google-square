/**
 * Configures the service.
 * modeled off of https://github.com/gsuitedevs/apps-script-oauth2/blob/master/samples/GoogleServiceAccount.gs
 */
function getOauthServiceAccountService() {
  const PRIVATE_KEY = PropertiesService.getScriptProperties().getProperty("PRIVATE_KEY");
  const CLIENT_EMAIL = "cloudfunctions-and-pubsub@serverless-fish-fry.iam.gserviceaccount.com";
  var USER_EMAIL = Session.getActiveUser().getEmail();

  return OAuth2.createService('GooglePubSub:' + USER_EMAIL)
      // Set the endpoint URL.
      .setTokenUrl('https://oauth2.googleapis.com/token')

      // Set the private key and issuer.
      .setPrivateKey(PRIVATE_KEY)
      .setIssuer(CLIENT_EMAIL)

      // Set the name of the user to impersonate. This will only work for
      // Google Apps for Work/EDU accounts whose admin has setup domain-wide
      // delegation:
      // https://developers.google.com/identity/protocols/OAuth2ServiceAccount#delegatingauthority
      .setSubject(USER_EMAIL)

      // Set the property store where authorized tokens should be persisted.
      .setPropertyStore(PropertiesService.getScriptProperties())

      // Set the cache
      .setCache(CacheService.getScriptCache())

      // Set the scope. This must match one of the scopes configured during the
      // setup of domain-wide delegation.
      .setScope(['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/pubsub']);
}

function pubsubPrint(orderNumber, orderId, reprint) {

  var labelFile = DriveApp.getFileById(orderId);

  const topic = "projects/serverless-fish-fry/topics/print_queue";
  var url = "https://pubsub.googleapis.com/v1/" + topic + ":publish";

  var payload = {
    "messages": [
      {
        "data": Utilities.base64Encode(labelFile.getBlob().getBytes()),
        "attributes": {
          "order_number": orderNumber,
          "event_id": getEventID()
        }
      }
    ]
  };

  if (reprint)
    payload['messages'][0]['attributes']['reprint'] = "True";

  console.log('pubsubPrint: Attempting print for: "' + labelFile.getName() + "'")
  var service = getOauthServiceAccountService();
  if (service.hasAccess()) {
    var response = loggedUrlFetch(url, {
      method: "POST",
      payload: payload,
      headers: {
        Authorization: 'Bearer ' + service.getAccessToken()
      },
      "muteHttpExceptions": true
    });
    // test if response is empty
    try {
      if (isEmpty(response)){
        var errMsg = "pubsubPrint: Error in invoking PubSub API";
        console.error(errMsg);
        Browser.msgBox(errMsg);
        return false;
      }
      else if (response.success) {
        console.log("pubsubPrint: response message: %s", response.message);
        return true;
      } else {
        var errMsg = "pubsubPrint: Error Code: " + response.errorCode + " " + response.message;
        console.error(errMsg);
        Browser.msgBox(errMsg);
        return false;
      }
    } catch (e) {
      console.error("pubsubPrint: exception in parsing response to PubSub API call: " + e);
    }
  } else {
    console.error("pubsubPrint: error authenticating for pubsub API call: " + service.getLastError());
  }
}