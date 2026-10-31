// The on-screen parts of the game: hotbar, item menu, chat and info panels.
import { ALL_ITEMS, HAMMER, BRUSH, SCRAPER, TABS, SEARCH_WORDS, itemName } from './items.js';
import { BLOCKS, PAINT_COLORS, PAINT_NAMES } from './shared/blocks.js';
import { RECIPES } from './structures.js';

export const CUSTOM_PAINT = 16; // the paint number for "your own color"

const $ = id => document.getElementById(id);

export const CONTROLS = [
  ['W A S D', 'Move'], ['Mouse', 'Look'], ['Space', 'Jump'], ['Click', 'Use item'],
  ['Right click', 'Doors, cars, pets, beds, sit down'], ['Hammer', '3 hits to break'], ['Middle click', 'Copy block'],
  ['1–9 / Wheel', 'Pick item'], ['Q', 'Swap back to the last item'], ['E', 'Items & Build Book'], ['Shift', 'Sprint'],
  ['Ctrl / C', "Crouch (you won't fall off edges)"], ['F', 'Fly (Space / C)'],
  ['V', 'Camera view'], ['G', 'Dance!'], ['B', 'Wave'], ['T / Enter', 'Chat'], ['R', 'Go home (bed, your land, or town)'],
  ['P', 'Take a photo'], ['H', 'Hide the HUD (for photos)'], ['Z', 'Undo your last Fill or Paste'],
];

export const TOUCH_CONTROLS = [
  ['Left thumb', 'Joystick: walk (push it all the way to run)'], ['Right side', 'Drag to look around'],
  ['Tap', 'Use item (keep your finger still to keep hammering)'], ['⬆', 'Jump (tap twice to fly)'], ['⬇', 'Crouch (or fly down)'],
  ['✋', 'Doors, cars, pets, beds'], ['🚪', 'Get out of a vehicle'], ['Hotbar', 'Tap to pick an item'],
  ['🎒', 'Items & Build Book'], ['🎥', 'Camera view'], ['💃', 'Dance!'], ['💬', 'Chat'], ['⏸', 'Pause, go home, settings'],
];

const isTouch = () => document.body.classList.contains('touch');

// On phones, "click" and keyboard keys in messages become taps and the on-screen pads.
const TOUCH_WORDS = [
  [/Right-click or E/g, 'Tap ✋'], [/right-click or E/gi, 'tap ✋'], [/Right-click/g, 'Tap ✋'], [/right-click/g, 'tap ✋'],
  [/Press E to get out/g, 'Tap 🚪 to get out'], [/\(E\)/g, '(🚪)'], [/Press E to see the Build Book/g, 'Tap 🎒 to see the Build Book'],
  [/Press R to come back here/g, 'Pause ⏸ and tap Go Home to come back here'],
  [/hold W or Space to climb/g, 'push the joystick up to climb'], [/W \/ Space: up · S: down/g, 'Joystick up / down'],
  [/Hold the mouse button to/g, 'Keep your finger still to'], [/ · Scroll[^·]*/g, ''],
  [/\bClick\b/g, 'Tap'], [/\bclick\b/g, 'tap'],
];
export const forTouch = text => (isTouch() && text ? TOUCH_WORDS.reduce((t, [a, b]) => t.replace(a, b), text) : text);

export function renderControls(el) {
  el.textContent = '';
  for (const [keys, what] of isTouch() ? TOUCH_CONTROLS : CONTROLS) {
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
  constructor({ icons, settings, sounds, onChange, onPaint }) {
    this.icons = icons;
    this.settings = settings;
    this.sounds = sounds;
    this.onPaint = onPaint; // called with a paint color number when one is picked
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
      // Tap a slot to pick it (on phones).
      slot.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse') return;
        e.preventDefault();
        this.select(i);
      });
      bar.append(slot);
    });
    this.onChange(this.item);
  }

  select(i) {
    const next = (i + 9) % 9;
    if (next !== this.selected) this.prevSelected = this.selected; // for Q: swap back
    this.selected = next;
    [...$('hotbar').children].forEach((s, j) => s.classList.toggle('active', j === this.selected));
    [...($('inv-hotbar')?.children || [])].forEach((s, j) => s.classList.toggle('active', j === this.selected));
    this.onChange(this.item);
    $('item-name').textContent = itemName(this.item);
    $('item-name').style.opacity = 1;
    this.itemNameTimer = 1.5;
  }

  // Puts an item in the selected slot. The hammer always stays in slot 1, so new
  // things go in slot 2 when slot 1 is selected.
  setSlot(item) {
    if (item === HAMMER) {
      this.select(0);
      return;
    }
    if (this.selected === 0) this.selected = 1;
    this.settings.hotbar[this.selected] = item;
    this.buildHotbar();
    this.buildInvHotbar();
    this.select(this.selected);
  }

  // ---------- The item menu ----------
  // Tabs along the top (so there's no long list to scroll through), a search box, the
  // things you picked most recently, and your hotbar along the bottom. Click an item to put
  // it in the glowing slot, drag it onto any slot, or point at it and press 1-9.

  buildInventory() {
    this.tab = TABS.some(t => t.id === this.settings.invTab) ? this.settings.invTab : 'blocks';
    this.hovered = null;
    const tabs = $('inv-tabs');
    tabs.textContent = '';
    for (const t of TABS) {
      const b = document.createElement('button');
      b.className = 'inv-tab';
      b.dataset.tab = t.id;
      b.innerHTML = `<span class="inv-tab-icon">${t.icon}</span><span class="inv-tab-name">${t.name}</span>`;
      b.title = t.name;
      b.addEventListener('click', () => {
        this.showTab(t.id);
        this.sounds.click();
      });
      tabs.append(b);
    }
    const search = $('inv-search');
    search.addEventListener('input', () => this.renderGrid());
    search.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        if (search.value) search.value = '';
        search.blur();
        this.renderGrid();
      } else if (e.key === 'Enter') {
        // Enter picks the first thing found.
        const first = this.found()[0];
        if (first !== undefined) this.pick(first);
        search.blur();
      }
    });
    this.buildInvHotbar();
    this.showTab(this.tab);
    this.showName(null);
  }

  showTab(id) {
    this.tab = id;
    this.settings.invTab = id;
    $('inv-search').value = '';
    for (const b of $('inv-tabs').children) b.classList.toggle('active', b.dataset.tab === id);
    this.renderGrid();
  }

  // Next or previous tab (Tab key, or the arrow keys).
  stepTab(dir) {
    const i = TABS.findIndex(t => t.id === this.tab);
    this.showTab(TABS[(i + dir + TABS.length) % TABS.length].id);
  }

  // Everything whose name (or a word about it) matches what's typed in the search box.
  found() {
    const q = $('inv-search').value.trim().toLowerCase();
    if (!q) return [];
    return ALL_ITEMS.filter(i => !(typeof i === 'number' && BLOCKS[i].hidden))
      .filter(i => `${itemName(i)} ${SEARCH_WORDS[i] || ''}`.toLowerCase().includes(q));
  }

  renderGrid() {
    const grid = $('inventory-grid');
    grid.textContent = '';
    grid.scrollTop = 0;
    const q = $('inv-search').value.trim();
    if (q) {
      const list = this.found();
      this.section(grid, list.length ? `🔍 ${list.length} found` : '🔍 Nothing found. Try another word!');
      this.items(grid, list);
      return;
    }
    const recent = (this.settings.recent || []).filter(i => ALL_ITEMS.includes(i)).slice(0, 8);
    if (this.tab === 'paint') {
      this.buildPaints(grid);
      this.items(grid, [BRUSH, SCRAPER]);
      return;
    }
    if (this.tab === 'book') {
      this.buildBook(grid);
      return;
    }
    if (recent.length) {
      this.section(grid, '🕘 Recently used');
      this.items(grid, recent, 'recent');
    }
    const tab = TABS.find(t => t.id === this.tab);
    this.section(grid, `${tab.icon} ${tab.name}`);
    this.items(grid, tab.items);
  }

  section(grid, text) {
    const h = document.createElement('div');
    h.className = 'inv-section';
    h.textContent = text;
    grid.append(h);
  }

  items(grid, list, extraClass = '') {
    for (const item of list) {
      const el = document.createElement('div');
      el.className = `inv-item ${extraClass}`;
      el.draggable = true;
      const label = document.createElement('div');
      label.className = 'inv-label';
      label.textContent = itemName(item);
      el.append(this.iconCanvas(item), label);
      el.addEventListener('click', () => this.pick(item));
      el.addEventListener('pointerenter', () => {
        this.hovered = item;
        this.showName(item);
      });
      el.addEventListener('pointerleave', () => {
        if (this.hovered === item) this.hovered = null;
        this.showName(null);
      });
      el.addEventListener('dragstart', e => {
        this.dragging = item;
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', String(item));
      });
      el.addEventListener('dragend', () => (this.dragging = null));
      grid.append(el);
    }
  }

  showName(item) {
    $('inv-name').textContent = item === null
      ? (isTouch() ? 'Tap an item to put it in the glowing slot. Tap a slot to choose it.' : 'Click an item to put it in the glowing slot · Drag it onto any slot · Or point at it and press 1–9')
      : `${itemName(item)}${isTouch() ? '' : '  ·  press 1–9 to put it in that slot'}`;
  }

  // Puts an item in a hotbar slot (the selected one if no slot is given).
  pick(item, slot = null) {
    if (slot !== null && item !== HAMMER) {
      if (slot === 0) slot = 1; // the hammer keeps slot 1
      this.selected = slot;
    }
    this.setSlot(item);
    this.remember(item);
    this.sounds.click();
  }

  remember(item) {
    const recent = (this.settings.recent || []).filter(i => i !== item);
    recent.unshift(item);
    this.settings.recent = recent.slice(0, 12);
  }

  // The hotbar again, inside the menu: shows where things go, and you can drop things on it.
  buildInvHotbar() {
    const bar = $('inv-hotbar');
    if (!bar) return;
    bar.textContent = '';
    this.settings.hotbar.forEach((item, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot' + (i === this.selected ? ' active' : '') + (i === 0 ? ' locked' : '');
      slot.title = i === 0 ? 'The hammer always stays in slot 1' : itemName(item);
      const num = document.createElement('span');
      num.textContent = i + 1;
      slot.append(this.iconCanvas(item), num);
      slot.addEventListener('click', () => {
        this.select(i);
        this.buildInvHotbar();
      });
      slot.addEventListener('dragover', e => {
        if (this.dragging === null || this.dragging === undefined || i === 0) return;
        e.preventDefault();
        slot.classList.add('drop');
      });
      slot.addEventListener('dragleave', () => slot.classList.remove('drop'));
      slot.addEventListener('drop', e => {
        e.preventDefault();
        slot.classList.remove('drop');
        if (this.dragging !== null && this.dragging !== undefined) this.pick(this.dragging, i);
        this.dragging = null;
      });
      bar.append(slot);
    });
  }

  // Keys while the item menu is open. Returns true if it used the key.
  inventoryKey(e) {
    if (e.code.startsWith('Digit') && e.code !== 'Digit0') {
      const n = Number(e.code.slice(5)) - 1;
      if (this.hovered !== null) this.pick(this.hovered, n);
      else {
        this.select(n);
        this.buildInvHotbar();
      }
      return true;
    }
    if (e.code === 'Tab' || e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
      e.preventDefault();
      this.stepTab(e.code === 'ArrowLeft' || e.shiftKey ? -1 : 1);
      return true;
    }
    // Start typing to search.
    if (/^Key[A-Z]$/.test(e.code) && e.code !== 'KeyE' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      $('inv-search').focus();
      return true;
    }
    return false;
  }

  // Paint colors: picking one also puts the Paint Brush in your hand.
  buildPaints(grid) {
    const h = document.createElement('div');
    h.className = 'inv-section';
    h.textContent = '🎨 Pick a color, then click the sides of blocks with the Paint Brush (the Balloon is this color too!)';
    grid.append(h);
    const row = document.createElement('div');
    row.className = 'paint-row';
    PAINT_COLORS.forEach((color, i) => {
      if (!color) return;
      const b = document.createElement('button');
      b.className = 'swatch' + (this.settings.paint === i ? ' selected' : '');
      b.style.background = color;
      b.title = PAINT_NAMES[i];
      b.addEventListener('click', () => {
        this.settings.paint = i;
        [...row.children].forEach(c => c.classList.toggle('selected', c === b));
        this.onPaint?.(i);
        this.sounds.click();
      });
      row.append(b);
    });
    // Your own color: tap it to pick any color you like.
    const own = document.createElement('label');
    own.className = 'swatch own' + (this.settings.paint === CUSTOM_PAINT ? ' selected' : '');
    own.title = 'Your own color';
    own.style.background = this.settings.customColor;
    const input = document.createElement('input');
    input.type = 'color';
    input.value = this.settings.customColor;
    const choose = () => {
      this.settings.customColor = input.value;
      this.settings.paint = CUSTOM_PAINT;
      own.style.background = input.value;
      [...row.children].forEach(c => c.classList.toggle('selected', c === own));
      this.onPaint?.(CUSTOM_PAINT);
    };
    input.addEventListener('input', choose);
    input.addEventListener('click', choose);
    own.append(input);
    row.append(own);
    grid.append(row);
  }

  // The Build Book: special things you can make out of blocks.
  buildBook(grid) {
    const h = document.createElement('div');
    h.className = 'inv-section';
    h.textContent = '📖 Arrange blocks like this to make something special';
    grid.append(h);
    const book = document.createElement('div');
    book.className = 'book';
    grid.append(book);
    for (const r of RECIPES) {
      const card = document.createElement('div');
      card.className = 'recipe';
      const pic = document.createElement('div');
      pic.className = 'recipe-pic';
      const rows = r.side || r.grid;
      pic.style.gridTemplateColumns = `repeat(${rows[0].length}, 26px)`;
      for (const row of rows)
        for (const id of row) {
          const cell = document.createElement('div');
          if (id) cell.append(this.iconCanvas(id));
          pic.append(cell);
        }
      const text = document.createElement('div');
      const title = document.createElement('b');
      title.textContent = `${r.icon} ${r.name}`;
      const how = document.createElement('div');
      how.textContent = r.how + (r.side ? ' (side view)' : ' (seen from above)');
      const use = document.createElement('div');
      use.className = 'recipe-use';
      use.textContent = r.use;
      text.append(title, how, use);
      card.append(pic, text);
      book.append(card);
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
    line.append(document.createTextNode(msg.system ? forTouch(msg.text) : msg.text));
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
    text = forTouch(text);
    if ($('target-hint').textContent !== text) $('target-hint').textContent = text;
  }

  setCarHelp(kind) {
    const el = $('car-help');
    el.classList.toggle('hidden', !kind);
    if (!kind) return;
    el.innerHTML = kind === 'passenger'
      ? '<kbd>Mouse</kbd> Look around <kbd>V</kbd> Camera <kbd>E</kbd> Get out'
      : kind === 'boat'
        ? '<kbd>W</kbd> Go <kbd>S</kbd> Slow down / back up <kbd>A</kbd><kbd>D</kbd> Steer <kbd>Shift</kbd> Boost <kbd>H</kbd> Horn <kbd>V</kbd> Camera <kbd>E</kbd> Get out'
        : kind === 'heli'
      ? '<kbd>Mouse</kbd> Steer <kbd>Space</kbd> Up <kbd>Shift</kbd> Down <kbd>W</kbd><kbd>S</kbd> Tilt <kbd>A</kbd><kbd>D</kbd> Slide <kbd>V</kbd> Camera <kbd>E</kbd> Get out'
      : '<kbd>W</kbd><kbd>S</kbd> Drive <kbd>A</kbd><kbd>D</kbd> Steer <kbd>Space</kbd> Brake ' +
        '<kbd>Shift</kbd> Boost <kbd>H</kbd> Horn ' + (kind === 'police' ? '<kbd>G</kbd> Siren ' : '') +
        '<kbd>V</kbd> Camera <kbd>E</kbd> Get out';
  }

  setVehicleInfo(text) {
    const el = $('vehicle-hud');
    el.classList.toggle('hidden', !text);
    if (text && el.textContent !== text) el.textContent = text;
  }

  toast(text) {
    const el = $('toast');
    el.textContent = forTouch(text);
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
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
