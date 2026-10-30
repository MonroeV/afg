// The on-screen parts of the game: hotbar, item menu, chat and info panels.
import { ALL_ITEMS, HAMMER, FIREWORKS, isCarItem, itemName } from './items.js';
import { BLOCKS } from './shared/blocks.js';

const $ = id => document.getElementById(id);

export const CONTROLS = [
  ['W A S D', 'Move'], ['Mouse', 'Look'], ['Space', 'Jump'], ['Click', 'Use item'],
  ['Right click', 'Break'], ['Middle click', 'Copy block'], ['1–9 / Wheel', 'Pick item'],
  ['E', 'Items / get in car'], ['Shift', 'Sprint'], ['F', 'Fly (Space/C)'], ['V', 'Camera view'],
  ['G', 'Dance!'], ['B', 'Wave'], ['T / Enter', 'Chat'], ['R', 'Back to town'],
];

export function renderControls(el) {
  el.textContent = '';
  for (const [keys, what] of CONTROLS) {
    const row = document.createElement('div');
    for (const k of keys.split(' / ')) {
      const kbd = document.createElement('kbd');
      kbd.textContent = k;
      row.append(kbd);
    }
    row.append(document.createTextNode(' ' + what));
    el.append(row);
  }
}

export class Hud {
  constructor({ icons, settings, sounds, onChange }) {
    this.icons = icons;
    this.settings = settings;
    this.sounds = sounds;
    this.onChange = onChange; // called when the selected item changes
    this.selected = 0;
    this.itemNameTimer = 0;
    this.chatOpen = false;
    this.buildHotbar();
    this.buildInventory();
  }

  get item() {
    return this.settings.hotbar[this.selected];
  }

  iconCanvas(item) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    c.getContext('2d').drawImage(this.icons[item], 0, 0);
    return c;
  }

  buildHotbar() {
    const bar = $('hotbar');
    bar.textContent = '';
    this.settings.hotbar.forEach((item, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot' + (i === this.selected ? ' active' : '');
      const num = document.createElement('span');
      num.textContent = i + 1;
      slot.append(this.iconCanvas(item), num);
      bar.append(slot);
    });
    this.onChange(this.item);
  }

  select(i) {
    this.selected = (i + 9) % 9;
    [...$('hotbar').children].forEach((s, j) => s.classList.toggle('active', j === this.selected));
    this.onChange(this.item);
    $('item-name').textContent = itemName(this.item);
    $('item-name').style.opacity = 1;
    this.itemNameTimer = 1.5;
  }

  setSlot(item) {
    this.settings.hotbar[this.selected] = item;
    this.buildHotbar();
    this.select(this.selected);
  }

  buildInventory() {
    const grid = $('inventory-grid');
    grid.textContent = '';
    const sections = [
      ['🧰 Tools & Toys', i => i === HAMMER || i === FIREWORKS || isCarItem(i)],
      ['🧱 Building Blocks', i => typeof i === 'number' && !BLOCKS[i].shape],
      ['🏡 Town Stuff', i => typeof i === 'number' && !!BLOCKS[i].shape],
    ];
    for (const [title, test] of sections) {
      const h = document.createElement('div');
      h.className = 'inv-section';
      h.textContent = title;
      grid.append(h);
      for (const item of ALL_ITEMS.filter(test)) {
        const el = document.createElement('div');
        el.className = 'inv-item';
        const label = document.createElement('div');
        label.textContent = itemName(item);
        el.append(this.iconCanvas(item), label);
        el.addEventListener('click', () => {
          this.setSlot(item);
          this.sounds.click();
        });
        grid.append(el);
      }
    }
  }

  // ---------- Chat ----------

  addChat(msg) {
    const line = document.createElement('div');
    line.className = 'chat-line' + (msg.system ? ' system' : '');
    if (msg.name) {
      const who = document.createElement('b');
      who.textContent = msg.name + ': ';
      who.style.color = msg.color || '#fff';
      line.append(who);
    }
    line.append(document.createTextNode(msg.text));
    const log = $('chat-log');
    log.append(line);
    while (log.children.length > 40) log.firstChild.remove();
    setTimeout(() => line.classList.add('faded'), 9000);
  }

  openChat() {
    this.chatOpen = true;
    $('chat').classList.add('open');
    $('chat-input').focus();
  }

  closeChat() {
    this.chatOpen = false;
    $('chat').classList.remove('open');
    $('chat-input').value = '';
    $('chat-input').blur();
  }

  // ---------- Text panels ----------

  setHint(text) {
    if ($('target-hint').textContent !== text) $('target-hint').textContent = text;
  }

  setCarHelp(kind) {
    const el = $('car-help');
    el.classList.toggle('hidden', !kind);
    if (!kind) return;
    el.innerHTML = '<kbd>W</kbd><kbd>S</kbd> Drive <kbd>A</kbd><kbd>D</kbd> Steer <kbd>Space</kbd> Brake ' +
      '<kbd>Shift</kbd> Boost <kbd>H</kbd> Horn ' + (kind === 'police' ? '<kbd>G</kbd> Siren ' : '') +
      '<kbd>V</kbd> Camera <kbd>E</kbd> Get out';
  }

  updateInfo({ online, fps, pos, flying, clock }) {
    $('info').innerHTML =
      `<div id="clock">${clock}</div>` +
      `${online ? '<span style="color:#7dff8a">● Online</span>' : '<span style="color:#ffb3b3">● Single player</span>'} · ${fps} FPS<br>` +
      `XYZ ${pos.x.toFixed(0)} ${pos.y.toFixed(0)} ${pos.z.toFixed(0)}${flying ? ' · <b>FLYING</b>' : ''}`;
  }

  updatePlayers(people) {
    const list = $('players');
    list.textContent = '';
    const head = document.createElement('div');
    head.textContent = `${people.length} builder${people.length === 1 ? '' : 's'}`;
    list.append(head);
    for (const { name, color } of people) {
      const row = document.createElement('div');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = color;
      row.append(document.createTextNode(name), dot);
      list.append(row);
    }
  }

  update(dt) {
    if (this.itemNameTimer > 0) {
      this.itemNameTimer -= dt;
      if (this.itemNameTimer <= 0) $('item-name').style.opacity = 0;
    }
  }
}
