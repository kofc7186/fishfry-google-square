function Printer (printerId) {
  this.printerId = printerId;

  this.service = this.getCloudPrintService();

  if (this.service.hasAccess())
    this.oauth_token = this.service.getAccessToken();
}

//https://ctrlq.org/code/20061-google-cloud-print-with-apps-script
Printer.prototype.getCloudPrintService = function() {
  return OAuth2.createService('print')
    .setAuthorizationBaseUrl('https://accounts.google.com/o/oauth2/auth')
    .setTokenUrl('https://accounts.google.com/o/oauth2/token')
    .setClientId(PropertiesService.getScriptProperties().getProperty("CLIENT_ID"))
    .setClientSecret(PropertiesService.getScriptProperties().getProperty("CLIENT_SECRET"))
    .setCallbackFunction('handleAuth')
    .setPropertyStore(PropertiesService.getUserProperties())
    .setScope('https://www.googleapis.com/auth/cloudprint')
    .setParam('login_hint', Session.getActiveUser().getEmail())
    .setParam('access_type', 'offline')
    .setParam('approval_prompt', 'force');
}

/* previous impl passed 'this.authCallback' above however the userCallback could not resolve the correct
 . method to invoke. having a single global function that creates a new object seems to work fine
 */
function handleAuth(request) {
  var printer = new Printer();
  var isAuthorized = printer.service.handleCallback(request);
  if (isAuthorized) {
    return HtmlService.createHtmlOutput('You can now use Google Cloud Print from Apps Script.');
  } else {
    return HtmlService.createHtmlOutput('Cloud Print Error: Access Denied');
  }
}

Printer.prototype.showAuthorizationURL = function() {
  var response = this.service.getAuthorizationUrl();
  return response;
}

Printer.prototype.logout = function() {
  this.service.reset();
  return "Logged Out";
}

Printer.prototype.authCallback = function(request) {
  var isAuthorized = this.service.handleCallback(request);
  if (isAuthorized) {
    return HtmlService.createHtmlOutput('You can now use Google Cloud Print from Apps Script.');
  } else {
    return HtmlService.createHtmlOutput('Cloud Print Error: Access Denied');
  }
}

Printer.prototype.OauthToken = function() {
  /*
  var cache = CacheService.getDocumentCache();
  if (cache !== null) {
    var token = cache.get("bearer-token");
    if (token !== null) {
      return token;
    }
  }
  var token = this.service.getAccessToken();
  cache.put("bearer-token", token, 60); // cache for 6 hours
  return token;
  */
  // because each instance of a 'Printer' will get a new token, we can likely assume the lifespan of the token will not
  // expire before this instance is destroyed
  return this.service.getAccessToken();
}

Printer.prototype.getPrinterList = function() {
  var response = loggedUrlFetch('https://www.google.com/cloudprint/search', {
    headers: {
      Authorization: 'Bearer ' + this.OauthToken()
    },
    muteHttpExceptions: true
  });

  // test for empty response
  if (isEmpty(response)){
    var errMsg = "getPrinterList: unable to fetch printer list";
    console.error(errMsg);
    Browser.msgBox(errMsg);
    return [];
  }

  var printers = response.printers;

  for (var p in printers) {
    console.log("getPrinterList: %s %s %s", printers[p].id, printers[p].name, printers[p].description);
  }
  return printers;
}


Printer.prototype.PrintFileUrl = function(filename_url) {
  // verify filename exists and we have access to it
  try {
    var file = DriveApp.getFileById(filename_url);
    return this.PrintGoogleDocument(file.getId(), file.getName());
    //return this.PrintFileId(this.IdFromUrl(filename_url));    
  } catch (e) {
    console.error({message: "PrintFileUrl: exception opening by id, will try by url", data: e, url: filename_url});
    /*var file = DocumentApp.openByUrl(filename_url);
    return this.PrintGoogleDocument(file.getId(), file.getName());*/
    return this.PrintFileId(this.IdFromUrl(filename_url)); 
  }
}

Printer.prototype.IdFromUrl = function(str) {
  //TODO: this should really use DriveApp.getFileByUrl().getId() instead of this...
  try {
    return str.substr(str.indexOf('id=')+3);
  } catch (e) {
    console.error({message: "IdFromUrl: execption in parsing url", data: e});
  }
  return null;
}

Printer.prototype.PrintFileId = function(fileId) {
  var file = null;
  try {
    file = DocumentApp.openById(fileId);
  } catch (e) {
    var errMsg = "PrintFileId: Unable to locate ID: " + fileId + ": " + e;
    console.error(errMsg);
    Browser.msgBox(errMsg);
    return false;
  }
  return this.PrintGoogleDocument(file.getId(), file.getName());l
}

Printer.prototype.PrintGoogleDocument = function(docID, docName) {
  var ticket = {
    version: "1.0",
    print: {
      color: {
        type: "STANDARD_COLOR",
        vendor_id: "Color"
      },
      duplex: {
        type: "NO_DUPLEX"
      }
    }
  };

  // https://stackoverflow.com/questions/30565554/oauth2-with-google-cloud-print
  var payload = {
    "printerid" : this.printerId,
    "title"     : docName,
    "content"   : docID,
    "contentType": "google.drive",//"google.kix",
    "ticket"    : JSON.stringify(ticket)
  };

  console.log('PrintGoogleDocument: Attempting print for: "' + docName + '" to: ' + this.printerId)
  var response = loggedUrlFetch('https://www.google.com/cloudprint/submit', {
    method: "POST",
    payload: payload,
    headers: {
      Authorization: 'Bearer ' + this.OauthToken()
    },
    "muteHttpExceptions": true
  });
  // test if response is empty
  try {
    if (isEmpty(response)){
      var errMsg = "PrintGoogleDocument: Error in invoking GCP API";
      console.error(errMsg);
      Browser.msgBox(errMsg);
      return false;
    }
    else if (response.success) {
      console.log("PrintGoogleDocument: response message: %s", response.message);
      return true;
    } else {
      var errMsg = "PrintGoogleDocument: Error Code: " + response.errorCode + " " + response.message;
      console.error(errMsg);
      Browser.msgBox(errMsg);
      return false;
    }
  } catch (e) {
    console.error("PrintGoogleDocument: exception in parsing response to GCP API call: " + e);
  }
}
