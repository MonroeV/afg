// Clubs: things to do, like the Secret Agency. Each club has a leader somewhere in town, a few
// tasks (shown as pictures with a count, not words), and once they're all done, its badge, some
// coins and something special that stays yours for good (a perk: cheaper gas, bigger tips, luckier
// fishing, a turbo, a coin magnet). The server counts the tasks as you do them.
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
];

export const clubById = id => CLUBS.find(c => c.id === id);
export const TURBO = 1.15; // the Speed Club's turbo: top speed
export const MAGNET = 2.6; // the Gold Club's coin magnet: how much further away you grab coins
export const PIZZA_TIP = 2; // the Pizza Pro's extra tip
export const STREAK_MAX = 10; // the daily bonus grows by 2 a day in a row, up to this much more
