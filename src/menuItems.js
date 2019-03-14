function menuItems() {
    this.ingredients = [
        'Fried Fish',
        'Baked Fish',
        'Fried Shrimp',
        'Sauteed Shrimp',
        'Baked Combo',
        'Fried Combo',
        'Clam Chowder Soup',
        'Mac & Cheese',
        'Grilled Cheese',
        'French Fries',
        'Red Potato'
    ];
    this.meals = [
        'Fried Fish',
        'Baked Fish',
        'Fried Shrimp',
        'Sauteed Shrimp',
        'Baked Combo',
        'Fried Combo',
        'Grilled Cheese',
        'Mac & Cheese'
    ];
    this.sides = [
        'Mac & Cheese',
        'French Fries',
        'Red Potato'
    ];
    this.types = [
        'MEAL',
        'SIDE',
        'SOUP'
    ];
    this.items = {
        'Fried Fish': new menuItem({
          abbr: 'Fried Fish',
          ingredients: [
            new menuItemIngredient('Fried Fish', 1)
          ],
          serving: 'MEAL'
        }),
        'Fried Fish (Child)': new menuItem({
          abbr: 'Fried Fish',
          ingredients: [
            new menuItemIngredient('Fried Fish', 0.33)
          ],
          serving: 'MEAL'
        }),
        'Baked Fish': new menuItem({
          abbr: 'Baked Fish',
          ingredients: [
            new menuItemIngredient('Baked Fish', 1)
          ],
          serving: 'MEAL'
        }),
        'Baked Fish (Child)': new menuItem({
          abbr: 'Baked Fish',
          ingredients: [
            new menuItemIngredient('Baked Fish', 0.33)
          ],
          serving: 'MEAL'
        }),
        'Fried Shrimp': new menuItem({
          abbr: 'Fried Shrimp',
          ingredients: [
            new menuItemIngredient('Fried Shrimp', 1)
          ],
          serving: 'MEAL'
        }),
        'Fried Shrimp (Child)': new menuItem({
          abbr: 'Fried Shrimp',
          ingredients: [
            new menuItemIngredient('Fried Shrimp', 0.5)
          ],
          serving: 'MEAL'
        }),
        'Sauteed Shrimp': new menuItem({
          abbr: 'Sauteed Shrimp',
          ingredients: [
            new menuItemIngredient('Sauteed Shrimp', 1)
          ],
          serving: 'MEAL'
        }),
        'Sauteed Shrimp (Child)': new menuItem({
          abbr: 'Sauteed Shrimp',
          ingredients: [
            new menuItemIngredient('Sauteed Shrimp', 0.5)
          ],
          serving: 'MEAL'
        }),
        'Baked Combo': new menuItem({
          abbr: 'Baked Combo',
          ingredients: [
            new menuItemIngredient('Baked Fish', 0.67),
            new menuItemIngredient('Sauteed Shrimp', 1)
          ],
          serving: 'MEAL'
        }),
        'Baked Combo (Child)': new menuItem({
          abbr: 'Baked Combo',
          ingredients: [
            new menuItemIngredient('Baked Fish', 0.33),
            new menuItemIngredient('Sauteed Shrimp', 0.5)
          ],
          serving: 'MEAL'
        }),
        'Fried Combo': new menuItem({
          abbr: 'Fried Combo',
          ingredients: [
            new menuItemIngredient('Fried Fish', 0.67),
            new menuItemIngredient('Fried Shrimp', 1)
          ],
          serving: 'MEAL'
        }),
        'Fried Combo (Child)': new menuItem({
          abbr: 'Fried Combo',
          ingredients: [
            new menuItemIngredient('Fried Fish', 0.33),
            new menuItemIngredient('Fried Shrimp', 0.5)
          ],
          serving: 'MEAL'
        }),
        'Mac & Cheese': new menuItem({
          abbr: 'Mac & Cheese',
          ingredients: [
            new menuItemIngredient('Mac & Cheese', 1)
          ],
          serving: 'MEAL'
        }),
        'Grilled Cheese': new menuItem({
          abbr: 'Grilled Cheese',
          ingredients: [
            new menuItemIngredient('Grilled Cheese', 1)
          ],
          serving: 'MEAL'
        }),
        'Clam Chowder Soup': new menuItem({
          abbr: 'Soup',
          ingredients: [
            new menuItemIngredient('Soup', 1)
          ],
          serving: 'SOUP'
        }),
        'French Fries': new menuItem({
          abbr: 'Fries',
          ingredients: [
            new menuItemIngredient('French Fries', 1)
          ],
          serving: 'SIDE'
        }),
        'Red Potato': new menuItem({
          abbr: 'Potato',
          ingredients: [
            new menuItemIngredient('Red Potato', 1)
          ],
          serving: 'SIDE'
        }),
        'Mac & Cheese (Side)': new menuItem({
          abbr: 'M&C',
          ingredients: [
            new menuItemIngredient('Mac & Cheese', 0.5)
          ],
          serving: 'SIDE'
        })
    };
}

menuItems.prototype.servingCount = function(serving_type) {
    var total = 0;
    for (var i in this.items) {
        if (this.items[i].serving === serving_type) {
            total += this.items[i].quantity;
        }
    }
    return total;
}

menuItems.prototype.ingredientTotals = function() {
    var total = {};
    var that = this;
    Object.keys(this.items).forEach(function (key) {
      that.items[key].ingredients.forEach(function (ingredient) {
        if (!(ingredient.name in total)) {
            total[ingredient.name] = 0;
        }
        total[ingredient.name] += that.items[key].quantity * ingredient.quantity;
      });
    });
    return total;
}


function menuItem(obj) {
  this.abbr = obj['abbr'];
  this.ingredients = obj['ingredients'];
  this.serving = obj['serving'];
  this.quantity = 0;

}

menuItem.prototype.increment_quantity = function(quantity) {
    this.quantity += parseInt(quantity)
}

function menuItemIngredient(ingredient, qty) {
    this.name = ingredient;
    this.quantity = qty;
}
