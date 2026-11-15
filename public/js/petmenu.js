// Your pet's menu (right-click your pet): pet it ❤️, tricks to do (holding Pet Treats, it
// practices new ones: 🐾🐾⚪ until it's learned them ⭐), and the hats you've bought for it.
// All pictures, hardly any words.
import { TRICKS, TRICK_TRIES, PET_HATS, HAT_ICONS, hatItem } from './shared/tricks.js';

export class PetMenu {
  constructor({ onPet, onTrick, onHat, onClose }) {
    Object.assign(this, { onPet, onTrick, onHat, onClose });
    this.el = document.createElement('div');
    this.el.id = 'pet-menu';
    this.el.className = 'screen hidden';
    this.el.innerHTML = `<div class="panel pet-panel">
      <button class="pet-close secondary" title="Close">✖</button>
      <button class="pet-love" title="Pet">❤️</button>
      <div class="pet-tricks"></div>
      <div class="pet-hats"></div>
    </div>`;
    document.body.append(this.el);
    this.el.querySelector('.pet-close').addEventListener('click', () => this.close());
    this.el.querySelector('.pet-love').addEventListener('click', () => {
      this.close();
      this.onPet();
    });
    // (Clicking outside the panel closes it too.)
    this.el.addEventListener('pointerdown', e => e.target === this.el && this.close());
  }

  get open() {
    return !this.el.classList.contains('hidden');
  }

  // tricks: how many tries at each; treats: holding Pet Treats; owned: what you've bought; hat: the one it's wearing.
  show({ tricks = {}, treats = false, owned = new Set(), hat = 'none' }) {
    const list = this.el.querySelector('.pet-tricks');
    list.textContent = '';
    for (const t of TRICKS) {
      const n = tricks[t.id] || 0, learned = n >= TRICK_TRIES;
      const b = document.createElement('button');
      b.className = 'pet-trick' + (learned ? ' learned' : '') + (!learned && !treats ? ' locked' : '');
      b.dataset.trick = t.id;
      b.innerHTML = `<span class="big">${t.icon}</span><span class="paws">${learned ? '⭐' : !treats ? '🦴' : '🐾'.repeat(n) + '⚪'.repeat(TRICK_TRIES - n)}</span>`;
      b.addEventListener('click', () => {
        if (!learned && !treats) return this.onTrick(null); // (needs treats to practice)
        this.close();
        this.onTrick(t.id);
      });
      list.append(b);
    }
    const hats = this.el.querySelector('.pet-hats');
    hats.textContent = '';
    const mine = PET_HATS.filter(h => owned.has(hatItem(h)));
    for (const h of mine.length ? ['none', ...mine] : []) {
      const b = document.createElement('button');
      b.className = 'pet-hat' + (h === hat ? ' on' : '');
      b.dataset.hat = h;
      b.textContent = HAT_ICONS[h];
      b.addEventListener('click', () => {
        this.onHat(h);
        hats.querySelectorAll('.pet-hat').forEach(x => x.classList.toggle('on', x === b));
      });
      hats.append(b);
    }
    this.el.classList.remove('hidden');
  }

  close() {
    if (!this.open) return;
    this.el.classList.add('hidden');
    this.onClose();
  }
}
