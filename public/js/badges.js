// The badge book: every club (see shared/clubs.js) as a big badge with a ring that fills up as you
// go, its tasks as pictures with little progress bars, and the prize. Hardly any words: a kid can
// see at a glance what to do and how close they are. Plus the little "🔧 2/3" pop when a task
// moves on, and a celebration when a badge is earned.
import { CLUBS, clubById } from './shared/clubs.js';

const $ = id => document.getElementById(id);

// The Secret Agency, shown in the book like the clubs (it keeps its own TOP SECRET files).
const AGENCY = {
  id: 'agency', name: 'Secret Agency', icon: '🕶️', color: '#546e7a', leader: 'Agent Shadow', where: 'on the town square',
  tasks: [{ id: 'files', icon: '🗂️', goal: 3, what: 'Find the TOP SECRET files' }],
  reward: { coins: 0, perk: '🕶️', perkName: 'Top Secret clearance: the secret base' },
};

export class BadgeBook {
  constructor({ onOpen, onClose, sounds }) {
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.sounds = sounds;
    this.clubs = {};
    this.badges = [];
    this.agent = { files: 0, need: 3, clear: false };
    this.open = false;
    $('badges-done').addEventListener('click', () => this.close());
    $('badge-chip').addEventListener('click', () => this.show());
    $('badge-win').addEventListener('click', () => $('badge-win').classList.add('hidden'));
  }

  get all() {
    return [...CLUBS, { ...AGENCY, tasks: [{ ...AGENCY.tasks[0], goal: this.agent.need || 3 }] }];
  }

  // From the wallet: how far along everything is.
  set({ clubs, badges, agent }) {
    if (clubs) this.clubs = clubs;
    if (badges) this.badges = badges;
    if (agent) this.agent = agent;
    const earned = this.badges.length + (this.agent.clear ? 1 : 0);
    const chip = $('badge-chip');
    chip.classList.remove('hidden');
    chip.querySelector('span').textContent = `${earned}/${this.all.length}`;
    if (this.open) this.render();
  }

  count(club, task) {
    if (club.id === 'agency') return this.agent.clear ? task.goal : this.agent.files;
    return this.clubs[club.id]?.[task.id] || 0;
  }

  earned(club) {
    return club.id === 'agency' ? this.agent.clear : this.badges.includes(club.id);
  }

  show(focus = null) {
    this.open = true;
    this.focus = focus;
    this.render();
    $('badges').classList.remove('hidden');
    this.onOpen?.();
    if (focus) document.querySelector(`.club[data-club="${focus}"]`)?.scrollIntoView({ block: 'center' });
  }

  close() {
    if (!this.open) return;
    this.open = false;
    $('badges').classList.add('hidden');
    this.onClose?.();
  }

  render() {
    const grid = $('badge-grid');
    grid.textContent = '';
    for (const club of this.all) {
      const done = this.earned(club);
      const parts = club.tasks.map(t => Math.min(1, this.count(club, t) / t.goal));
      const k = parts.reduce((a, b) => a + b, 0) / parts.length;
      const card = el('div', `club${done ? ' done' : ''}${club.id === this.focus ? ' focus' : ''}`);
      card.dataset.club = club.id;
      card.style.setProperty('--c', club.color);
      card.style.setProperty('--k', done ? 1 : k);
      const badge = el('div', 'club-badge', club.icon);
      if (done) badge.append(el('i', 'club-check', '✓'));
      card.append(badge, el('div', 'club-name', club.name));
      const who = el('div', 'club-who', `👤 ${club.leader}`);
      who.title = club.where;
      card.append(who);
      const tasks = el('div', 'club-tasks');
      for (const t of club.tasks) {
        const n = this.count(club, t), row = el('div', `task${n >= t.goal ? ' full' : ''}`);
        row.title = t.what; // (for grown-ups, and anyone who wants the words)
        const bar = el('div', 'task-bar');
        bar.append(el('i'));
        bar.firstChild.style.width = `${Math.min(100, (n / t.goal) * 100)}%`;
        row.append(el('span', 'task-icon', t.icon), bar, el('b', '', n >= t.goal ? '✓' : t.goal > 50 ? `${Math.round((n / t.goal) * 100)}%` : `${n}/${t.goal}`));
        tasks.append(row);
      }
      card.append(tasks);
      const prize = el('div', 'club-prize', `🎁 ${club.reward.coins ? `${club.reward.coins}🪙 + ` : ''}${club.reward.perk}`);
      prize.title = club.reward.perkName;
      card.append(prize);
      grid.append(card);
    }
  }

  // A task moved on: a little pop by the badge counter.
  step({ club, task, n, goal }) {
    const c = clubById(club), t = c?.tasks.find(k => k.id === task);
    if (!t) return;
    const was = this.clubs[club]?.[task] || 0;
    (this.clubs[club] ??= {})[task] = n;
    if (goal > 50 && Math.floor((was / goal) * 4) === Math.floor((n / goal) * 4)) return; // (long ones pop every quarter)
    const pop = el('div', 'badge-pop', `${t.icon} ${goal > 50 ? `${Math.round((n / goal) * 100)}%` : `${n}/${goal}`}`);
    pop.style.setProperty('--c', c.color);
    $('badge-pops').append(pop);
    setTimeout(() => pop.remove(), 2200);
    $('badge-chip').classList.add('bump');
    setTimeout(() => $('badge-chip').classList.remove('bump'), 200);
    this.sounds?.tone?.(660 + Math.min(8, n) * 60, 990, 0.12, 0.12, 'triangle');
    if (this.open) this.render();
  }

  // A whole badge: a big celebration.
  win({ club, coins }) {
    const c = club === 'agency' ? AGENCY : clubById(club);
    if (!c) return;
    const win = $('badge-win');
    win.style.setProperty('--c', c.color);
    win.querySelector('.win-badge').textContent = c.icon;
    win.querySelector('.win-name').textContent = c.name;
    win.querySelector('.win-prize').textContent = `${coins ? `+${coins} 🪙   ` : ''}${c.reward.perk}`;
    win.querySelector('.win-prize').title = c.reward.perkName;
    win.classList.remove('hidden');
    win.classList.remove('go');
    void win.offsetWidth; // (restart the animation)
    win.classList.add('go');
    clearTimeout(this.winTimer);
    this.winTimer = setTimeout(() => win.classList.add('hidden'), 4500);
  }
}

function el(tag, cls = '', text = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
