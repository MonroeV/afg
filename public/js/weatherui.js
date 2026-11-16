// Stormy's menu at the weather station: what shall it rain? A big picture for each shower, with
// its price (dimmed if you haven't enough coins yet). See SHOWERS in shared/weather.js.
import { SHOWERS, SHOWER_KINDS } from './shared/weather.js';

export class WeatherPicker {
  constructor({ onPick, onClose }) {
    Object.assign(this, { onPick, onClose });
    this.el = document.createElement('div');
    this.el.id = 'weather-picker';
    this.el.className = 'screen hidden';
    this.el.innerHTML = `<div class="panel game-panel weather-panel">
      <button class="pet-close secondary" title="Close">✖</button>
      <h2>⛅ ❓</h2>
      <div class="weather-choices"></div>
    </div>`;
    document.body.append(this.el);
    this.el.querySelector('.pet-close').addEventListener('click', () => this.close());
    this.el.addEventListener('pointerdown', e => e.target === this.el && this.close());
  }

  get open() {
    return !this.el.classList.contains('hidden');
  }

  show(coins) {
    const list = this.el.querySelector('.weather-choices');
    list.textContent = '';
    for (const kind of SHOWER_KINDS) {
      const s = SHOWERS[kind];
      const b = document.createElement('button');
      b.dataset.kind = kind;
      b.className = coins >= s.price ? '' : 'poor';
      b.innerHTML = `<span class="big">${s.icon}</span>${s.song ? '🎵 ' : ''}🪙 ${s.price}`;
      b.addEventListener('click', () => {
        this.close();
        this.onPick(kind);
      });
      list.append(b);
    }
    this.el.classList.remove('hidden');
  }

  close() {
    if (!this.open) return;
    this.el.classList.add('hidden');
    this.onClose();
  }
}
