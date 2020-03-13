function simulateSquare() {
  this.merchant_ids = [
    'SIMULATED_MERCHANT'
  ];
  this.employee_ids = [
    'EMPLOYEE_0001'
  ];
  this.devices = [
    'DEVICE_0001'
  ];
  var menu = new menuItems();
  this.items = menu.ingredients;
  this.meals = menu.meals;
  this.sides = menu.sides;
}

simulateSquare.prototype.NewOrder = function() {
  return this.Payment();
}

simulateSquare.prototype.NewTransaction = function() {
  return {
    origin: this.randomChoice([
        'REGISTER',
        'ONLINE_STORE',
        'EXTERNAL_API',
    ]),
    customer_id: this.randomUserId(),
    note: 'Transaction Note: ' + this.randomString(10)
  };
}

simulateSquare.prototype.iso8601 = function() {
  return new Date().toISOString();
}

simulateSquare.prototype.randomInt = function(maxInt) {
  if (maxInt === null || maxInt === undefined) {
    maxInt = 20;
  }
  return Math.floor(Math.random() * maxInt);
}

simulateSquare.prototype.randomChoice = function(choices) {
  var index = this.randomInt(choices.length);
  return choices[index];
}

simulateSquare.prototype.randomList = function(max, cb) {
  var output = [];
  var times = this.randomInt(max) + 1;
  for (var i=0; i < times; i++) {
    output.push(this[cb]());
  }
  return output;
}

simulateSquare.prototype.randomString = function(max) {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (var i = 0; i < max; i++)
    text += possible.charAt(this.randomInt(possible.length));

  return text;
}

simulateSquare.prototype.randomId = function() {
  return this.randomString(19); // 'Jq74mCczmFXk1tC10GB';
}

simulateSquare.prototype.randomUserId = function() {
  return this.randomString(13); // '18YC4JBH91E1G';
}

simulateSquare.prototype.PaymentURL = function(txn_id) {
  if (txn_id === null || txn_id === undefined) {
    txn_id = this.randomId();
  }
  return 'https://squareup.com/dashboard/sales/transactions/' + txn_id;
}

// https://docs.connect.squareup.com/api/connect/v1#datatype-device
simulateSquare.prototype.Device = function() {
  var device = this.randomChoice(this.devices);
  return {
    name: device,
    id: 'ID_' + device
  };
}

// https://docs.connect.squareup.com/api/connect/v1#datatype-money
simulateSquare.prototype.Money = function(amount) {
  // https://docs.connect.squareup.com/api/connect/v1#enum-moneycurrencycode
  var country_codes = [
    'USD'
  ];
  return {
    amount: (amount !== null && amount !== undefined) ? amount : this.randomInt(),
    currency: this.randomChoice(country_codes)
  };
}

// https://docs.connect.squareup.com/api/connect/v1#datatype-payment
simulateSquare.prototype.Payment = function() {
  var id = this.randomId();
  return {
    id: id,
    merchant_id: this.randomChoice(this.merchant_ids),
    created_at: this.iso8601(),
    creator_id: this.randomUserId(),
    device: this.Device(),
    payment_url: this.PaymentURL(id),
    receipt_url: 'simulated_url://'+this.randomString(30),
    inclusive_tax_money: this.Money(),
    additive_tax_money: this.Money(),
    tax_money: this.Money(),
    tip_money: this.Money(),
    discount_money: this.Money(),
    total_money: this.Money(),
    processing_fee_money: this.Money(),
    net_total_money: this.Money(),
    refunded_money: this.Money(),
    swedish_rounding_money: this.Money(),
    gross_sales_money: this.Money(),
    net_sales_money: this.Money(),
    inclusive_tax: this.randomList(1, 'PaymentTax'),
    additive_tax: this.randomList(1, 'PaymentTax'),
    tender: this.randomList(1, 'Tender'),
    refunds: this.randomList(1, 'Refund'),
    itemizations: this.randomList(5, 'PaymentItemization')
  };
}

// https://docs.connect.squareup.com/api/connect/v1#datatype-paymentdiscount
simulateSquare.prototype.PaymentDiscount = function() {
  return {
    name: 'PaymentDiscount: ' + this.randomString(5),
    applied_money: this.Money(),
    discount_id: this.randomId()
  };
}

// https://docs.connect.squareup.com/api/connect/v1#datatype-paymentitemization
simulateSquare.prototype.PaymentItemization = function() {
  // https://docs.connect.squareup.com/api/connect/v1#enum-paymentitemizationtype
  var itemization_type = [
    'ITEM',
    'CUSTOM_AMOUNT',
    'GIFT_CARD_ACTIVATION',
    'GIFT_CARD_RELOAD',
    'GIFT_CARD_UNKNOWN',
    'OTHER'
  ];
  var item = this.randomChoice(this.meals);
  return {
    name: item,
    quantity: this.randomInt(5),
    itemization_type: this.randomChoice(itemization_type),
    item_detail: this.PaymentItemDetail(),
    notes: 'Notes for ' + item,
    variation_name: this.randomChoice(['Adult', 'Child', 'Regular']),
    total_money: this.Money(),
    single_quantity_money: this.Money(),
    gross_sales_money: this.Money(),
    discount_money: this.Money(),
    net_sales_money: this.Money(),
    taxes: this.randomList(1, 'PaymentTax'),
    discounts: this.randomList(1, 'PaymentDiscount'),
    modifiers: this.randomList(2, 'PaymentModifier')
  };
}

// https://docs.connect.squareup.com/api/connect/v1#datatype-paymentitemdetail
simulateSquare.prototype.PaymentItemDetail = function() {
  return {
    category_name: 'Category: ' + this.randomString(5),
    sku: this.randomString(12),
    item_id: this.randomId(),
    item_variation_id: this.randomId()
  };
}

// https://docs.connect.squareup.com/api/connect/v1#datatype-paymentmodifier
simulateSquare.prototype.PaymentModifier = function() {
  return {
    name: this.randomChoice(this.sides), //'PaymentModifier: ' + this.randomString(3),
    applied_money: this.Money(),
    modifier_option_id: this.randomId()
  };
}

// https://docs.connect.squareup.com/api/connect/v1#datatype-paymenttax
simulateSquare.prototype.PaymentTax = function() {
  // https://docs.connect.squareup.com/api/connect/v1#enum-feeinclusiontype
  var feeinclusiontype = [
    'ADDITIVE',
    'INCLUSIVE'
  ];
  return {
    name: 'PaymentTax: ' + this.randomString(5),
    applied_money: this.Money(),
    rate: '',
    inclusion_type: this.randomChoice(feeinclusiontype),
    fee_id: this.randomId()
  };
}

// https://docs.connect.squareup.com/api/connect/v1#datatype-tender
simulateSquare.prototype.Tender = function() {
  // https://docs.connect.squareup.com/api/connect/v1#enum-tendertype
  var type = [
    'CREDIT_CARD',
    'CASH',
    'THIRD_PARTY_CARD',
    'NO_SALE',
    'SQUARE_WALLET',
    'SQUARE_GIFT_CARD',
    'UNKNOWN',
    'OTHER'
  ];
  // https://docs.connect.squareup.com/api/connect/v1#enum-tendercardbrand
  var card_brand = [
    'UNKNOWN',
    'VISA',
    'MASTER_CARD',
    'AMERICAN_EXPRESS',
    'DISCOVER',
    'DISCOVER_DINERS',
    'JCB'
  ];
  // https://docs.connect.squareup.com/api/connect/v1#enum-tenderentrymethod
  var entry_method = [
    'MANUAL',
    'SCANNED',
    'SQUARE_CASH',
    'SQUARE_WALLET',
    'SWIPE',
    'WEB_FORM',
    'OTHER'
  ];
  return {
    id: this.randomId(),
    type: this.randomChoice(type),
    name: 'Tender: ' + this.randomString(3),
    employee_id: this.randomChoice(this.employee_ids),
    receipt_url: 'simulated_url://' + this.randomString(12),
    card_brand: this.randomChoice(card_brand),
    pan_suffix: '',
    entry_method: this.randomChoice(entry_method),
    payment_note: 'Payment Note goes here',
    total_money: this.Money(),
    tendered_money: this.Money(),
    change_back_money: this.Money(),
    refunded_money: this.Money()
  };
}

// https://docs.connect.squareup.com/api/connect/v1#datatype-refund
simulateSquare.prototype.Refund = function() {
  // https://docs.connect.squareup.com/api/connect/v1#enum-refundtype
  var type = [
    'FULL',
    'PARTIAL'
  ];
  return {
    type: this.randomChoice(type),
    reason: 'Refund: ' + this.randomString(5),
    refunded_money: this.Money(),
    created_at: this.iso8601(),
    processed_at: this.iso8601(),
    payment_id: this.randomId(),
    merchant_id: this.randomChoice(this.merchant_ids)
  };
}
