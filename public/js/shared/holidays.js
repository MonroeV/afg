// Holidays (since v0.80)! Two ways one comes round:
//  - on its real date (Christmas on December 25th, Halloween on October 31st…), all day long, by
//    the server's own calendar;
//  - and in the game's own year (a game year goes by in 80 minutes: see seasons.js): the second
//    day of each season is a holiday, so there's one every 20 minutes or so, for 10 minutes.
// A real one wins. The server works out which it is and tells everyone (so they all agree,
// whatever time it is where they are).
//
// While it's on: treats to hunt all over town (presents, candy, eggs…), the street lamps in its
// colors, the town's people wishing you a happy one, and on some, fireworks at night.
import { SEASON_DAYS } from './seasons.js';
import { DAY_LENGTH, DAY_FRACTION } from './blocks.js';

export const HOLIDAYS = {
  christmas: {
    name: 'Christmas', icon: '🎄', greeting: 'Merry Christmas!', treat: { icon: '🎁', name: 'presents', color: '#e53935', big: 'a giant present' },
    lamps: ['#ff3b3b', '#2ecc40'],
  },
  newyear: {
    name: "New Year's", icon: '🎆', greeting: 'Happy New Year!', treat: { icon: '🎉', name: 'party poppers', color: '#ffd54f', big: 'a golden popper' },
    lamps: ['#ffd54f', '#fff3c4'], fireworks: true, countdown: true,
  },
  halloween: {
    name: 'Halloween', icon: '🎃', greeting: 'Happy Halloween!', treat: { icon: '🍬', name: 'candy', color: '#ff8a3c', big: 'a giant lollipop', doors: true },
    lamps: ['#ff8a1f', '#a35cff'], spooky: true,
  },
  thanksgiving: {
    name: 'Thanksgiving', icon: '🦃', greeting: 'Happy Thanksgiving!', treat: { icon: '🥧', name: 'pies', color: '#d39b4a', big: 'a giant pie', fills: true },
    lamps: ['#ffb347', '#e0763a'], feast: true,
  },
  easter: {
    name: 'Easter', icon: '🐣', greeting: 'Happy Easter!', treat: { icon: '🥚', name: 'eggs', color: '#b9e6ff', big: 'a golden egg' },
    lamps: ['#ffd1f0', '#c9f2ff'],
  },
  july4: {
    name: 'the Fourth of July', icon: '🇺🇸', greeting: 'Happy Fourth of July!', treat: { icon: '⭐', name: 'stars', color: '#ffd54f', big: 'a giant gold star' },
    lamps: ['#ff3b3b', '#ffffff', '#3b6bff'], fireworks: true,
  },
  valentines: {
    name: "Valentine's Day", icon: '💝', greeting: "Happy Valentine's Day!", treat: { icon: '💖', name: 'hearts', color: '#ff6fae', big: 'a giant heart' },
    lamps: ['#ff6fae', '#ffc2dc'],
  },
};

// The game's year: each season's two holidays take turns, year by year.
const GAME_YEAR = [
  ['easter', 'valentines'], // spring
  ['july4', 'july4'], // summer
  ['halloween', 'thanksgiving'], // fall
  ['christmas', 'newyear'], // winter
];

// Which holiday is it in the game's own calendar on this game day (or null)? The second day of
// each season.
export function gameHoliday(day) {
  const d = Math.max(0, Math.floor(day || 0));
  if (d % SEASON_DAYS !== SEASON_DAYS - 1) return null;
  const season = Math.floor(d / SEASON_DAYS) % 4, year = Math.floor(d / (SEASON_DAYS * 4));
  return GAME_YEAR[season][year % 2];
}

// Easter Sunday in a year (the Anonymous Gregorian algorithm): [month 1-12, day].
export function easterDate(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

// Is it a holiday today, by the real calendar (or null)? (In the server's own time zone.)
export function realHoliday(date = new Date()) {
  const m = date.getMonth() + 1, d = date.getDate(), y = date.getFullYear();
  if ((m === 12 && d === 31) || (m === 1 && d === 1)) return 'newyear';
  if (m === 2 && d === 14) return 'valentines';
  if (m === 7 && d === 4) return 'july4';
  if (m === 10 && d === 31) return 'halloween';
  if (m === 12 && (d === 24 || d === 25)) return 'christmas';
  // Thanksgiving: the fourth Thursday in November.
  if (m === 11 && date.getDay() === 4 && d >= 22 && d <= 28) return 'thanksgiving';
  const [em, ed] = easterDate(y);
  if (m === em && d === ed) return 'easter';
  return null;
}

// The holiday right now: a real one first, else the game's.
export function holidayNow(day, date = new Date()) {
  return realHoliday(date) || gameHoliday(day);
}

// The next holiday in the game's calendar, from this game day (for Skye's forecast): [id, days away].
export function nextGameHoliday(day) {
  for (let k = 1; k <= SEASON_DAYS * 8; k++) {
    const id = gameHoliday((day || 0) + k);
    if (id) return [id, k];
  }
  return null;
}

// How far through the day midnight is (the clock runs 6 AM to 7 PM in the day part, then 7 PM to
// 6 AM: see the sky's clock), as a time of day in seconds.
export const MIDNIGHT = (DAY_FRACTION + (5 / 11) * (1 - DAY_FRACTION)) * DAY_LENGTH;
