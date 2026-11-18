// The seasons: spring, summer, fall and winter, two game days each (so a whole year goes by in
// 80 minutes). The server counts the days; everyone works out the season from the day and the
// time of day, so they all agree. Each new season comes in gradually, over its first half day.
import { DAY_LENGTH } from './blocks.js';

export const SEASON_DAYS = 2;
export const SEASONS = ['spring', 'summer', 'fall', 'winter'];
export const SEASON_ICONS = ['🌸', '☀️', '🍂', '❄️'];
export const SPRING = 0, SUMMER = 1, FALL = 2, WINTER = 3;
const CHANGE = 0.25; // (how much of a season it takes to change over: a quarter, half a game day)

// i: which season, k: how far through it (0..1), mix: how far it has come in (0..1: still
// partly the last one, at the start), last: the season before.
export function seasonAt(day, time) {
  const y = ((day || 0) + (time || 0) / DAY_LENGTH) / SEASON_DAYS;
  const i = ((Math.floor(y) % 4) + 4) % 4, k = y - Math.floor(y);
  const t = Math.min(1, k / CHANGE);
  return { i, k, mix: t * t * (3 - 2 * t), last: (i + 3) % 4, name: SEASONS[i], icon: SEASON_ICONS[i] };
}

// The days of the week (the game's own week: 7 game days, counted by the server). Sunday is the
// day for church (see church.js), and Tuesday is Taco Tuesday at Casa Fiesta.
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const weekday = day => (((day || 0) % 7) + 7) % 7;
export const SUNDAY = 0, TUESDAY = 2;
export const isTacoTuesday = day => weekday(day) === TUESDAY;

// How snowy it is (0..1): snow comes in at the start of winter and melts at the start of spring.
export function snowAt(s) {
  if (s.i === WINTER) return s.mix;
  if (s.i === SPRING) return 1 - s.mix;
  return 0;
}
