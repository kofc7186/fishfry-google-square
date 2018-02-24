/*
 * Create a new document from the template file
 */
function newLabelTemplate(filename) {
  //create template of label file
  var labelTemplateFile = DriveApp.getFileById(DocumentApp.openByUrl("https://docs.google.com/document/d/1rLpp1hhFASftN5VvGx2VFz_fKE2WoNqEhF2cJxW5YhI/edit").getId());
  var labelsFolder = DriveApp.getFoldersByName("ff_labels").next();

  // TODO: verify file doesn't exist before we try to setName?
  var editableLabelDocId = labelTemplateFile.makeCopy(labelsFolder).setName(filename).getId();
  var editableLabelDoc = DocumentApp.openById(editableLabelDocId);
  //TODO: verify file exists before returning?
  return editableLabelDoc;
}

function formatLabelFromSquare(orderDetails, customerName, totalMeals, totalSoups) {
  var body = [];
  var mealCount = 1;
  orderDetails.itemizations.forEach( function(item) {
    // if this is a soup, don't print a separate label
    //TODO: what if there are only soups?
    // if totalMeals == 0 && totalSoups > 0
    if (item.name == "Clam Chowder Soup")
      return;

    for (var c = 1; c <= item.quantity; c++){
      var labelString = customerName + "\t" + "Meal " + mealCount + " of " + totalMeals + "\n";

      if (item.item_variation_name != "")
        labelString += item.name + " (" + item.item_variation_name + ")\n";
      else
        labelString += item.name + "\n"

      labelString += "Side: " + item.modifiers[0].name + "\n";
      if (totalSoups > 0)
        labelString += totalSoups + " soups in order";

      body.push(labelString);
    }
    mealCount++;
  });
  // Last Name       Meal X of Y
  // Hand Breaded Fish (ADULT|CHILD)
  // Side: [Fries|Red Potato]
  // Z Soups in Order

  // if another meal, new "page"
  return body;
}

function formatLabelFromSheet(orderDetails) {
  //TODO: format from data available in Sheet
  return ['test body when not generated from squqre'];
}

function createLabelFile(orderDetails, customerName, totalMeals, totalSoups) {
  var editableLabelDoc = newLabelTemplate(orderDetails.id);
  //for each meal, enter into label

  var body = editableLabelDoc.getBody();
  var text = formatLabelFromSquare(orderDetails, customerName, totalMeals, totalSoups);
  for (var line in text) {
    body.appendParagraph(text[line]);
    body.appendPageBreak();
  }

  return editableLabelDoc.getUrl();

}
/*
 * Create label from Sheet data
 */
function createLabelFileFromSheet(orderDetails) {
  var editableLabelDoc = newLabelTemplate(orderDetails['Payment ID']);
  var body = editableLabelDoc.getBody();
  var text = formatLabelFromSheet(orderDetails);
  for (var line in text) {
    body.appendParagraph(text[line]);
    body.appendPageBreak();
  }
  return editableLabelDoc.getUrl();
}

function printLabelFromFile(filename_url) {
  // verify filename exists and we have access to it
  var file = null;
  try {
    file = DriveApp.getFileById(DocumentApp.openByUrl(filename_url).getId());
  } catch (e) {
    Logger.log(e);
    //TODO: why would it ever get to this state, and we should be returning 'false'
    return true;
  }
  var printSuccessful = false;

  //TODO: replace 'true' with perform print
  if (true) {
    printSuccessful = true;
  }

  return printSuccessful;
}