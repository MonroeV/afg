// Character customization options, shared by the server (to validate) and the browser.

export const LOOK_OPTIONS = {
  face: ['smile', 'grin', 'cool', 'wink', 'surprised', 'silly', 'sleepy', 'cat', 'robot', 'starry'],
  hair: ['none', 'short', 'spiky', 'long', 'ponytail', 'mohawk', 'afro', 'buns'],
  hat: ['none', 'cap', 'beanie', 'tophat', 'crown', 'cowboy', 'party', 'wizard', 'viking'],
  shirt: ['tshirt', 'striped', 'hoodie', 'jacket', 'tank', 'jersey', 'dress'],
  pants: ['jeans', 'shorts', 'skirt', 'sweatpants'],
  extra: ['none', 'backpack', 'cape', 'wings'],
};

export const LOOK_COLORS = ['skin', 'eyes', 'hairColor', 'hatColor', 'shirtColor', 'shirtColor2', 'pantsColor', 'shoesColor', 'extraColor'];

export const OPTION_LABELS = {
  smile: 'Smile', grin: 'Big Grin', cool: 'Sunglasses', wink: 'Wink', surprised: 'Surprised',
  silly: 'Silly', sleepy: 'Sleepy', cat: 'Kitty', robot: 'Robot', starry: 'Star Eyes',
  none: 'None', short: 'Short', spiky: 'Spiky', long: 'Long', ponytail: 'Ponytail',
  mohawk: 'Mohawk', afro: 'Afro', buns: 'Space Buns',
  cap: 'Cap', beanie: 'Beanie', tophat: 'Top Hat', crown: 'Crown', cowboy: 'Cowboy',
  party: 'Party Hat', wizard: 'Wizard', viking: 'Viking',
  tshirt: 'T-Shirt', striped: 'Stripes', hoodie: 'Hoodie', jacket: 'Jacket', tank: 'Tank Top',
  jersey: 'Sports Jersey', dress: 'Dress',
  jeans: 'Jeans', shorts: 'Shorts', skirt: 'Skirt', sweatpants: 'Sweatpants',
  backpack: 'Backpack', cape: 'Super Cape', wings: 'Wings',
};

export const SKIN_TONES = ['#ffe0c4', '#f5c9a0', '#e8b088', '#d39a6a', '#b07548', '#8d5a34', '#6b4226', '#4a2c18', '#7fd17a', '#8fb8ff'];

export const PALETTE = [
  '#e53935', '#ff7043', '#ffb300', '#fdd835', '#7cb342', '#2e7d32', '#26c6da', '#1e88e5',
  '#3949ab', '#8e24aa', '#ec407a', '#f8bbd0', '#ffffff', '#9e9e9e', '#424242', '#111111',
  '#6d4c41', '#d7a86e',
];

export const HAIR_COLORS = ['#1b1209', '#3b2314', '#6b3e1f', '#a0632b', '#d9a441', '#f3d98b', '#c23b22', '#e8e8e8', '#ff5fa2', '#4fc3f7', '#7c4dff', '#66bb6a'];

export const DEFAULT_LOOK = {
  face: 'smile', hair: 'short', hat: 'none', shirt: 'tshirt', pants: 'jeans', extra: 'none',
  skin: '#f5c9a0', eyes: '#3b2314', hairColor: '#3b2314', hatColor: '#e53935',
  shirtColor: '#1e88e5', shirtColor2: '#ffffff', pantsColor: '#3949ab', shoesColor: '#ffffff', extraColor: '#e53935',
};

const isColor = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

// Makes sure a look sent by a player only contains known options and real colors.
export function sanitizeLook(look) {
  const out = { ...DEFAULT_LOOK };
  if (!look || typeof look !== 'object') return out;
  for (const [key, options] of Object.entries(LOOK_OPTIONS)) {
    if (options.includes(look[key])) out[key] = look[key];
  }
  for (const key of LOOK_COLORS) {
    if (isColor(look[key])) out[key] = look[key].toLowerCase();
  }
  return out;
}

export function randomLook(rand = Math.random) {
  const pick = list => list[Math.floor(rand() * list.length)];
  return {
    face: pick(LOOK_OPTIONS.face),
    hair: pick(LOOK_OPTIONS.hair),
    hat: rand() < 0.4 ? 'none' : pick(LOOK_OPTIONS.hat),
    shirt: pick(LOOK_OPTIONS.shirt),
    pants: pick(LOOK_OPTIONS.pants),
    extra: rand() < 0.5 ? 'none' : pick(LOOK_OPTIONS.extra),
    skin: pick(SKIN_TONES.slice(0, 8)),
    eyes: pick(['#3b2314', '#1e88e5', '#2e7d32', '#111111', '#8e24aa']),
    hairColor: pick(HAIR_COLORS),
    hatColor: pick(PALETTE),
    shirtColor: pick(PALETTE),
    shirtColor2: pick(PALETTE),
    pantsColor: pick(PALETTE),
    shoesColor: pick(PALETTE),
    extraColor: pick(PALETTE),
  };
}
