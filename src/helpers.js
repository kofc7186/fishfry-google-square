/**
 * Formats strings into Google Sheets-compliant output as: 03/14/2018 05:12PM
 *
 * @param {Date} date
 *   input date object to be formatted
 * @returns {string} formatted date
 */
function convertISODate(date){
  return Utilities.formatDate(date, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), "MM/dd/yyyy hh:mma");
}

function pad(pad, str, padLeft) {
  if (typeof str === 'undefined')
    return pad;
  if (padLeft) {
    return (pad + str).slice(-pad.length);
  } else {
    return (str + pad).substring(0, pad.length);
  }
}

function replaceQueryParameterByName(uri, key, val) {
    return uri
        .replace(new RegExp("([?&]"+key+"(?=[=&#]|$)[^#&]*|(?=#|$))"), "&"+key+"="+encodeURIComponent(val))
        .replace(/^([^?&]+)&/, "$1?");
}

/**
 * Invokes UrlFetch.fetch with logging wrappers
 *
 * @param {string} url
 *   url to be fetched
 * @param {Object} params
 *   value of params Object to be passed to UrlFetchApp.fetch
 * @param {boolean} paginate
 *   if the square API call supports pagination, fetch all responses and return as one response to caller
 * @returns {Object} parsed response content into Javascript object
 */
function loggedUrlFetch(url, params, paginate) {
  if (paginate == undefined || paginate == null) {
    paginate = false;
  }
  try {
    console.log("loggedUrlFetch: invoking url " + url);
    var response = UrlFetchApp.fetch(url, params);
    console.log({message:"loggedUrlFetch: response", initialData: response});

    if (paginate) {
      /*check for pagination; depends on square API version*/

      //https://docs.connect.squareup.com/api/connect/v1#pagination
      if (url.indexOf('connect.squareup.com/v1') != -1) {
        var link = response.getHeaders().Link;
        if ((link !== undefined) && (link !== "")) {
          //extract link from odd header format
          var nextUrl = link.match("^<([^>]+)>;rel='next'$")[1];
          console.log({message: "loggedUrlFetch: more v1 results available, fetching additional pages", url: nextUrl});
          // this is a recursive call, that will unwind with all things in same array
          var nextResponse = loggedUrlFetch(nextUrl,params,paginate);

          // merge response & next response together
          // v1 APIs will respond with arrays, so concat them
          var responseObj = JSON.parse(response.getContentText());
          return responseObj.concat(nextResponse);
        }
        else {
          return JSON.parse(response.getContentText());
        }
      }

      //https://docs.connect.squareup.com/api/connect/v2#paginatingresults
      else if (url.indexOf('connect.squareup.com/v2') != -1) {
        //v2 APIs respond with a single object, with arrays as properties
        var responseObj = JSON.parse(response.getContentText());
        if ((responseObj.cursor !== undefined) && (responseObj.cursor !== "")) {
          // reuse the same url, replacing the cursor query parameter with the new value
          var nextUrl = replaceQueryParameterByName(url,"cursor",responseObj.cursor);
          console.log({message: "loggedUrlFetch: more v2 results available, fetching additional pages", url: nextUrl});

          // this is a recursive call, that will unwind below
          var nextResponse = loggedUrlFetch(nextUrl,params,paginate);

          // merge response & next response together
          // v2 APIs will respond with objects, so you need to find the nested arrays and concat them
          for (var i in nextResponse) {
            // nextResponse.hasOwnProperty() is used to filter out properties from the object's prototype chain
            if (nextResponse.hasOwnProperty(i) && Array.isArray(nextResponse[i])) {
              responseObj[i] = responseObj[i].concat(nextResponse[i]);
            }
          }
          return responseObj;
        }
        else {
          return responseObj;
        }
      }
      else {
        console.warn("loggedUrlFetch: pagination requested but unsure how to deal with the URL; skipping");
        return JSON.parse(response.getContentText());
      }
    }
    else {
      if (response.getAllHeaders()['Content-Type'].indexOf("json") !== -1)
        return JSON.parse(response.getContentText());
      else
        return {};
    }
  } catch (e) {
    console.error({message: "loggedUrlFetch: UrlFetchApp.fetch() returned error", data: e});
    return {};
  }
}

function isEmpty(obj) {
    for(var prop in obj) {
        if(obj.hasOwnProperty(prop))
            return false;
    }

    return JSON.stringify(obj) === JSON.stringify({});
}

function getGlobals(){
  var worksheet = new Worksheet(null, "Globals");
  var all = worksheet.worksheet.all();
  var result = {};
  // create and return a dictionary from this sheet
  all.forEach(function(kvp) {
    result[kvp["Key"]] = kvp["Value"];
  });
  return result;
}

// pulls value from globals
function getStartOrderSearchTime() {
  return new Date(getGlobals()["Start Order Search Time"]);
}

// pulls value from globals
function getLabelFolderName() {
  return getGlobals()["Label Folder Name"];
}
