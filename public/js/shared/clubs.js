// Clubs: things to do, like the Secret Agency. Each club has a leader somewhere in town, a few
// tasks (shown as pictures with a count, not words), and once they're all done, its badge, some
// coins and something special that stays yours for good (a perk: cheaper gas, bigger tips, luckier
// fishing, a turbo, a coin magnet). The server counts the tasks as you do them.
import { CHALLENGES } from './challenges.js';

export const CLUBS = [
  {
    id: 'mechanic', name: 'Mechanic Crew', icon: '🔧', color: '#ff8f00', leader: 'Mo', where: 'at the gas station',
    tasks: [
      { id: 'fix', icon: '🔧', goal: 3, what: 'Fix a vehicle with the wrench until it\'s good as new' },
      { id: 'fuel', icon: '⛽', goal: 3, what: 'Fill a vehicle up with gas' },
      { id: 'wash', icon: '🧽', goal: 2, what: 'Wash a vehicle at the car wash' },
    ],
    reward: { coins: 15, perk: '⛽½', perkName: 'Gas costs half' },
  },
  {
    id: 'pizza', name: 'Pizza Pro', icon: '🍕', color: '#e53935', leader: 'Chef Rosa', where: 'at the Pizza Palace',
    tasks: [
      { id: 'deliver', icon: '🍕', goal: 5, what: 'Deliver a pizza' },
      { id: 'fast', icon: '⏱️', goal: 3, what: 'Deliver one quickly (for a tip)' },
    ],
    reward: { coins: 10, perk: '🪙+2', perkName: 'Bigger tips on every pizza' },
  },
  {
    id: 'nature', name: 'Nature Club', icon: '🌲', color: '#43a047', leader: 'Ranger Rae', where: 'at the campground',
    tasks: [
      { id: 'fish', icon: '🐟', goal: 10, what: 'Catch a fish' },
      { id: 'kinds', icon: '🐠', goal: 5, what: 'Catch different kinds of fish' },
      { id: 'trees', icon: '🌳', goal: 2, what: 'Plant a tree (a log on the grass)' },
      { id: 'harvest', icon: '🥕', goal: 5, what: 'Pick crops you grew (seeds from the Garden Center)' },
    ],
    reward: { coins: 15, perk: '🎣✨', perkName: 'Lucky rod: rare fish bite more' },
  },
  {
    id: 'speed', name: 'Speed Club', icon: '🏁', color: '#1e88e5', leader: 'Coach Frost', where: 'at the ski lodge',
    tasks: [
      { id: 'drive', icon: '🚗', goal: 2000, what: 'Drive (blocks)' },
      { id: 'fly', icon: '🚁', goal: 500, what: 'Fly the helicopter (blocks)' },
      { id: 'race', icon: '🏁', goal: 1, what: 'Finish a race (build a start and a finish line!)' },
    ],
    reward: { coins: 15, perk: '🚀', perkName: 'Turbo: everything you drive goes faster' },
  },
  {
    id: 'gold', name: 'Gold Club', icon: '🪙', color: '#f9a825', leader: 'Mayor Maple', where: 'on the town square',
    tasks: [
      { id: 'coins', icon: '🪙', goal: 30, what: 'Pick up gold coins' },
      { id: 'shop', icon: '🛍️', goal: 1, what: 'Buy something at the Luxe Store' },
      { id: 'land', icon: '🚩', goal: 1, what: 'Claim some land with the Land Flag' },
    ],
    reward: { coins: 20, perk: '🧲', perkName: 'Coin magnet, and a bigger daily bonus' },
  },
  {
    id: 'tunnel', name: 'Tunnel Diggers', icon: '⛏️', color: '#8d6e63', leader: 'Digger Dot', where: 'at Big Rock Quarry',
    tasks: [
      { id: 'dig', icon: '🕳️', goal: 15, what: 'Dig a hole in the ground (hit it 3 times with the hammer)' },
      { id: 'fill', icon: '🧱', goal: 3, what: 'Put a block in a hole (any block!)' },
      { id: 'dump', icon: '🚚', goal: 1, what: 'Tip out a dump truck full of dirt (from the quarry\'s chute)' },
    ],
    reward: { coins: 15, perk: '⛏️🤫', perkName: 'Secret tunnels: dig deep under the ground' },
  },
  {
    // Builder Bea's picture cards (see challenges.js): build each one on your own land.
    id: 'builder', name: 'Master Builders', icon: '🏗️', color: '#fb8c00', leader: 'Builder Bea', where: 'at the Build Park',
    tasks: CHALLENGES.map(c => ({ id: c.id, icon: c.icon, goal: 1, what: `Build ${c.name.toLowerCase()} on your land` })),
    reward: { coins: 25, perk: '🔨⚡', perkName: 'Super hammer: blocks break in one hit' },
  },
  {
    id: 'neighbor', name: 'Good Neighbors', icon: '🏡', color: '#ec407a', leader: 'Grandma Rose', where: 'in her house in town',
    tasks: [
      { id: 'deliver', icon: '📦', goal: 3, what: 'Take a package to a neighbor' },
      { id: 'fetch', icon: '🎁', goal: 3, what: 'Bring a neighbor something they want' },
      { id: 'visit', icon: '📍', goal: 2, what: 'Go and see somewhere for a neighbor' },
    ],
    reward: { coins: 20, perk: '💌×2', perkName: 'Neighbors pay you twice as much' },
  },
  // ---------- Since v0.50 ----------
  {
    id: 'pilot', name: 'Sky Pilots', icon: '🛩️', color: '#0288d1', leader: 'Captain Sky', where: 'at the airport',
    tasks: [
      { id: 'takeoff', icon: '🛫', goal: 1, what: 'Take off in an airplane' },
      { id: 'land', icon: '🛬', goal: 2, what: 'Land an airplane safely' },
      { id: 'chute', icon: '🪂', goal: 1, what: 'Jump out of an airplane and float down on your parachute' },
    ],
    reward: { coins: 20, perk: '✈️💨', perkName: 'Jet engine: airplanes fly faster' },
  },
  {
    id: 'foodie', name: 'Foodie Club', icon: '😋', color: '#ef6c00', leader: 'Mateo', where: 'at Casa Fiesta',
    tasks: [
      { id: 'eat', icon: '🍽️', goal: 10, what: 'Eat something from your lunchbox (press L)' },
      { id: 'kinds', icon: '🍎', goal: 5, what: 'Eat different kinds of food' },
      { id: 'taco', icon: '🌮', goal: 1, what: 'Get a free taco on Taco Tuesday at Casa Fiesta' },
    ],
    reward: { coins: 15, perk: '🍱✨', perkName: 'Food fills you up twice as much' },
  },
  {
    id: 'explorer', name: 'Explorer Club', icon: '🧭', color: '#6d4c41', leader: 'Scout Juno', where: 'at Friendship Park',
    tasks: [
      { id: 'airport', icon: '✈️', goal: 1, what: 'Visit the airport' },
      { id: 'church', icon: '⛪', goal: 1, what: 'Visit the church' },
      { id: 'fiesta', icon: '🌮', goal: 1, what: 'Visit Casa Fiesta' },
      { id: 'salon', icon: '💇', goal: 1, what: 'Visit Snip & Style, the hair salon' },
      { id: 'grocery', icon: '🛒', goal: 1, what: 'Visit FreshMart Grocery' },
      { id: 'skytop', icon: '🏙️', goal: 1, what: 'Go up to the very top of Sky Tower' },
    ],
    reward: { coins: 25, perk: '🥾', perkName: "Explorer's boots: you walk a bit faster" },
  },
  {
    id: 'friends', name: 'Best Friends', icon: '🤝', color: '#ec407a', leader: 'Miss Joy', where: 'at Friendship Park',
    tasks: [
      { id: 'friend', icon: '🤝', goal: 1, what: 'Make a best friend at Friendship Park' },
      { id: 'hangout', icon: '⏱️', goal: 5, what: 'Hang out with your best friend (minutes)' },
      { id: 'slide', icon: '🎢', goal: 3, what: 'Go down a slide' },
    ],
    reward: { coins: 20, perk: '🍪💕', perkName: 'Your best friend brings you snacks' },
  },
  {
    id: 'zoo', name: 'Zookeepers', icon: '🦓', color: '#558b2f', leader: 'Zookeeper Zara', where: 'at the zoo',
    tasks: [
      { id: 'see', icon: '👀', goal: 7, what: 'Go and see every kind of animal at the zoo' },
      { id: 'feed', icon: '🍎', goal: 5, what: 'Feed an animal (right-click it, with food in your lunchbox)' },
      { id: 'kinds', icon: '🦒', goal: 3, what: 'Feed different kinds of animals' },
    ],
    reward: { coins: 20, perk: '🦜', perkName: 'A parrot friend rides on your shoulder' },
  },
  {
    id: 'fire', name: 'Firefighters', icon: '🚒', color: '#d32f2f', leader: 'Fire Chief Flint', where: 'at the fire station',
    tasks: [
      { id: 'siren', icon: '🚨', goal: 1, what: 'Turn on a fire truck\'s lights (G)' },
      { id: 'fires', icon: '🔥', goal: 3, what: 'Put out a fire in town with the hose (G twice: 💦)' },
      { id: 'rescue', icon: '🚗', goal: 1, what: 'Save a burning vehicle with the hose' },
    ],
    reward: { coins: 25, perk: '⛑️', perkName: 'A firefighter\'s helmet, and your hose sprays farther' },
  },
  {
    id: 'farm', name: 'Farmhands', icon: '🌾', color: '#8d6e63', leader: 'Farmer Wren', where: 'at Sunny Acres Farm',
    tasks: [
      { id: 'pet', icon: '🐄', goal: 5, what: 'Pet the farm animals (right-click them)' },
      { id: 'pick', icon: '🥕', goal: 5, what: 'Pick crops in the farm\'s fields' },
      { id: 'fresh', icon: '🥛', goal: 2, what: 'Get milk from a cow or an egg from a hen' },
      { id: 'tractor', icon: '🚜', goal: 1, what: 'Drive a tractor' },
    ],
    reward: { coins: 20, perk: '🌾', perkName: 'Farm fresh: twice the milk, eggs and crops at the farm' },
  },
  {
    id: 'space', name: 'Space Cadets', icon: '🚀', color: '#3949ab', leader: 'Commander Nova', where: 'at the Space Center',
    tasks: [
      { id: 'museum', icon: '🪐', goal: 1, what: 'Visit the Space Museum' },
      { id: 'watch', icon: '👀', goal: 1, what: 'Watch a rocket launch from nearby' },
      { id: 'ride', icon: '🚀', goal: 1, what: 'Fly to space in the rocket (right-click its gate)' },
    ],
    reward: { coins: 25, perk: '🌙', perkName: 'Moon boots: you jump higher' },
  },
  {
    id: 'soccer', name: 'Soccer Stars', icon: '⚽', color: '#2e7d32', leader: 'Referee Rita', where: 'at the stadium',
    tasks: [
      { id: 'kicks', icon: '🦶', goal: 20, what: 'Kick the giant ball (run into it)' },
      { id: 'goals', icon: '🥅', goal: 3, what: 'Score a goal' },
    ],
    reward: { coins: 20, perk: '💥', perkName: 'Power kick: you kick the ball farther' },
  },
  {
    id: 'golf', name: 'Golf Pros', icon: '⛳', color: '#1b5e20', leader: 'Caddie Cal', where: 'at Putt Putt Paradise',
    tasks: [
      { id: 'holes', icon: '⛳', goal: 9, what: 'Play all nine holes of mini golf' },
      { id: 'rounds', icon: '📋', goal: 2, what: 'Finish a whole round (all nine holes)' },
      { id: 'ace', icon: '🎯', goal: 1, what: 'Get a hole in one!' },
    ],
    reward: { coins: 20, perk: '🏌️', perkName: 'A bigger daily bonus (+3 🪙 every day)' },
  },
];

export const clubById = id => CLUBS.find(c => c.id === id);
export const TURBO = 1.15; // the Speed Club's turbo: top speed
export const MAGNET = 2.6; // the Gold Club's coin magnet: how much further away you grab coins
export const PIZZA_TIP = 2; // the Pizza Pro's extra tip
export const STREAK_MAX = 10; // the daily bonus grows by 2 a day in a row, up to this much more
