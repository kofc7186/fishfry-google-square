function FormatLabel() {
  this.api = new squareAPI();
}

/*
 * Create a new document from the template file
 */
FormatLabel.prototype.newLabelTemplate = function(filename) {
  /*create template of label file
  var template_url = "https://docs.google.com/document/d/1rLpp1hhFASftN5VvGx2VFz_fKE2WoNqEhF2cJxW5YhI/edit";
  template_url = 'https://docs.google.com/document/d/1Oc7jDq-KnyYZ2YND9MUBzNtdokU85CQJeq-CSknexWY/edit'; // from Markus
  var labelTemplateFile = DriveApp.getFileById(DocumentApp.openByUrl(template_url).getId());
  var labelsFolder = DriveApp.getFoldersByName("ff_labels").next();
  var editableLabelDocId = labelTemplateFile.makeCopy(labelsFolder).setName(filename).getId();
  */
  var doc = DocumentApp.create(filename);
  //move the file to the right folder
  var file = DriveApp.getFileById(doc.getId());
  this.getLabelFolder().addFile(file);
  DriveApp.getRootFolder().removeFile(file);

  return doc;
}

FormatLabel.prototype.getLabelFolder = function() {
  var folderName = getLabelFolderName(); // value from globals sheet
  var folderIterator = DriveApp.getFoldersByName(folderName);
  if (folderIterator.hasNext()){
    return folderIterator.next();
  }
  else {
    var folder = DriveApp.createFolder(folderName);
    var parent = folder.getParents().next();
    DriveApp.getFoldersByName("Label Files").next().addFolder(folder);
    parent.removeFolder(folder);
    return folder;
  }
}

/*
 * *** Cloud Print Setup Notes ***
 * The following formatting is based on the Dymo Labelwriter 450 and 450 Turbo label printers using the 30336 (1" x 2-1/8") labels  
 * using Goolge Cloud Print.  Note that on the printer side, the print connector was set up using: https://github.com/google/cloud-print-connector
 * and then configuring the default label/paper size (in BOTH places) using the instructions:
 * https://help.shipstation.com/hc/en-us/articles/216103878-How-do-I-adjust-my-DYMO-LabelWriter-4XL-paper-size-Windows-
 * This allowed printing WITHOUT any particular cloud print CDD.
 * For Google Cloud Print to work from the school:
 *  - Open ports 80 and 443 outbound to allow HTTP and HTTPS traffic (nothing required, typically)
 *  - Open port 5222 outbound to allow XMPP message traffic
 * Cloud print printer status:  https://www.google.com/cloudprint/#printers  (will show offline and the Cloud print service will stay Starting with errors if firewall issue)
 * Printer Oauth setup notes:  
 * - https://ctrlq.org/code/20061-google-cloud-print-with-apps-script
 * - If necessary, register the tasks api: https://developers.google.com/google-apps/tasks/firstapp#register
 * - Register oauth2 in the script: https://github.com/googlesamples/apps-script-oauth2
 * - run that showURL() function, on the console (command-Enter) it would give a URL
 * - entered URL in the browser it would fails saying that URL xyz wasn't allowed. 
 * - then go into the API credentials page https://console.developers.google.com/apis/credentials and for that project & creat a web client credential where the 
 *   Authorized Redirect URI matches the one that was mentioned in the earlier message. Then it let me select the google account and complete the authorization.
 *
 * Notes:
 * - Arial was chosed after poor print quality with Courier/Courier New
 *
 * *** Printer Template Notes ***
 * - Must be created in Word to be the correct size, then opened in GDocs to convert it to a Doc.
 * - Nothing fancy, other than that the very first line in the template is just a blank line with 1-point (or very small) font.  There's no way to create/convert a  Word doc
 *   without something; and to be able to just appendParagraph straight away we have a template with the smallest possible line.  
 */
FormatLabel.prototype.formatLabelFromSquare = function(body, orderNumber, orderDetails, customerName, notes, totalMeals, totalSoups) {
  var menu = new menuItems();
  var mealCount = 1;
  var font = 'Arial';
  body.getChild(0).asParagraph().setFontSize(1);
  body.setPageHeight(1.25*72);
  body.setPageWidth(2.25*72);

  var margin = 0;
  body.setMarginBottom(margin).setMarginLeft(margin).setMarginRight(margin).setMarginTop(5);

  orderDetails.itemizations.forEach( function(item) {
    for (var count = 0; count < parseInt(item.quantity); count++) {
      //need to skip soups
      if (item.name == "Clam Chowder Soup")
        return;

      // top line padding
      if (mealCount !== 1)
        body.appendParagraph(" ").setFontSize(1).setAlignment(DocumentApp.HorizontalAlignment.LEFT);

      // 26 characters at 14pt
      var line1 = body
        .appendParagraph(pad('    ', orderNumber.toString(), true)
          + '                    '
          + ((mealCount >= 10) ? mealCount.toString() : pad(' ', mealCount.toString(), true))
          + " of "
          + ((totalMeals >= 10) ? totalMeals.toString() : pad(' ', totalMeals.toString(), true)))
        .setFontFamily(font)
        .setSpacingAfter(0)
        .setBold(true)
        .setItalic(false)
        .setFontSize(14)
        .setAlignment(DocumentApp.HorizontalAlignment.CENTER);

      // 37 characters at 10pt
      var line2 = body
        .appendParagraph(customerName)
        .setFontFamily(font)
        .setBold(false)
        .setFontSize(11)
        .setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
      // 33 characters at 11pt

      var variationString = "";
      if (item.item_variation_name !== "Regular") {
        //if this is adult/child then print; otherwise skip
        variationString = " (" + item.item_variation_name + ") + ";
      }
      else
        variationString = " + ";
      var sideItemName = item.modifiers[0].name;
      if (sideItemName == "Mac & Cheese")
        sideItemName += " (Side)";

      var line3 = body
        .appendParagraph(menu.items[item.name].abbr + variationString + menu.items[sideItemName].abbr)
        .setFontFamily(font)
        .setBold(true)
        .setFontSize(11)
        .setAlignment(DocumentApp.HorizontalAlignment.LEFT);

      // 33 characters at 11pt
      var soupsString = "";
      if (parseInt(totalSoups) > 0) {
        soupsString = "Total of " + totalSoups.toString() + " Soup" + ((parseInt(totalSoups) > 1) ? "s" : "" + " in Order");
      }

      var line4 = body
        .appendParagraph(soupsString)
        .setFontFamily(font)
        .setBold(true)
        .setFontSize(11)
        .setAlignment(DocumentApp.HorizontalAlignment.LEFT);

      // 37 characters at 10pt
      var note = false;
      if (notes[mealCount - 1].trim().length > 0) {
        var line5 = body
          .appendParagraph(notes[mealCount - 1].trim())
          .setFontFamily(font)
          .setBold(false)
          .setFontSize(10)
          //.setItalic(true)
          .setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
        note = true;
      }

      mealCount++;
      //page breaks need to be children of paragraphs; otherwise GDoc will append
      //a new paragraph and then make the page break a child of that new pg
      if (mealCount <= totalMeals) {
        if (note)
          line5.appendPageBreak();
        else
          line4.appendPageBreak();
      }
    }
  });

  //handle only soup corner case
  if ((totalMeals == 0) && (totalSoups > 0)){
    // 26 characters at 14pt
      var line1 = body
        .appendParagraph(pad('    ', orderNumber.toString(), true)
          + '             '
          + 'Soup Only')
        .setFontFamily(font)
        .setSpacingAfter(0)
        .setBold(true)
        .setItalic(false)
        .setFontSize(14)
        .setAlignment(DocumentApp.HorizontalAlignment.CENTER);

      // 37 characters at 10pt
      var line2 = body
        .appendParagraph(customerName)
        .setFontFamily(font)
        .setBold(false)
        .setFontSize(11)
        .setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
      // 33 characters at 11pt
      var line3 = body
        .appendParagraph("")
        .setFontFamily(font)
        .setBold(true)
        .setFontSize(11)
        .setAlignment(DocumentApp.HorizontalAlignment.LEFT);

      // 33 characters at 11pt
      var soupsString = "";
      console.log("formatLabelFromSquare: totalSoups = " + totalSoups.toString());
      if (parseInt(totalSoups) > 0) {
        soupsString = "Total of " + totalSoups.toString() + " Soup" + ((parseInt(totalSoups) > 1) ? "s" : "" + " in Order");
      }
      console.log("formatLabelFromSquare: soupsString = " + soupsString);
      var line4 = body
        .appendParagraph(soupsString)
        .setFontFamily(font)
        .setBold(true)
        .setFontSize(11)
        .setAlignment(DocumentApp.HorizontalAlignment.LEFT);
  }

  return;
}

FormatLabel.prototype.createLabelFile = function(orderNumber, orderDetails, customerName, notes, totalMeals, totalSoups) {
  var wordDocTitle = "Order " + orderNumber + ": " + customerName;
  var lock = LockService.getUserLock();
  while (!lock.tryLock(1000)){
    console.log("FormatLabel.createLabelFile: failed to get single label doc lock, retrying");
  }
  try {
    // The following ID is hardcoded as we are reusing a single Google Doc to avoid hitting DocumentApp.create() quotas
    var templateDoc = DocumentApp.openById("18x8zF98Rvh1WgMaWsMASYzcPiXweoTivxWxL70Hmbc8");
    var body = templateDoc.getBody().clear();
    this.formatLabelFromSquare(body, orderNumber, orderDetails, customerName, notes, totalMeals, totalSoups);
    templateDoc.saveAndClose();
    var blob = templateDoc.getAs(MimeType.PDF);
  }
  catch (e) {
    throw e;
  }
  finally {
    if (lock)
      lock.releaseLock();
  }
  var labelFile = DriveApp.createFile(blob);
  labelFile.setName(wordDocTitle);
  this.getLabelFolder().addFile(labelFile);
  DriveApp.getRootFolder().removeFile(labelFile);
  return labelFile.getId();
  /*
  var editableLabelDoc = this.newLabelTemplate("Order " + orderNumber + ": " + customerName);
  //for each meal, enter into label

  var body = editableLabelDoc.getBody();//.setText('');
  this.formatLabelFromSquare(body, orderNumber, orderDetails, customerName, notes, totalMeals, totalSoups);
  var url = editableLabelDoc.getUrl();
  editableLabelDoc.saveAndClose();
  return url;
  */
}
/*
 * Create label from Sheet data
 */
FormatLabel.prototype.createLabelFileFromSheet = function(orderSheetData) {
  var wordDocTitle = "Order " + orderSheetData['Order Number'] + ": " + orderSheetData['Customer Name'];
  var lock = LockService.getUserLock();
  while (!lock.tryLock(1000)){
    console.log("FormatLabel.createLabelFileFromSheet: failed to get single label doc lock, retrying");
  }
  try {
    // The following ID is hardcoded as we are reusing a single Google Doc to avoid hitting DocumentApp.create() quotas
    var templateDoc = DocumentApp.openById("18x8zF98Rvh1WgMaWsMASYzcPiXweoTivxWxL70Hmbc8");
    var body = templateDoc.getBody().clear();
    var squareOrderDetails = this.api.OrderDetails(orderSheetData['Payment ID']);
    this.formatLabelFromSquare(body, orderSheetData['Order Number'], squareOrderDetails, orderSheetData['Customer Name'], JSON.parse(orderSheetData['Note on Order']), parseInt(orderSheetData['Total Meals']), parseInt(orderSheetData['Total Soups']));
    templateDoc.saveAndClose();
    var blob = templateDoc.getAs(MimeType.PDF);
  }
  catch (e) {
    throw e;
  }
  finally {
    if (lock)
      lock.releaseLock();
  }
  var labelFile = DriveApp.createFile(blob);
  labelFile.setName(wordDocTitle);
  this.getLabelFolder().addFile(labelFile);
  DriveApp.getRootFolder().removeFile(labelFile);
  return labelFile.getId();
  /*
  //As Order Number + Customer name should be globally unique, this should make it easy to find in the Drive folder
  var editableLabelDoc = this.newLabelTemplate("Order " + orderSheetData['Order Number'] + ": " + orderSheetData['Customer Name']);
  var body = editableLabelDoc.getBody();//.setText('');
  var squareOrderDetails = this.api.OrderDetails(orderSheetData['Payment ID']);
  this.formatLabelFromSquare(body, orderSheetData['Order Number'], squareOrderDetails, orderSheetData['Customer Name'], JSON.parse(orderSheetData['Note on Order']), parseInt(orderSheetData['Total Meals']), parseInt(orderSheetData['Total Soups']));
  var url = editableLabelDoc.getUrl();
  editableLabelDoc.saveAndClose();
  return url;
  */
}