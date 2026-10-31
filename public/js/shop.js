// The Luxe Store's window: everything for sale, what it costs, and a Buy button. (The server
// keeps everyone's coins and decides what they can buy.)
import { BLOCKS, SHOP_ITEMS, SHOP_TOOLS, SHOP_ABOUT } from './shared/blocks.js';
import { itemName } from './items.js';

const $ = id => document.getElementById(id);

export class Shop {
  // icons: item -> canvas. onBuy(item) asks the server to buy it.
  constructor({ icons, sounds, onBuy, onClose }) {
    this.icons = icons;
    this.sounds = sounds;
    this.onBuy = onBuy;
    this.onClose = onClose;
    this.coins = 0;
    this.owned = new Set();
    this.isOpen = false;
    $('shop-done').addEventListener('click', () => this.close());
  }

  open() {
    this.isOpen = true;
    $('shop').classList.remove('hidden');
    this.render();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    $('shop').classList.add('hidden');
    this.onClose?.();
  }

  // The wallet changed (bought something, picked up a coin).
  update(coins, owned) {
    this.coins = coins;
    this.owned = new Set(owned);
    if (this.isOpen) this.render();
  }

  render() {
    $('shop-coins').textContent = `🪙 ${this.coins} coin${this.coins === 1 ? '' : 's'}`;
    const grid = $('shop-grid');
    grid.textContent = '';
    for (const [item, price] of SHOP_ITEMS) {
      const card = document.createElement('div');
      card.className = 'shop-card';
      const pic = document.createElement('canvas');
      pic.width = pic.height = 64;
      if (this.icons[item]) pic.getContext('2d').drawImage(this.icons[item], 0, 0);
      const name = document.createElement('b');
      name.textContent = itemName(item);
      const about = document.createElement('div');
      about.className = 'shop-about';
      about.textContent = typeof item === 'number' ? SHOP_ABOUT[item] || BLOCKS[item].name : SHOP_TOOLS[item].about;
      const button = document.createElement('button');
      const owned = this.owned.has(item);
      if (owned) {
        button.textContent = '✓ YOURS';
        button.disabled = true;
        card.classList.add('owned');
      } else if (this.coins < price) {
        button.textContent = `🪙 ${price}`;
        button.disabled = true;
        button.title = `You need ${price - this.coins} more coins`;
      } else {
        button.textContent = `BUY 🪙 ${price}`;
        button.addEventListener('click', () => {
          this.sounds.click();
          this.onBuy(item);
        });
      }
      card.append(pic, name, about, button);
      grid.append(card);
    }
  }
}
