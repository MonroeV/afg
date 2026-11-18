// Food and hunger. Everybody gets hungry as they play (from full to empty in about 25 minutes),
// and the hungrier you are the slower you go, but never slower than three-quarters speed (this is
// for kids, and some might not know to eat). Eat to fill up again: food from the grocery store
// (it goes in your lunchbox 🍱 till you eat it), meals at the restaurants (eaten there and then),
// the crops you grow, and anything you catch when it rains food.
export const HUNGER_FULL = 100;
export const HUNGER_MINUTES = 25; // full to empty, playing
export const SLOWEST = 0.75; // as slow as hunger makes you
// How fast you go at this hunger level: full speed till you're half empty, then a little slower.
export const hungerSpeed = h => (h >= 50 ? 1 : SLOWEST + (1 - SLOWEST) * Math.max(0, h) / 50);

// What there is to eat: its picture, name, how much it fills you (out of 100), and its price at
// the store that sells it (`store`; none: you can only grow it, or get it some other way).
export const FOODS = {
  apple: { icon: '🍎', name: 'Apple', fill: 15, price: 1, store: 'grocery' },
  banana: { icon: '🍌', name: 'Banana', fill: 15, price: 1, store: 'grocery' },
  cookie: { icon: '🍪', name: 'Cookie', fill: 10, price: 1, store: 'grocery' },
  milk: { icon: '🥛', name: 'Milk', fill: 20, price: 2, store: 'grocery' },
  bread: { icon: '🍞', name: 'Bread', fill: 25, price: 2, store: 'grocery' },
  cheese: { icon: '🧀', name: 'Cheese', fill: 20, price: 2, store: 'grocery' },
  sandwich: { icon: '🥪', name: 'Sandwich', fill: 40, price: 3, store: 'grocery' },
  watermelon: { icon: '🍉', name: 'Watermelon', fill: 45, price: 4, store: 'grocery' },
  // From the garden (picked crops go in your lunchbox too).
  carrot: { icon: '🥕', name: 'Carrot', fill: 12 },
  strawberry: { icon: '🍓', name: 'Strawberries', fill: 12 },
  sunseeds: { icon: '🌻', name: 'Sunflower Seeds', fill: 8 },
  pumpkin: { icon: '🎃', name: 'Pumpkin', fill: 30 },
};
export const FOOD_KINDS = Object.keys(FOODS);
export const foodItem = f => `food_${f}`;
export const itemFood = item => (typeof item === 'string' && item.startsWith('food_') && FOODS[item.slice(5)] ? item.slice(5) : null);
export const MAX_PANTRY = 30; // of each kind in your lunchbox
// What a crop gives you when you pick it (see the garden in game.js).
export const CROP_FOOD = { 131: 'carrot', 132: 'strawberry', 133: 'sunseeds', 134: 'pumpkin' };
