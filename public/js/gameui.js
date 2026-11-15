// Coach Kai's games on your screen: picking one (🏃 Tag or 🙈 Hide-and-seek), the banner at the
// top while you're playing (who's it, time left), the dark screen while you count (seeking),
// and who won. Pictures and numbers, hardly any words.
const clock = s => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;

export class GameUI {
  constructor({ onPick, onQuit, onClose }) {
    Object.assign(this, { onPick, onQuit, onClose });
    this.picker = document.createElement('div');
    this.picker.id = 'game-picker';
    this.picker.className = 'screen hidden';
    this.picker.innerHTML = `<div class="panel game-panel">
      <button class="pet-close secondary" title="Close">✖</button>
      <h2>🏃 🙈</h2>
      <div class="game-choices">
        <button data-kind="tag"><span class="big">🏃</span>TAG</button>
        <button data-kind="hide"><span class="big">🙈</span>HIDE & SEEK</button>
      </div>
    </div>`;
    document.body.append(this.picker);
    this.picker.querySelector('.pet-close').addEventListener('click', () => this.closePicker());
    this.picker.addEventListener('pointerdown', e => e.target === this.picker && this.closePicker());
    for (const b of this.picker.querySelectorAll('[data-kind]')) {
      b.addEventListener('click', () => {
        this.closePicker();
        this.onPick(b.dataset.kind);
      });
    }
    this.banner = document.createElement('div');
    this.banner.id = 'game-banner';
    this.banner.className = 'hidden';
    this.banner.innerHTML = '<span class="game-text"></span><button class="game-quit" title="Stop playing">✖</button>';
    this.banner.querySelector('.game-quit').addEventListener('click', () => this.onQuit());
    this.big = document.createElement('div');
    this.big.id = 'game-big';
    this.big.className = 'hidden';
    this.blind = document.createElement('div');
    this.blind.id = 'game-blind';
    this.blind.className = 'hidden';
    document.body.append(this.banner, this.big, this.blind);
    this.state = null;
  }

  get pickerOpen() {
    return !this.picker.classList.contains('hidden');
  }

  openPicker() {
    this.picker.classList.remove('hidden');
  }

  closePicker() {
    if (!this.pickerOpen) return;
    this.picker.classList.add('hidden');
    this.onClose();
  }

  // The game's state from the server (kind null: no game).
  set(state, me) {
    this.state = state.kind ? { ...state, until: performance.now() / 1000 + (state.left || 0) } : null;
    this.me = me;
    this.update();
  }

  get playing() {
    return !!this.state && this.state.ids.includes(this.me);
  }

  // A big message in the middle for a moment ("👉 YOU'RE IT!").
  shout(text, seconds = 2) {
    this.big.textContent = text;
    this.big.classList.remove('hidden');
    clearTimeout(this.bigTimer);
    this.bigTimer = setTimeout(() => this.big.classList.add('hidden'), seconds * 1000);
  }

  // Every frame or so: the banner's countdown, and the dark screen while you count.
  update() {
    const s = this.state;
    const show = s && (this.playing || s.phase === 'over');
    this.banner.classList.toggle('hidden', !show);
    const counting = show && s.kind === 'hide' && s.phase === 'hide' && s.seeker === this.me;
    this.blind.classList.toggle('hidden', !counting);
    if (!show) return;
    const left = Math.max(0, s.until - performance.now() / 1000);
    let text;
    if (s.phase === 'over') text = `🏆 ${(s.winners || []).join(' & ')}`;
    else if (s.kind === 'tag') text = s.it === this.me ? `👉 YOU'RE IT! · ⏱️ ${clock(left)}` : `🏃 ${s.names[s.it] || '?'} 👉 · ⏱️ ${clock(left)}`;
    else {
      const hiding = s.ids.filter(id => id !== s.seeker && !s.found.includes(id)).length;
      text = s.phase === 'hide' ? (s.seeker === this.me ? `🙈 ${Math.ceil(left)}` : `🙈 HIDE! · ${Math.ceil(left)}`) : `👀 ${s.seeker === this.me ? 'FIND THEM!' : s.names[s.seeker]} · 🙈 ${hiding} · ⏱️ ${clock(left)}`;
    }
    const el = this.banner.querySelector('.game-text');
    if (el.textContent !== text) el.textContent = text;
    this.banner.classList.toggle('it', s.kind === 'tag' && s.it === this.me && s.phase !== 'over');
    if (counting) {
      const n = String(Math.ceil(left));
      if (this.blind.textContent !== `🙈 ${n}`) this.blind.textContent = `🙈 ${n}`;
    }
  }
}
