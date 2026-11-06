// The on-screen parts of the game: hotbar, item menu, chat and info panels.
import { ALL_ITEMS, HAMMER, BRUSH, SCRAPER, GOLDPAINT, TABS, SEARCH_WORDS, GEAR, itemName, fromStore, familyOf } from './items.js';
import { BLOCKS, PAINT_COLORS, PAINT_NAMES, SHOP_TOOLS, FOUND_GEAR, GOLD_PAINT } from './shared/blocks.js';
import { RECIPES } from './structures.js';

export const CUSTOM_PAINT = 16; // the paint number for "your own color"

const $ = id => document.getElementById(id);

export const CONTROLS = [
  ['W A S D', 'Move'], ['Mouse', 'Look'], ['Space', 'Jump'], ['Click', 'Use item'],
  ['Right click', 'Doors, cars, pets, beds, sit down'], ['Hammer', '3 hits to break'], ['Middle click', 'Copy block'],
  ['1–9 / Wheel', 'Pick item'], ['X', 'Next style (lamps, chairs, colors…)'], ['Q', 'Swap back to the last item'], ['E', 'Items, gear & Build Book'], ['Shift', 'Sprint'],
  ['Ctrl / C', "Crouch (you won't fall off edges)"], ['F', 'Fly (Space / C)'],
  ['V', 'Camera view'], ['G', 'Dance! (Driving: siren, camper roof, dump bed)'], ['B', 'Wave'], ['T / Enter', 'Chat'], ['R', 'Go home (bed, your land, or town)'],
  ['P', 'Take a photo'], ['H', 'Hide the HUD (for photos)'], ['Z', 'Undo your last Fill or Paste'],
];

export const TOUCH_CONTROLS = [
  ['Left thumb', 'Joystick: walk (push it all the way to run)'], ['Right side', 'Drag to look around'],
  ['Tap', 'Use item (keep your finger still to keep hammering)'], ['⬆', 'Jump (tap twice to fly)'], ['⬇', 'Crouch (or fly down)'],
  ['✋', 'Doors, cars, pets, beds'], ['🚪', 'Get out of a vehicle'], ['Hotbar', 'Tap to pick an item (tap it again: next style)'],
  ['🎒', 'Items & Build Book'], ['🎥', 'Camera view'], ['💃', 'Dance! (Driving, ⭐: siren, pop-up roof, dump bed)'], ['💬', 'Chat'], ['⏸', 'Pause, go home, settings'],
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
  constructor({ icons, settings, sounds, onChange, onPaint, onGear }) {
    this.icons = icons;
    this.settings = settings;
    this.sounds = sounds;
    this.onPaint = onPaint; // called with a paint color number when one is picked
    this.onChange = onChange; // called when the selected item changes
    this.onGear = onGear; // called with a piece of gear when it's put on or taken off
    this.selected = 0;
    this.itemNameTimer = 0;
    this.chatOpen = false;
    this.owned = new Set(); // things bought at the Luxe Store
    this.foundGear = new Set(); // gear found out in the world (the skis at the lodge)
    settings.styles ||= {};
    settings.gear ||= {};
    this.buildHotbar();
    this.buildInventory();
  }

  get item() {
    return this.settings.hotbar[this.selected];
  }

  iconCanvas(item) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    c.dataset.item = String(item);
    c.getContext('2d').drawImage(this.icons[item], 0, 0);
    return c;
  }

  // Draws an item's picture again everywhere it's shown (the brush, after a new color).
  refreshIcon(item) {
    for (const c of document.querySelectorAll(`canvas[data-item="${item}"]`)) {
      const g = c.getContext('2d');
      g.clearRect(0, 0, 64, 64);
      g.drawImage(this.icons[item], 0, 0);
    }
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
        if (i === this.selected && this.styles(this.item).length > 1) this.nextStyle(1);
        else this.select(i);
      });
      bar.append(slot);
    });
    this.onChange(this.item);
  }

  // ---------- Styles ----------

  // The styles you can use of something's family (just itself if it isn't in one).
  styles(item) {
    const fam = familyOf(item);
    return fam ? fam.items.filter(i => this.usable(i)) : [item];
  }

  // The style of a family to show in the menu: the one you used last.
  styleOf(fam) {
    const list = fam.items.filter(i => this.usable(i));
    const last = this.settings.styles[fam.id];
    return list.includes(last) ? last : list[0] ?? null;
  }

  // A list of items with each family shown once (as the style you used last).
  collapse(list) {
    const out = [], seen = new Set();
    for (const i of list) {
      const fam = familyOf(i);
      if (!fam) {
        if (!out.includes(i)) out.push(i);
        continue;
      }
      if (seen.has(fam.id)) continue;
      seen.add(fam.id);
      const style = this.styleOf(fam);
      if (style !== null) out.push(style);
    }
    return out;
  }

  // What the selected slot's item is called, and how to change its style.
  label(item) {
    const list = this.styles(item);
    if (list.length < 2) return itemName(item);
    return `${itemName(item)}  ·  style ${list.indexOf(item) + 1} of ${list.length}  ·  ${isTouch() ? 'tap again' : 'X'}: next style`;
  }

  // Changes the item in the selected slot to its next (or previous) style.
  nextStyle(dir = 1) {
    const list = this.styles(this.item);
    if (list.length < 2) return null;
    const next = list[(list.indexOf(this.item) + dir + list.length) % list.length];
    this.setStyle(next);
    this.sounds.click();
    return next;
  }

  // Puts this style in the selected slot (and remembers it for its family).
  setStyle(item) {
    const fam = familyOf(item);
    if (fam) this.settings.styles[fam.id] = item;
    if (this.selected === 0 && item !== HAMMER) this.selected = 1;
    this.settings.hotbar[this.selected] = item;
    this.remember(item);
    this.buildHotbar();
    this.buildInvHotbar();
    this.select(this.selected);
    if (!$('inventory').classList.contains('hidden')) this.renderGrid();
  }

  // Takes something into your hand: the slot it's already in, or a slot with another style of
  // it (which changes style), or else the selected slot.
  takeItem(item) {
    let at = this.settings.hotbar.indexOf(item);
    const fam = familyOf(item);
    if (at < 0 && fam) at = this.settings.hotbar.findIndex(i => familyOf(i) === fam);
    if (at < 0) return this.setSlot(item);
    this.selected = at;
    if (this.settings.hotbar[at] !== item) return this.setStyle(item);
    this.select(at);
  }

  // The style strip in the item menu: every style of what's in the glowing slot.
  renderStyles() {
    const strip = $('inv-styles');
    if (!strip) return;
    const item = this.item, list = this.styles(item), fam = familyOf(item);
    strip.textContent = '';
    strip.classList.toggle('hidden', list.length < 2);
    if (list.length < 2) return;
    const head = document.createElement('span');
    head.className = 'inv-styles-head';
    head.textContent = `${fam.name} styles:`;
    strip.append(head);
    for (const style of list) {
      const b = document.createElement('button');
      b.className = 'inv-style' + (style === item ? ' selected' : '');
      b.title = itemName(style);
      b.append(this.iconCanvas(style));
      b.addEventListener('click', () => {
        this.setStyle(style);
        this.sounds.click();
      });
      strip.append(b);
    }
    const name = document.createElement('span');
    name.className = 'inv-styles-name';
    name.textContent = itemName(item);
    strip.append(name);
  }

  select(i) {
    const next = (i + 9) % 9;
    if (next !== this.selected) this.prevSelected = this.selected; // for Q: swap back
    this.selected = next;
    [...$('hotbar').children].forEach((s, j) => s.classList.toggle('active', j === this.selected));
    [...($('inv-hotbar')?.children || [])].forEach((s, j) => s.classList.toggle('active', j === this.selected));
    this.onChange(this.item);
    $('item-name').textContent = this.label(this.item);
    $('item-name').style.opacity = 1;
    this.itemNameTimer = this.styles(this.item).length > 1 ? 2.5 : 1.5;
    this.renderStyles();
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
    const fam = familyOf(item);
    if (fam) this.settings.styles[fam.id] = item;
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
    this.renderStyles();
  }

  // Next or previous tab (Tab key, or the arrow keys).
  stepTab(dir) {
    const i = TABS.findIndex(t => t.id === this.tab);
    this.showTab(TABS[(i + dir + TABS.length) % TABS.length].id);
  }

  // Everything whose name (or a word about it) matches what's typed in the search box.
  // Can you use this? (Things from the Luxe Store, once you've bought them.)
  usable(item) {
    return !fromStore(item) || this.owned.has(item);
  }

  setOwned(list, found = []) {
    this.owned = new Set(list);
    this.foundGear = new Set(found);
    this.renderGearHud();
    this.renderStyles();
    if (!$('inventory').classList.contains('hidden')) this.renderGrid();
  }

  // Search: every single style that matches (a family's name finds all of its styles).
  found() {
    const q = $('inv-search').value.trim().toLowerCase();
    if (!q) return [];
    return ALL_ITEMS.filter(i => !(typeof i === 'number' && BLOCKS[i].hidden) && this.usable(i))
      .filter(i => `${itemName(i)} ${familyOf(i)?.name || ''} ${SEARCH_WORDS[i] || ''}`.toLowerCase().includes(q));
  }

  // ---------- Gear ----------
  // Things you wear rather than hold: put them on or take them off in the Fun tab.

  hasGear(g) {
    return SHOP_TOOLS[g] ? this.owned.has(g) : this.foundGear.has(g);
  }

  wearing(g) {
    return this.hasGear(g) && !!this.settings.gear[g];
  }

  toggleGear(g) {
    if (!this.hasGear(g)) return;
    this.settings.gear[g] = !this.settings.gear[g];
    this.onGear?.(g, this.settings.gear[g]);
    this.renderGearHud();
    if (!$('inventory').classList.contains('hidden')) this.renderGrid();
  }

  buildGear(grid) {
    this.section(grid, '🎒 Your gear: click to put it on or take it off');
    const row = document.createElement('div');
    row.className = 'gear-row';
    for (const g of GEAR) {
      const have = this.hasGear(g), on = this.wearing(g);
      const card = document.createElement('button');
      card.className = 'gear' + (on ? ' on' : '') + (have ? '' : ' locked');
      const name = document.createElement('b');
      name.textContent = itemName(g);
      const state = document.createElement('span');
      state.className = 'gear-state';
      state.textContent = on ? 'ON' : have ? 'OFF' : SHOP_TOOLS[g] ? `🪙 ${SHOP_TOOLS[g].price}` : '🔍 Find it';
      card.title = have ? SHOP_TOOLS[g]?.about || '' : SHOP_TOOLS[g] ? `${SHOP_TOOLS[g].about} (At the Luxe Store)` : FOUND_GEAR[g].where;
      card.append(this.iconCanvas(g), name, state);
      card.addEventListener('click', () => {
        if (!have) {
          this.toast(SHOP_TOOLS[g] ? `🛍️ ${itemName(g)}: 🪙 ${SHOP_TOOLS[g].price} at the Luxe Store.` : `🔍 ${FOUND_GEAR[g].where}`);
          return;
        }
        this.toggleGear(g);
        this.sounds.click();
      });
      row.append(card);
    }
    grid.append(row);
  }

  // The gear you have on, by the hotbar.
  renderGearHud() {
    const el = $('gear-hud');
    if (!el) return;
    const on = GEAR.filter(g => this.wearing(g));
    el.classList.toggle('hidden', !on.length);
    el.textContent = on.map(g => ({ sneakers: '👟', jetpack: '🚀', trail: '🌈', skis: '🎿' })[g]).join(' ');
    el.title = on.map(itemName).join(', ');
  }

  renderGrid() {
    const grid = $('inventory-grid');
    grid.textContent = '';
    grid.scrollTop = 0;
    const q = $('inv-search').value.trim();
    if (q) {
      const list = this.found();
      this.section(grid, list.length ? `🔍 ${list.length} found` : '🔍 Nothing found. Try another word!');
      this.items(grid, list, '', true);
      return;
    }
    const recent = this.collapse((this.settings.recent || []).filter(i => ALL_ITEMS.includes(i) && this.usable(i))).slice(0, 8);
    if (this.tab === 'paint') {
      this.buildPaints(grid);
      this.items(grid, this.collapse([BRUSH, SCRAPER]));
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
    if (tab.id === 'fun') {
      // Your gear, then your things from the Luxe Store.
      this.buildGear(grid);
      const mine = tab.items.filter(i => fromStore(i) && this.owned.has(i));
      this.section(grid, mine.length ? '⭐ From the Luxe Store' : '⭐ Collect gold coins around town and buy amazing things at the Luxe Store!');
      this.items(grid, mine, 'store');
    }
    this.section(grid, `${tab.icon} ${tab.name}`);
    this.items(grid, this.collapse(tab.items.filter(i => !fromStore(i) || familyOf(i))));
  }

  section(grid, text) {
    const h = document.createElement('div');
    h.className = 'inv-section';
    h.textContent = text;
    grid.append(h);
  }

  // One tile each. A family's tile has its name, and a badge with how many styles it has.
  // (Search results show each style by its own name.)
  items(grid, list, extraClass = '', own = false) {
    for (const item of list) {
      const el = document.createElement('div');
      el.className = `inv-item ${extraClass}`;
      el.draggable = true;
      const label = document.createElement('div');
      label.className = 'inv-label';
      const fam = familyOf(item), n = this.styles(item).length;
      label.textContent = fam && n > 1 && !own ? fam.name : itemName(item);
      el.append(this.iconCanvas(item), label);
      if (n > 1) {
        const badge = document.createElement('span');
        badge.className = 'inv-badge';
        badge.textContent = `${n} styles`;
        el.append(badge);
      }
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
    const n = item === null ? 0 : this.styles(item).length;
    $('inv-name').textContent = item === null
      ? (isTouch() ? 'Tap an item to put it in the glowing slot. Tap a slot to choose it.' : 'Click an item to put it in the glowing slot · Drag it onto any slot · Or point at it and press 1–9')
      : `${itemName(item)}${n > 1 ? ` (${n} styles: pick one below)` : ''}${isTouch() ? '' : '  ·  press 1–9 to put it in that slot'}`;
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
        if (i === this.selected && this.styles(item).length > 1) this.nextStyle(1);
        else this.select(i);
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
    // Gold (from the Luxe Store): shiny gold cars, and gold-colored blocks.
    const gold = document.createElement('button');
    const haveGold = this.owned.has(GOLDPAINT);
    gold.className = 'swatch gold' + (this.settings.paint === GOLD_PAINT && haveGold ? ' selected' : '') + (haveGold ? '' : ' locked');
    gold.title = haveGold ? 'Gold: paint a car, boat or helicopter shiny gold!' : `Gold Car Paint: 🪙 ${SHOP_TOOLS[GOLDPAINT].price} at the Luxe Store`;
    gold.addEventListener('click', () => {
      if (!haveGold) {
        this.toast(`✨ Gold paint for cars is at the Luxe Store (🪙 ${SHOP_TOOLS[GOLDPAINT].price}).`);
        return;
      }
      this.settings.paint = GOLD_PAINT;
      [...row.children].forEach(c => c.classList.toggle('selected', c === gold));
      this.onPaint?.(GOLD_PAINT);
      this.sounds.click();
    });
    row.append(gold);
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
      ? '<kbd>Mouse</kbd> Steer <kbd>Space</kbd> Up <kbd>Shift</kbd> Down <kbd>W</kbd><kbd>S</kbd> Tilt (stays tilted) <kbd>A</kbd><kbd>D</kbd> Slide <kbd>V</kbd> Camera <kbd>E</kbd> Get out'
      : '<kbd>W</kbd><kbd>S</kbd> Drive <kbd>A</kbd><kbd>D</kbd> Steer <kbd>Space</kbd> Brake ' +
        '<kbd>Shift</kbd> Boost <kbd>H</kbd> Horn ' + ({ police: '<kbd>G</kbd> Siren ', camper: '<kbd>G</kbd> Pop-up roof ', dump: '<kbd>G</kbd> Tip the dump bed ' }[kind] || '') +
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
