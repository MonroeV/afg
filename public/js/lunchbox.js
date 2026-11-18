// Your lunchbox 🍱 (press L, or tap the hunger bar): how full you are, and the food you've got
// (from the grocery store, and what you've picked in the garden). Tap something to eat it.
// Nothing in it? A 🛒 points you to the grocery store. See shared/food.js.
import { FOODS, FOOD_KINDS, HUNGER_FULL } from './shared/food.js';

export class Lunchbox {
  constructor({ onEat, onClose }) {
    Object.assign(this, { onEat, onClose });
    this.pantry = {};
    this.hunger = HUNGER_FULL;
    this.el = document.createElement('div');
    this.el.id = 'lunchbox';
    this.el.className = 'screen hidden';
    this.el.innerHTML = `<div class="panel game-panel lunch-panel">
      <button class="pet-close secondary" title="Close">✖</button>
      <h2>🍱</h2>
      <div class="lunch-hunger"><span>🍎</span><span class="hunger-bar big"><i></i></span></div>
      <div class="lunch-foods"></div>
    </div>`;
    document.body.append(this.el);
    this.el.querySelector('.pet-close').addEventListener('click', () => this.close());
    this.el.addEventListener('pointerdown', e => e.target === this.el && this.close());
  }

  get open() {
    return !this.el.classList.contains('hidden');
  }

  // What's in your lunchbox now, and how full you are (it redraws if it's open).
  set({ pantry, hunger }) {
    if (pantry) this.pantry = { ...pantry };
    if (Number.isFinite(hunger)) this.hunger = hunger;
    if (this.open) this.draw();
  }

  show() {
    this.draw();
    this.el.classList.remove('hidden');
  }

  draw() {
    const bar = this.el.querySelector('.hunger-bar');
    bar.querySelector('i').style.width = `${Math.max(0, Math.min(100, (this.hunger / HUNGER_FULL) * 100))}%`;
    bar.classList.toggle('low', this.hunger < 35);
    const list = this.el.querySelector('.lunch-foods');
    list.textContent = '';
    const have = FOOD_KINDS.filter(f => this.pantry[f] > 0);
    if (!have.length) {
      list.innerHTML = '<div class="lunch-empty"><span class="big">🛒</span>🍎🍌🥪🍪 ➡ 🛒</div>';
      return;
    }
    for (const f of have) {
      const food = FOODS[f], b = document.createElement('button');
      b.dataset.food = f;
      b.title = food.name;
      b.innerHTML = `<span class="big">${food.icon}</span>× ${this.pantry[f]}`;
      b.disabled = this.hunger >= HUNGER_FULL;
      b.addEventListener('click', () => this.onEat(f));
      list.append(b);
    }
  }

  close() {
    if (!this.open) return;
    this.el.classList.add('hidden');
    this.onClose();
  }
}
