const cadCurrency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

function menuFoodView(food) {
  return Object.freeze({
    ...food,
    price: cadCurrency.format(food.priceCents / 100),
  });
}

function categoryView(category) {
  return Object.freeze({
    name: category,
    url: `/?category=${encodeURIComponent(category)}`,
  });
}

export function createMenuController(menuService) {
  return Object.freeze({
    async show(request, response) {
      const menu = await menuService.getMenu({
        category: request.query.category,
      });

      response.status(200).render("menu", {
        pageTitle: "Menu",
        activePath: "/",
        foods: menu.foods.map(menuFoodView),
        categories: menu.categories.map(categoryView),
        selectedCategory: menu.selectedCategory,
      });
    },
  });
}
