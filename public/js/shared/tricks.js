// Pet tricks and pet hats (from the Pet Shop). Holding Pet Treats, right-click your pet and pick a
// trick: it takes a few tries to learn (the server counts them, and remembers the ones it knows).
// A hat, once bought, can go on your pet (it's part of your look, so everyone sees it).
export const TRICKS = [
  { id: 'sit', icon: '🪑' },
  { id: 'spin', icon: '🌀' },
  { id: 'jump', icon: '⬆️' },
  { id: 'roll', icon: '🔄' },
  { id: 'dead', icon: '💤' },
  { id: 'dance', icon: '💃' },
];
export const TRICK_TRIES = 3; // tries to learn a trick
export const TRICK_TIME = 2.6; // seconds a trick lasts
export const trickIndex = id => TRICKS.findIndex(t => t.id === id) + 1; // (0: no trick)
export const TREATS = 'treats';
export const PET_HATS = ['party', 'crown', 'bow', 'shades', 'cape'];
export const HAT_ICONS = { none: '🚫', party: '🥳', crown: '👑', bow: '🎀', shades: '😎', cape: '🦸' };
export const hatItem = hat => `pethat_${hat}`;
