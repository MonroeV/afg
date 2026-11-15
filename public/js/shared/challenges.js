// Build challenges: Builder Bea's picture cards (at the Build Park). Build what's on a card on
// your own land (claimed with the Land Flag: your home or your vacation spot) and she checks it:
// the server counts what's there. Each card done is coins, and all of them makes you a
// Master Builder (a club: see clubs.js).
//
// Each part: an icon, how many, and what counts: blocks (any of these ids), doors, lights (any
// lamp or light), or a Build Book thing (a structure, as structures.js finds them).
export const CHALLENGES = [
  {
    id: 'house', icon: '🏠', coins: 15, name: 'A cozy house',
    parts: [{ icon: '🚪', n: 1, door: true }, { icon: '🛏️', n: 1, structure: 'bed' }, { icon: '💡', n: 2, light: true }, { icon: '🪟', n: 2, blocks: [9, 59, 112] }],
  },
  {
    id: 'garden', icon: '🌷', coins: 15, name: 'A garden',
    parts: [{ icon: '🌷', n: 5, blocks: [27, 116, 117] }, { icon: '⛲', n: 1, blocks: [119, 120], structure: 'fountain' }, { icon: '🥕', n: 3, blocks: [131, 132, 133, 134] }],
  },
  {
    id: 'playground', icon: '🛝', coins: 20, name: 'A playground',
    parts: [{ icon: '🛝', n: 1, structure: 'swing' }, { icon: '🤸', n: 1, structure: 'trampoline' }, { icon: '🏀', n: 1, structure: 'hoop' }],
  },
  {
    id: 'pets', icon: '🐶', coins: 20, name: 'A pet corner',
    parts: [{ icon: '🥣', n: 1, blocks: [126] }, { icon: '🧺', n: 1, blocks: [127] }, { icon: '🏠', n: 1, blocks: [129, 130] }],
  },
  {
    id: 'science', icon: '🚀', coins: 20, name: 'A science fair',
    parts: [{ icon: '🚀', n: 1, structure: 'rocket' }, { icon: '🌋', n: 1, structure: 'volcano' }, { icon: '🐠', n: 1, structure: 'fishtank' }],
  },
  {
    id: 'party', icon: '🎉', coins: 15, name: 'A party',
    parts: [{ icon: '🪩', n: 1, structure: 'disco' }, { icon: '🎵', n: 4, music: true }, { icon: '🔥', n: 1, structure: 'campfire' }],
  },
];
export const challengeById = id => CHALLENGES.find(c => c.id === id) || null;

// How many of a part there are, from a count of what's on the land.
export const partCount = (part, counts) =>
  (part.blocks || []).reduce((n, id) => n + (counts.blocks[id] || 0), 0) +
  (part.structure ? counts.structures[part.structure] || 0 : 0) +
  (part.door ? counts.doors : 0) + (part.light ? counts.lights : 0) + (part.music ? counts.music : 0);
