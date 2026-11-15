// Builder Bea's picture cards (build challenges): what to build, and how much of it is on your
// land already (✓ when there's enough). 🔄 checks again; a card that's done shows ⭐.
import { CHALLENGES } from './shared/challenges.js';

export class ChallengeCards {
  constructor({ onCheck, onClose }) {
    Object.assign(this, { onCheck, onClose });
    this.el = document.createElement('div');
    this.el.id = 'challenges';
    this.el.className = 'screen hidden';
    this.el.innerHTML = `<div class="panel wide challenge-panel">
      <button class="pet-close secondary" title="Close">✖</button>
      <h2>🏗️ 🃏</h2>
      <div class="challenge-noland hidden">🚩❓ <span>Claim some land with the Land Flag first, then build on it!</span></div>
      <div class="challenge-grid"></div>
      <button class="challenge-check" title="Check again">🔄 🔍</button>
    </div>`;
    document.body.append(this.el);
    this.el.querySelector('.pet-close').addEventListener('click', () => this.close());
    this.el.querySelector('.challenge-check').addEventListener('click', () => this.onCheck());
    this.el.addEventListener('pointerdown', e => e.target === this.el && this.close());
  }

  get open() {
    return !this.el.classList.contains('hidden');
  }

  // land: do they have any; list: [{ id, have: [..], done }]; won: cards just finished.
  show({ land, list, won = [] }) {
    this.el.querySelector('.challenge-noland').classList.toggle('hidden', !!land);
    const grid = this.el.querySelector('.challenge-grid');
    grid.textContent = '';
    for (const ch of CHALLENGES) {
      const status = list.find(s => s.id === ch.id) || { have: [], done: false };
      const card = document.createElement('div');
      card.className = 'challenge-card' + (status.done ? ' done' : '') + (won.includes(ch.id) ? ' won' : '');
      card.dataset.id = ch.id;
      const parts = ch.parts.map((p, i) => {
        const have = Math.min(p.n, status.have[i] || 0), ok = status.done || have >= p.n;
        return `<span class="challenge-part${ok ? ' ok' : ''}">${p.icon}<small>${ok ? '✓' : `${have}/${p.n}`}</small></span>`;
      }).join('');
      card.innerHTML = `<div class="challenge-icon">${ch.icon}</div><div class="challenge-parts">${parts}</div><div class="challenge-prize">${status.done ? '⭐' : `🪙 ${ch.coins}`}</div>`;
      card.title = ch.name;
      grid.append(card);
    }
    this.el.classList.remove('hidden');
  }

  close() {
    if (!this.open) return;
    this.el.classList.add('hidden');
    this.onClose();
  }
}
