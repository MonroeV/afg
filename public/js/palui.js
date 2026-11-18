// A kid at Friendship Park asking to be your best friend (or, if they're yours already: stay,
// or go home for now). Big pictures, hardly any words.
export class PalAsk {
  constructor({ onAnswer, onClose }) {
    Object.assign(this, { onAnswer, onClose });
    this.el = document.createElement('div');
    this.el.id = 'pal-ask';
    this.el.className = 'screen hidden';
    this.el.innerHTML = `<div class="panel game-panel pal-panel">
      <h2 class="pal-title"></h2>
      <div class="pal-note"></div>
      <div class="pal-choices"><button class="pal-yes"></button><button class="pal-no secondary"></button></div>
    </div>`;
    document.body.append(this.el);
    this.el.querySelector('.pal-yes').addEventListener('click', () => this.answer(true));
    this.el.querySelector('.pal-no').addEventListener('click', () => this.answer(false));
    this.el.addEventListener('pointerdown', e => e.target === this.el && this.close());
  }

  get open() {
    return !this.el.classList.contains('hidden');
  }

  // { id, name, mine (already your best friend), current (your best friend now, if another) }
  show({ id, name, mine, current }) {
    this.id = id;
    this.mine = mine;
    const $ = s => this.el.querySelector(s);
    $('.pal-title').textContent = mine ? `💕 ${name}` : `🤝 ${name}?`;
    $('.pal-note').textContent = mine ? '' : current ? `(👋 ${current} ➡ 🏡)` : '';
    $('.pal-yes').innerHTML = mine ? '<span class="big">💕</span>' : '<span class="big">🤝</span>✅';
    $('.pal-no').innerHTML = mine ? '<span class="big">👋</span>🏡' : '<span class="big">❌</span>';
    this.el.classList.remove('hidden');
  }

  answer(yes) {
    // (Yours already: 💕 keeps them, 👋 sends them home for now. Someone new: 🤝 yes, ❌ no.)
    if (this.mine ? !yes : yes) this.onAnswer(this.id, !this.mine);
    this.close();
  }

  close() {
    if (!this.open) return;
    this.el.classList.add('hidden');
    this.onClose();
  }
}
