// The town's people who aren't players: Penny at the Luxe Store, Rex at the tower's
// reception desk and Mayor Maple on the town square. The server runs them (in the room), so
// everyone sees them do the same things. They wander about a little, say hello when you
// come near, pet your pet, love your cool stuff, and react to fireworks, explosions,
// dancing and water balloons.
import { sanitizeLook } from './avatar.js';
import { isTacoTuesday } from './seasons.js';
import { isSunday } from './church.js';
import { BLOCKS, isSolidBlock, blockId, itemOf, shapeOf, blockMeta, blockKey, toggleDoorValue, isNightTime, DOOR_OPEN, DOOR_TOP, SHOP_TOOLS } from './blocks.js';
import { claimAt } from './claims.js';
import { liftColumn, liftStops } from './elevator.js';
import { SHOWERS } from './weather.js';
import { buildMap, route, nearestNode, cellKey, cellFlags, doorAt, nearGarage, STAND, DOOR, CLIMB, RIDE } from './homenav.js';
import { inZone } from './secretbase.js';
import { RESIDENTS } from './residents.js';

export const NPC_ACT = { idle: 0, walk: 1, wave: 2, dance: 3, pet: 4, cheer: 5 };
// How they're settled (as well as what they're doing): sitting, lying in bed, reading a book.
export const NPC_POSE = { none: 0, sit: 1, lie: 2, read: 3, readStanding: 4 };

const pickOne = list => list[Math.floor(Math.random() * list.length)];
const nameKey = name => String(name || '').trim().toLowerCase();

const NPCS = [
  {
    id: -1, place: 'store', name: 'Penny', title: 'Penny 🛍️', roam: 2.5, store: 'luxe',
    look: { face: 'grin', hair: 'ponytail', shirt: 'dress', pants: 'skirt', skin: '#f5c9a0', hairColor: '#c23b22', shirtColor: '#ec407a', shirtColor2: '#ffffff', pantsColor: '#ec407a', shoesColor: '#111111' },
    hello: n => [`Hi ${n}! Welcome to the Luxe Store! ✨`, `Hello again, ${n}! Got coins to spend? 🪙`, `${n}! Come and see our shiny things!`],
    tips: ['Right-click me (or the cash register) to see what\'s for sale! 🛍️', 'The Jetpack is our most popular item! 🚀', 'Everything here is one of a kind. Well, almost! ✨'],
  },
  {
    id: -2, place: 'tower', name: 'Rex', title: 'Rex 💼', roam: 2,
    look: { face: 'cool', hair: 'short', shirt: 'jacket', pants: 'jeans', skin: '#8d5a34', hairColor: '#1b1209', shirtColor: '#424242', shirtColor2: '#ffffff', pantsColor: '#111111', shoesColor: '#111111' },
    hello: n => [`Welcome to the tower, ${n}! 💼`, `Hi ${n}! The penthouse is at the top. Take the elevator! 🛗`, `Good to see you, ${n}!`],
    tips: ['Every floor has offices. The top floor has a grand piano! 🎹', 'The elevator in the corner goes all the way up to the roof. Right-click its doors and pick a floor! 🛗', 'You can sit in the office chairs. Very comfy!'],
  },
  {
    id: -3, place: 'plaza', name: 'Mayor Maple', title: 'Mayor Maple 🎩', roam: 7, club: 'gold',
    look: { face: 'smile', hair: 'none', hat: 'tophat', shirt: 'jacket', pants: 'jeans', skin: '#e8b088', hatColor: '#111111', shirtColor: '#6d4c41', shirtColor2: '#ffd54f', pantsColor: '#424242', shoesColor: '#111111' },
    hello: n => [`Hello ${n}! Welcome to town! 🎩`, `Lovely day, ${n}! Have you found the gold coins yet?`, `${n}! Have you been to the Luxe Store? It's fabulous!`],
    tips: ['Gold coins pop up all over town. Walk into them to collect them! 🪙', 'Win a race and you get 3 coins! 🏁', 'You get 10 coins every day just for visiting!', 'Spend your coins at the Luxe Store by the road out of town!', 'Need more coins? The Pizza Palace is looking for delivery helpers! 🍕', 'Have you been up north? There\'s a ski resort in the snow! ⛷️', 'Sit on a fishing stool on the dock and catch some fish! 🎣 Every kind is worth coins (well, not the old boots).', 'Found a car you love? Click it with the Land Flag and it can be yours! 🔑', 'Out past the edge of the old map: a beach, a campground, a quarry and a farm! 🗺️'],
  },
  {
    id: -4, place: 'pizza', name: 'Chef Rosa', title: 'Chef Rosa 🍕', roam: 2, club: 'pizza',
    look: { face: 'grin', hair: 'buns', hat: 'tophat', shirt: 'jacket', pants: 'jeans', skin: '#d9a273', hairColor: '#2b1a10', hatColor: '#ffffff', shirtColor: '#ffffff', shirtColor2: '#e53935', pantsColor: '#1d1f24', shoesColor: '#111111' },
    hello: n => [`Hi ${n}! Welcome to the Pizza Palace! 🍕`, `${n}! Want to earn some coins? I need a delivery helper!`, `Hello ${n}! The pizzas are hot and ready! 🔥`],
    tips: ['Right-click me (or the oven) to take a pizza out for delivery. 🍕', 'Deliver it quickly and you get a tip! ⏱️', 'Driving is faster than walking! 🚗', 'Super Sneakers from the Luxe Store make deliveries zoom! 👟'],
  },
  {
    // BZ News' roving reporter: she goes from place to place around town (and to whoever's
    // playing) and reports live. Tune a TV to BZ Live to watch her.
    id: -6, place: 'plaza', name: 'Skye Summers', title: 'Skye Summers 🎤', roam: 2.5, reporter: true,
    look: { face: 'smile', hair: 'long', hat: 'none', shirt: 'jacket', pants: 'skirt', skin: '#f0c4a0', eyes: '#2e6b4f', hairColor: '#e0b04a', shirtColor: '#c62828', shirtColor2: '#ffffff', pantsColor: '#1d1f24', shoesColor: '#1d1f24' },
    hello: n => [`Hi ${n}! You're on BZ Live! Wave to everyone at home! 👋📺`, `Look, everybody, it's ${n}! 🎤`, `${n}! Want to be on TV? You just were! 📺`],
    tips: ['Tune any TV to BZ Live to watch me report! 📺', 'I go wherever the news is! 🎤'],
  },
  {
    id: -5, place: 'lodge', name: 'Coach Frost', title: 'Coach Frost ⛷️', roam: 3, club: 'speed',
    look: { face: 'cool', hair: 'short', hat: 'beanie', shirt: 'hoodie', pants: 'jeans', skin: '#f2c6a5', hairColor: '#c9b38a', hatColor: '#1e88e5', shirtColor: '#e53935', shirtColor2: '#ffffff', pantsColor: '#283593', shoesColor: '#111111' },
    hello: n => [`Hey ${n}! Ready to hit the slopes? ⛷️`, `Welcome to the lodge, ${n}! Warm up by the fire! 🔥`, `${n}! The snow is perfect today! ❄️`],
    tips: ['Grab a pair of skis from the rack by the door, then ride down the slope! ⛷️', 'Right-click the chair at the bottom of the ski lift to ride up to the top! 🚡', 'On skis: hold W to carve toward where you look, S to slow down.', 'The ice rink is super slippery. Have fun skating! ⛸️', 'Try a jump on skis! Press Space! 🏂'],
  },
  {
    // At the weather station: pay Stormy and it rains tacos.
    id: -18, place: 'weather', name: 'Stormy', title: 'Stormy ⛅', roam: 2, weather: true,
    look: { face: 'grin', hair: 'afro', hat: 'none', shirt: 'jacket', pants: 'jeans', skin: '#c68642', hairColor: '#2b1a10', shirtColor: '#1e88e5', shirtColor2: '#fdd835', pantsColor: '#37474f', shoesColor: '#fdd835' },
    hello: n => [`Hi ${n}! Today's forecast: TACOS! 🌮`, `${n}! Want to see something amazing? ⛅🌮`, `Hello ${n}! Sunny, with a chance of tacos! 🌤️🌮`],
    tips: ['⛅🌮'],
  },
  {
    // At the Build Park: Builder Bea's picture cards (build challenges: see challenges.js).
    id: -19, place: 'buildpark', name: 'Builder Bea', title: 'Builder Bea 🏗️', roam: 4, club: 'builder', challenges: true,
    look: { face: 'grin', hair: 'ponytail', hat: 'cap', shirt: 'jacket', pants: 'jeans', skin: '#e8b088', hairColor: '#8d4a1f', hatColor: '#fdd835', shirtColor: '#fb8c00', shirtColor2: '#fdd835', pantsColor: '#1565c0', shoesColor: '#5d4037' },
    hello: n => [`Hi ${n}! Want a building challenge? 🏗️`, `${n}! Build something amazing on your land! 🔨`, `Hello ${n}! I've got picture cards for you! 🃏`],
    tips: ['🏗️🃏', 'Build it on your own land, then show me! 🚩'],
  },
  {
    // On the town square: Coach Kai starts games of Tag and Hide-and-seek (see playground.js).
    id: -20, place: 'coach', name: 'Coach Kai', title: 'Coach Kai 🏃', roam: 3, coach: true,
    look: { face: 'grin', hair: 'spiky', hat: 'cap', shirt: 'jersey', pants: 'sweatpants', skin: '#b07548', hairColor: '#1b1209', hatColor: '#e53935', shirtColor: '#e53935', shirtColor2: '#ffffff', pantsColor: '#283593', shoesColor: '#ffffff' },
    hello: n => [`Hey ${n}! Want to play a game? 🏃🙈`, `${n}! Tag or hide-and-seek? 🏃`, `Hi ${n}! Let's play! 🎉`],
    tips: ['🏃🙈'],
  },
  // The town's kids: they play on the square, and join in the games when there aren't many players.
  {
    id: -21, place: 'kids', name: 'Max', title: 'Max 🧢', roam: 5, kid: true,
    look: { face: 'grin', hair: 'short', hat: 'cap', shirt: 'tshirt', pants: 'shorts', skin: '#f5c9a0', hairColor: '#c9a35a', hatColor: '#1e88e5', shirtColor: '#43a047', pantsColor: '#5d4037', shoesColor: '#ffffff' },
    hello: n => [`Hi ${n}! Wanna play tag? 🏃`, `${n}! Ask Coach Kai for a game! 🙈`],
    tips: ['Tag! You\'re it! 👉', 'I\'m super fast! 🏃💨'],
  },
  {
    id: -22, place: 'kids', name: 'Zoe', title: 'Zoe 🎀', roam: 5, kid: true,
    look: { face: 'smile', hair: 'buns', shirt: 'dress', pants: 'skirt', skin: '#8d5a34', hairColor: '#1b1209', shirtColor: '#ec407a', shirtColor2: '#ffffff', pantsColor: '#ec407a', shoesColor: '#fdd835' },
    hello: n => [`Hi ${n}! I'm the best at hiding! 🙈`, `${n}! Let's play hide-and-seek! 👀`],
    tips: ['I know the BEST hiding spots! 🤫', 'Hee hee! 🙈'],
  },
  {
    id: -23, place: 'kids', name: 'Ava', title: 'Ava 🌟', roam: 5, kid: true,
    look: { face: 'starry', hair: 'long', shirt: 'striped', pants: 'jeans', skin: '#e8b088', hairColor: '#e0b04a', shirtColor: '#7e57c2', shirtColor2: '#ffffff', pantsColor: '#1565c0', shoesColor: '#e53935' },
    hello: n => [`Hi ${n}! Play with us! 🌟`, `${n}! Bet you can't catch me! 🏃`],
    tips: ['Ready, set, GO! 🏃', 'Tag is my favorite! 🌟'],
  },
  // ---------- The other stores' shopkeepers ----------
  {
    // Out on the Outer Loop: the grocery store (food for your lunchbox 🍱).
    id: -24, place: 'shop_grocery', name: 'Gus', title: 'Gus 🛒', roam: 2, store: 'grocery',
    look: { face: 'grin', hair: 'short', hat: 'cap', shirt: 'tshirt', pants: 'jeans', skin: '#d39a6a', hairColor: '#3b2314', hatColor: '#43a047', shirtColor: '#43a047', shirtColor2: '#ffffff', pantsColor: '#37474f', shoesColor: '#111111' },
    hello: n => [`Hi ${n}! Hungry? 🍎🍌🥪`, `Welcome to FreshMart, ${n}! Everything's fresh! 🛒`, `${n}! Fill up your lunchbox! 🍱`], tips: ['🍎🍌🥪🍉', 'Hungry? You slow down! Eat something! 🍽️'],
  },
  {
    // Casa Fiesta, the Mexican restaurant (Taco Tuesday: free tacos!).
    id: -25, place: 'shop_fiesta', name: 'Luis', title: 'Luis 🌮', roam: 2, store: 'fiesta',
    look: { face: 'grin', hair: 'short', hat: 'none', shirt: 'tshirt', pants: 'jeans', extra: 'none', skin: '#b07548', hairColor: '#1b1209', shirtColor: '#ffffff', shirtColor2: '#e53935', pantsColor: '#37474f', shoesColor: '#3b2314' },
    hello: (n, room) => (isTacoTuesday(room?.day) ? [`¡Hola ${n}! It's TACO TUESDAY! 🌮🎉 Free tacos!`, `${n}! ¡Fiesta! Free tacos today! 🌮🌮🌮`] : [`¡Hola ${n}! Welcome to Casa Fiesta! 🌮`, `${n}! Hungry? Try a burrito! 🌯`]),
    tips: ['🌮🌯🥑🌽🥤', 'Taco Tuesday: free tacos! 🌮🎉', '¡Buen provecho! 😋'],
  },
  {
    // Mateo plays his guitar at Casa Fiesta (on Taco Tuesday, the whole band plays: 🎺🎸🎶).
    id: -27, place: 'shop_fiesta', name: 'Mateo', title: 'Mateo 🎸', roam: 2, club: 'foodie',
    look: { face: 'cool', hair: 'short', hat: 'cowboy', shirt: 'jacket', pants: 'jeans', extra: 'none', skin: '#d39a6a', hairColor: '#1b1209', hatColor: '#111111', shirtColor: '#111111', shirtColor2: '#ffd54f', pantsColor: '#111111', shoesColor: '#3b2314' },
    hello: (n, room) => (isTacoTuesday(room?.day) ? [`🎺🎸🎶 ¡Fiesta, ${n}!`, `🎶 Dance with us, ${n}! 💃`] : [`🎸 Hola ${n}!`, `🎶 Come back on Taco Tuesday, ${n}! 🌮`]),
    tips: ['🎸🎶', '🎺🎸🎻🎶', '💃🕺🎶'],
  },
  {
    // The church: Sister Grace welcomes everyone in the foyer (any day). On Sundays there's a
    // meeting in the chapel (see church.js and churchui.js).
    id: -28, place: 'church', name: 'Sister Grace', title: 'Sister Grace ⛪', roam: 2,
    look: { face: 'smile', hair: 'buns', hat: 'none', shirt: 'dress', pants: 'skirt', extra: 'none', skin: '#8d5a34', hairColor: '#1b1209', shirtColor: '#26a69a', shirtColor2: '#ffffff', pantsColor: '#26a69a', shoesColor: '#111111' },
    hello: (n, room) => (isSunday(room?.day) ? [`Welcome, ${n}! We're so glad you came! 😊`, `Hi ${n}! The meeting is in the chapel. Come on in! ⛪`] : [`Hello ${n}! Welcome! 😊`, `Hi ${n}! Come visit us on Sunday morning! ⛪`]),
    tips: ['⛪ Sunday ☀️ 9:00', 'Everyone is welcome here! 🤝', 'Jesus Christ loves everyone! ❤️'],
  },
  // ---------- Friendship Park ----------
  // Kids who'd love a best friend (talk to one!), and the leaders of two clubs.
  ...[
    { id: -60, name: 'Sunny', face: 'grin', hair: 'pigtails', shirt: 'striped', pants: 'shorts', skin: '#f5c9a0', hairColor: '#d9a441', shirtColor: '#fdd835', shirtColor2: '#ff7043', pantsColor: '#1e88e5',
      lines: ['This is the best day ever! ☀️', 'Race you! 🏃', 'Let\'s go down the slide! 🎢', 'I love hanging out with you! 💛', 'Ooh, what are we doing next? 😄'] },
    { id: -61, name: 'Milo', face: 'cool', hair: 'spiky', shirt: 'hoodie', pants: 'jeans', skin: '#8d5a34', hairColor: '#1b1209', shirtColor: '#43a047', shirtColor2: '#ffffff', pantsColor: '#37474f',
      lines: ['Cool! 😎', 'Let\'s build something awesome! 🧱', 'Wanna go fly a plane? ✈️', 'You\'re my best buddy! 🤝', 'High five! ✋'] },
    { id: -62, name: 'Rosie', face: 'smile', hair: 'braids', shirt: 'dress', pants: 'skirt', skin: '#e8b088', hairColor: '#c23b22', shirtColor: '#ec407a', shirtColor2: '#ffffff', pantsColor: '#ec407a',
      lines: ['Look at the flowers! 🌸', 'I like your style! 💇', 'Let\'s get a snack! 🍪', 'Friends forever! 💕', 'What a pretty day! 🌈'] },
    { id: -63, name: 'Ollie', face: 'silly', hair: 'curly', shirt: 'tshirt', pants: 'shorts', skin: '#d39a6a', hairColor: '#6b3e1f', shirtColor: '#ff7043', shirtColor2: '#ffffff', pantsColor: '#3949ab',
      lines: ['Hee hee! 😜', 'Bet I can jump higher! 🦘', 'Do you have a pet? I love pets! 🐶', 'Tacos! Tacos! 🌮', 'You\'re so funny! 😂'] },
    { id: -64, name: 'Kiko', face: 'wink', hair: 'topbun', shirt: 'jacket', pants: 'jeans', skin: '#ffe0c4', hairColor: '#1b1209', shirtColor: '#7e57c2', shirtColor2: '#ffffff', pantsColor: '#263238',
      lines: ['Let\'s explore! 🧭', 'Have you been to the top of Sky Tower? 🏙️', 'I wonder what\'s over there! 👀', 'Adventure time! 🗺️', 'Best friends! 🤝'] },
    { id: -65, name: 'Nova', face: 'starry', hair: 'galaxy', shirt: 'tshirt', pants: 'jeans', skin: '#b07548', hairColor: '#2a1b5e', shirtColor: '#283593', shirtColor2: '#ffeb3b', pantsColor: '#311b92',
      lines: ['Did you see the planets last night? 🪐', 'I want to be an astronaut! 🚀', 'Stars are so pretty! ⭐', 'Let\'s watch the Space Show! 📺', 'You\'re out of this world! 🌌'] },
  ].map(k => ({
    id: k.id, place: 'park', name: k.name, title: `${k.name} 🤝`, roam: 6, pal: true, lines: k.lines,
    look: { face: k.face, hair: k.hair, hat: 'none', shirt: k.shirt, pants: k.pants, extra: 'none', skin: k.skin, hairColor: k.hairColor, shirtColor: k.shirtColor, shirtColor2: k.shirtColor2, pantsColor: k.pantsColor, shoesColor: '#ffffff' },
    hello: n => [`Hi ${n}! Wanna be friends? 🤝`, `Hey ${n}! Come play! 😄`],
    tips: k.lines,
  })),
  {
    id: -66, place: 'park', name: 'Scout Juno', title: 'Scout Juno 🧭', roam: 3, club: 'explorer',
    look: { face: 'grin', hair: 'ponytail', hat: 'cowboy', shirt: 'jacket', pants: 'shorts', extra: 'backpack', skin: '#e8b088', hairColor: '#a0632b', hatColor: '#8d6e63', shirtColor: '#6d4c41', shirtColor2: '#ffd54f', pantsColor: '#5d4037', shoesColor: '#3b2314', extraColor: '#43a047' },
    hello: n => [`Hi ${n}! Ready to explore? 🧭`, `${n}! There's so much to see out there! 🗺️`], tips: ['🧭🗺️'],
  },
  {
    id: -67, place: 'park', name: 'Miss Joy', title: 'Miss Joy 💕', roam: 3, club: 'friends',
    look: { face: 'smile', hair: 'long', hat: 'none', shirt: 'dress', pants: 'skirt', extra: 'none', skin: '#8d5a34', hairColor: '#1b1209', shirtColor: '#f06292', shirtColor2: '#ffffff', pantsColor: '#f06292', shoesColor: '#ffffff' },
    hello: n => [`Welcome to Friendship Park, ${n}! 💕`, `Hi ${n}! Everyone here would love a friend! 🤝`], tips: ['🤝💕🎢'],
  },
  {
    // BuildZone Airport: Captain Sky, a pilot, in the terminal (tips on flying the airplanes).
    id: -29, place: 'airport', name: 'Captain Sky', title: 'Captain Sky ✈️', roam: 2, club: 'pilot',
    look: { face: 'cool', hair: 'short', hat: 'cap', shirt: 'jacket', pants: 'jeans', extra: 'none', skin: '#d39a6a', hairColor: '#3b2314', hatColor: '#263238', shirtColor: '#263238', shirtColor2: '#ffd54f', pantsColor: '#263238', shoesColor: '#111111' },
    hello: n => [`Welcome aboard, ${n}! Ready to fly? ✈️`, `${n}! The planes are out on the apron. Take one up! 🛫`],
    tips: ['W: throttle up. Fast down the runway, then Space to lift off! 🛫', 'Too slow up there and you stall: nose down to speed up! ⚠️', 'Land gently on the runway: slow and level! 🛬', 'Jump out up high and your parachute opens! 🪂', 'Climb the ladder in the tower for the best view! 🗼'],
  },
  {
    // Snip & Style, the hair salon (premium hairdos).
    id: -26, place: 'shop_salon', name: 'Stella', title: 'Stella 💇', roam: 2, store: 'salon',
    look: { face: 'wink', hair: 'princess', hat: 'none', shirt: 'dress', pants: 'skirt', extra: 'none', skin: '#f5c9a0', hairColor: '#ff5fa2', shirtColor: '#ec407a', shirtColor2: '#ffffff', pantsColor: '#ec407a', shoesColor: '#ffffff' },
    hello: n => [`Hi ${n}! Ready for a new look? 💇✨`, `${n}, darling! Let's make you fabulous! ✂️`],
    tips: ['✂️💇✨', '🌈 Rainbow Spikes! 🌌 Galaxy Hair!', 'Change your hair any time: 🎨'],
  },
  {
    id: -15, place: 'shop_garden', name: 'Fern', title: 'Fern 🌻', roam: 2, store: 'garden',
    look: { face: 'smile', hair: 'long', hat: 'cowboy', shirt: 'tshirt', pants: 'jeans', skin: '#e8b088', hairColor: '#a0632b', hatColor: '#d7a86e', shirtColor: '#66bb6a', shirtColor2: '#ffffff', pantsColor: '#5d4037', shoesColor: '#3b2314' },
    hello: n => [`Hi ${n}! Everything's blooming! 🌻`, `Welcome, ${n}! Fancy a garden gnome? 🧙`], tips: ['🌻🌹🧙⛲'],
  },
  {
    id: -16, place: 'shop_toys', name: 'Mr. Jingles', title: 'Mr. Jingles 🧸', roam: 2, store: 'toys',
    look: { face: 'silly', hair: 'afro', hat: 'party', shirt: 'striped', pants: 'shorts', skin: '#f5c9a0', hairColor: '#ff7043', hatColor: '#ab47bc', shirtColor: '#ff7043', shirtColor2: '#fdd835', pantsColor: '#1e88e5', shoesColor: '#e53935' },
    hello: n => [`Toys, toys, toys, ${n}! 🧸`, `${n}! Have you seen the rocking horse? 🐴`], tips: ['🦆🤖🚂🐴'],
  },
  {
    id: -17, place: 'shop_pets', name: 'Pip', title: 'Pip 🐾', roam: 2, store: 'pets',
    look: { face: 'grin', hair: 'short', hat: 'beanie', shirt: 'hoodie', pants: 'jeans', skin: '#8d5a34', hairColor: '#1b1209', hatColor: '#8d6e63', shirtColor: '#a1887f', shirtColor2: '#ffffff', pantsColor: '#37474f', shoesColor: '#111111', pet: 'dog' },
    hello: n => [`Hi ${n}! Treats for your pet? 🐾`, `${n}! Our dog houses are the best! 🏠`], tips: ['🥣🛏️🐠🐈'],
  },
  // ---------- The residents, in their houses (residents.js, quests.js) ----------
  ...RESIDENTS.map((r, i) => ({
    id: r.id, place: `home${i + 1}`, name: r.name, title: `${r.name} ${r.emoji}`, emoji: r.emoji, roam: 1.2, resident: true, look: r.look,
    ...(i === 0 ? { club: 'neighbor' } : {}),
    hello: n => [`Hello, ${n}! 👋`, `Oh, hi ${n}! Come in! 😊`, `${n}! Nice to see you! 🏡`], tips: ['😊'],
  })),
  // ---------- Club leaders (see clubs.js) ----------
  {
    id: -12, place: 'gas1', name: 'Mo', title: 'Mo 🔧', roam: 3, club: 'mechanic',
    look: { face: 'grin', hair: 'short', hat: 'cap', shirt: 'tshirt', pants: 'jeans', skin: '#c68642', hairColor: '#1b1209', hatColor: '#ff8f00', shirtColor: '#1565c0', shirtColor2: '#ff8f00', pantsColor: '#37474f', shoesColor: '#111111' },
    hello: n => [`Hey ${n}! Need gas? ⛽`, `${n}! Bring me a dirty car! 🧽`, `Howdy, ${n}! 🔧`],
    tips: ['🔧⛽🧽'],
  },
  {
    id: -13, place: 'camp', name: 'Ranger Rae', title: 'Ranger Rae 🌲', roam: 4, club: 'nature',
    look: { face: 'smile', hair: 'ponytail', hat: 'cowboy', shirt: 'tshirt', pants: 'jeans', skin: '#f2c6a5', hairColor: '#8d5524', hatColor: '#2e7d32', shirtColor: '#6d8b3a', shirtColor2: '#f9a825', pantsColor: '#5d4037', shoesColor: '#3e2723' },
    hello: n => [`Hi ${n}! Lovely day outdoors! 🌲`, `${n}! The fish are biting! 🎣`, `Hello ${n}! Plant a tree today? 🌳`],
    tips: ['🎣🌳'],
  },
  {
    id: -14, place: 'quarry', name: 'Digger Dot', title: 'Digger Dot ⛏️', roam: 3, club: 'tunnel',
    look: { face: 'grin', hair: 'buns', hat: 'cap', shirt: 'jacket', pants: 'jeans', skin: '#d39a6a', hairColor: '#6b3e1f', hatColor: '#fdd835', shirtColor: '#ff7043', shirtColor2: '#fdd835', pantsColor: '#3949ab', shoesColor: '#3b2314' },
    hello: n => [`Hey ${n}! Dig, dig, dig! ⛏️`, `${n}! Want to know a secret? 🤫`, `Howdy, ${n}! Mind the dump trucks! 🚚`],
    tips: ['⛏️🤫'],
  },
  // ---------- The Secret Agency ----------
  // Agent Shadow, on the town square: talk to him to join the Agency (find the three TOP SECRET
  // files for Top Secret clearance).
  {
    id: -7, place: 'agent', name: 'Agent Shadow', title: 'Agent Shadow 🕶️', roam: 1.2, agent: true,
    look: { face: 'cool', hair: 'short', hat: 'none', shirt: 'jacket', pants: 'jeans', skin: '#d39a6a', hairColor: '#1b1209', shirtColor: '#1d1f24', shirtColor2: '#ffffff', pantsColor: '#1d1f24', shoesColor: '#111111' },
    hello: n => [`Psst... ${n}! Over here! 🕶️`, `Psst! ${n}! Want to be a secret agent? Talk to me...`, `Keep it down, ${n}... 🤫 Right-click me.`],
    tips: ['🤫'],
  },
  // The guards at the base's door: only agents with Top Secret clearance get in.
  {
    id: -8, place: 'guard1', name: 'Guard Bruno', title: 'Guard Bruno 💂', roam: 0.6, guard: true, clearance: true,
    look: { face: 'cool', hair: 'short', hat: 'cap', shirt: 'jacket', pants: 'jeans', skin: '#b07548', hairColor: '#1b1209', hatColor: '#263238', shirtColor: '#37474f', shirtColor2: '#ffd54f', pantsColor: '#263238', shoesColor: '#111111' },
    hello: n => [`Halt, ${n}! 🛑`], tips: [],
  },
  {
    id: -9, place: 'guard2', name: 'Guard Tess', title: 'Guard Tess 💂', roam: 0.6, guard: true, clearance: true,
    look: { face: 'cool', hair: 'ponytail', hat: 'cap', shirt: 'jacket', pants: 'jeans', skin: '#f5c9a0', hairColor: '#6b3e1f', hatColor: '#263238', shirtColor: '#37474f', shirtColor2: '#ffd54f', pantsColor: '#263238', shoesColor: '#111111' },
    hello: n => [`Halt, ${n}! 🛑`], tips: [],
  },
  // Inside: Agent Byte watches the spy screens, Dr. Gizmo looks after the drones.
  {
    id: -10, place: 'spyroom', name: 'Agent Byte', title: 'Agent Byte 💻', roam: 2.5, clearance: true,
    look: { face: 'grin', hair: 'spiky', hat: 'none', shirt: 'hoodie', pants: 'jeans', skin: '#ffe0c4', hairColor: '#4fc3f7', shirtColor: '#263238', shirtColor2: '#66ffa6', pantsColor: '#1d1f24', shoesColor: '#111111' },
    hello: n => [`Agent ${n}! Welcome to the spy room! 💻`, `Hey ${n}! The screens are all yours. 🕵️`],
    tips: ['Right-click a console to watch anyone, anywhere, on the spy cameras! (◀ ▶ to switch) 📹', 'The radar table shows where everybody is, right now! 📡', 'Psst: the big red button in the vault? Please don\'t press it. 😬', 'Try the laser hall! Wait for the lasers to blink off, then GO! 🔴'],
  },
  {
    id: -11, place: 'dronebay', name: 'Dr. Gizmo', title: 'Dr. Gizmo 🔬', roam: 2.5, clearance: true,
    look: { face: 'surprised', hair: 'afro', hat: 'none', shirt: 'dress', pants: 'jeans', skin: '#8d5a34', hairColor: '#e8e8e8', shirtColor: '#ffffff', shirtColor2: '#40c4ff', pantsColor: '#283593', shoesColor: '#111111' },
    hello: n => [`Ah, Agent ${n}! Come and see my drones! 🚁`, `${n}! Mind the propellers! 🔬`],
    tips: ['Right-click a drone to fly it! It goes up through the hatch in the roof. 🚁', 'Flying a drone: WASD to fly, Space up, C down, the mouse to look. E to bring it home!', 'Click while flying to drop a shower of sparkles on whoever\'s below! ✨', 'My night-vision goggles are in the vault, past the lasers. Wear them at night! 🥽'],
  },
];

// Things players hold that the town's people just have to comment on.
const COOL = {
  fireworks: 'Ooh, fireworks! Light one up! 🎆', balloon: 'What a pretty balloon! 🎈', waterballoon: "Don't you dare splash me with that! 😆",
  bubbles: 'Bubbles! I love bubbles! 🫧', jetpack: "A JETPACK?! That's the coolest thing ever! 🚀", trail: 'Ooh, sparkly! ✨',
  showtime: 'A whole fireworks show? Can I watch? 🎇', camera: 'Say cheese! 📸', ball: 'Playing fetch? 🎾',
  82: 'Is that a real diamond?! 💎', 83: 'A throne fit for a king! 👑', 84: 'Party time! 🪩', 85: "A golden trophy! You're a champion! 🏆",
  wrench: 'A wrench! Are you a mechanic? 🔧', skis: 'Off to the slopes? ⛷️', sneakers: 'Whoa, those sneakers! You must be SO fast! 👟',
  goldpaint: 'Gold paint?! Make my car gold next! ✨', vacationflag: 'A Vacation Flag! Where are you going on vacation? 🏖️', 93: 'A hot tub! So fancy! 🛁', 68: 'Aww, a teddy bear! 🧸', 79: 'A grand piano! Can you play it? 🎹',
};
// What Skye says on location (then a sign-off or two), and when she drops in on a player.
const BEATS = {
  plaza: { label: 'at the town square', lines: ["Good day, BuildZone! I'm live at the town square!", 'Mayor Maple says the flowers have never looked better!', 'Builders are busy all over town today. Just look at it!', 'Remember: gold coins are hiding all over town! 🪙'] },
  store: { label: 'at the Luxe Store', lines: ["I'm live at the Luxe Store, the fanciest shop in town! ✨", 'Is that... a real diamond block? Wow! 💎', 'Shoppers say the Jetpack is out of this world! 🚀', 'Penny says there\'s something sparkly for everyone!'] },
  weather: { label: 'at the weather station', lines: ["I'm live at the weather station! Today's forecast: sunny, with a chance of TACOS! 🌮", 'Stormy says the tacos fall when you pay! ⛅🌮', 'Look at that mast spin! That\'s a lot of wind! 🌬️'] },
  buildpark: { label: 'at the Build Park', lines: ["I'm at the Build Park! Rockets, volcanoes, fish tanks and a merry-go-round! 🚀🌋🐠🎠", 'Try them all, then build your own! 🧱', 'I just made a wish at the wishing well! ⭐'] },
  pizza: { label: 'at the Pizza Palace', lines: ['Live from the Pizza Palace, where the ovens never sleep! 🍕', 'Chef Rosa needs delivery helpers. Coins for pizza!', 'Mmm, can you smell that? Fresh pizza! 😋', 'Pizzas are flying out the door today!'] },
  tower: { label: 'at the tower', lines: ["I'm here at the tower, the tallest building in town! 🏢", "There's a grand piano all the way up at the top! 🎹", 'The view from the roof is amazing. Take the elevator! 🛗'] },
  camp: { label: 'at Sunny Shores Campground', lines: ['Live from Sunny Shores Campground! The campfires are crackling! 🔥', 'Camper vans as far as the eye can see! 🚐', 'In a camper van, press G and the roof pops up! ⛺', "The beach is just down the path. Surf's up! 🏖️"] },
  quarry: { label: 'at Big Rock Quarry', lines: ["I'm at Big Rock Quarry, where the dump trucks rumble! 🚚", 'Drive a dump truck under the chute to fill it with dirt! ⛏️', 'Then press G to dump it wherever you like! 🪨', 'Hard hats on, everybody! 👷'] },
  farm: { label: 'at Happy Acres Farm', lines: ['Live from Happy Acres Farm! Look at all those pumpkins! 🎃', 'The flower fields are in full bloom! 🌸', 'Hop in a pickup truck: a friend can ride in the back! 🛻', 'Nobody lives here yet. Claim it and it could be yours! 🚜'] },
  lodge: { label: 'at the ski lodge', lines: ['Brrr! Live from the ski lodge, up north! ❄️', 'The slopes are covered in fresh snow today! ⛷️', 'Grab some skis from the rack by the door and ride the lift to the top! 🚡', 'Coach Frost says: stay warm by the fire! 🔥'] },
};
const SIGN_OFFS = ["This is Skye Summers, BZ News, live! 🎤", "Stay tuned, I'll be back with more news! 📺"];
const GUEST_LINES = name => [
  `Breaking news! I'm here with ${name}, one of the best builders in town! 🎤`,
  `${name}, say hi to everyone watching at home! 👋`,
  `What are you building today, ${name}? It looks amazing!`,
  `${name}, you're a star! ⭐ Back to you in the studio!`,
];

const PET_WORDS = { dog: 'puppy', cat: 'kitty', bunny: 'bunny', pig: 'piggy', dragon: 'dragon' };

const SECOND = 1000;

export class NpcCrew {
  constructor(room) {
    this.room = room;
    this.list = [];
    this.clock = 0;
  }

  // Puts everyone where they work (if that place is in this world).
  setup(places) {
    this.list = [];
    this.lands = []; // land with bodyguards: nobody but its own guards (and guests) goes in
    this.zone = places?.base?.zone || null; // the Secret Agency's base: clearance only
    this.familySig = null; // (families come back in a moment: see syncFamilies)
    for (const def of NPCS) {
      const place = def.place === 'plaza' ? { x: 4.5, y: 0, z: 6.5, face: 0, area: [-7, -7, 7, 7] }
        : def.place === 'coach' ? { x: -4.5, y: 0, z: 6.5, face: 0, area: [-7, -7, 7, 7] }
          : def.place === 'kids' ? { x: -3.5 + (def.id % 3) * 2, y: 0, z: -3.5, face: Math.PI, area: [-9, -9, 9, 9] }
            : places?.[def.place];
      if (!place) continue;
      // (The park's kids spread out round it.)
      const spread = def.pal ? [((-def.id) % 3 - 1) * 5, (Math.floor((-def.id) / 3) % 2 ? 1 : -1) * 4] : [0, 0];
      const home = this.findStand(place.x + spread[0], place.y ?? 0, place.z + spread[1], def) || this.findStand(place.x, place.y ?? 0, place.z, def) || [place.x, place.y ?? 0, place.z];
      this.list.push({
        def, id: def.id, home, area: place.area, face: place.face ?? 0,
        pos: home.slice(), yaw: place.face ?? 0, goal: null, wait: 2 + Math.random() * 4,
        action: NPC_ACT.idle, actionT: 0, saidAt: 0, look: sanitizeLook(def.look),
        seen: new Map(), // client id -> when we last said hello
        noticed: new Map(), // "client id:item" -> when we last said something about it
        petted: new Map(), // client id -> when we last petted their pet
        task: null, // what we're busy with: walking over to pet a pet
      });
    }
  }

  info() {
    return this.list.map(n => ({ id: n.id, name: n.def.title, look: n.look }));
  }

  states() {
    const r = v => Math.round(v * 100) / 100;
    return this.list.map(n => [n.id, r(n.pos[0]), r(n.pos[1]), r(n.pos[2]), r(n.yaw), n.action, n.pose || 0]);
  }

  // ---------- Where they can walk ----------

  solid(x, y, z) {
    return y < 0 ? this.room.groundSolid(x, y, z) : isSolidBlock(itemOf(this.room.get(x, y, z)));
  }

  // def: who's asking (the base is only for the Agency's own people).
  standable(x, y, z, def = null) {
    if (!this.mayGo(x, y, z, def)) return false;
    const v = this.room.get(x, y, z);
    return !this.solid(x, y, z) && !this.solid(x, y + 1, z) && this.solid(x, y - 1, z) && blockId(itemOf(v)) !== 36 && blockId(v >> 16) !== 36;
  }

  // Somewhere this person is let in: not the Agency's base without clearance, and not land
  // with bodyguards that aren't theirs.
  mayGo(x, y, z, def = null) {
    if (this.zone && !def?.clearance && inZone(this.zone, x + 0.5, y, z + 0.5)) return false;
    for (const l of this.lands) if (def?.land !== l.key && def?.home !== l.key && x >= l.rect[0] && x <= l.rect[2] && z >= l.rect[1] && z <= l.rect[3]) return false;
    return true;
  }

  // The nearest spot to stand on, near (x, y, z).
  findStand(x, y, z, def = null) {
    for (let r = 0; r <= 3; r++)
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          const cx = Math.floor(x) + dx, cz = Math.floor(z) + dz;
          if (this.standable(cx, y, cz, def)) return [cx + 0.5, y, cz + 0.5];
        }
    return null;
  }

  // Can we walk in a straight line from a to b (on one level)?
  clearLine(a, b, def = null) {
    const d = Math.hypot(b[0] - a[0], b[2] - a[2]), steps = Math.ceil(d / 0.3);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.standable(Math.floor(a[0] + (b[0] - a[0]) * t), a[1], Math.floor(a[2] + (b[2] - a[2]) * t), def)) return false;
    }
    return true;
  }

  // ---------- Talking ----------

  say(n, text, force = false) {
    const now = Date.now();
    if (!force && now - n.saidAt < 2.5 * SECOND) return false;
    n.saidAt = now;
    this.room.broadcast({ t: 'npc_say', id: n.id, text });
    return true;
  }

  act(n, action, seconds) {
    n.action = action;
    n.actionT = seconds;
  }

  face(n, x, z) {
    n.yaw = Math.atan2(-(x - n.pos[0]), -(z - n.pos[2]));
  }

  near(n, x, y, z, r) {
    return Math.abs(y - n.pos[1]) < 4 && Math.hypot(x - n.pos[0], z - n.pos[2]) < r;
  }

  // ---------- Every tick ----------

  update(dt) {
    if (!this.list.length) return;
    const now = Date.now();
    const players = [...this.room.clients.values()].filter(c => c.joined && !c.car);
    for (const n of this.list) {
      n.actionT -= dt;
      if (n.actionT <= 0 && n.action !== NPC_ACT.walk) n.action = NPC_ACT.idle;
      if (n.game) continue; // (a kid in a game of tag or hide-and-seek: playground.js moves them)
      if (n.catch || n.escort) {
        this.guardChase(n, dt); // (a bodyguard running after an intruder, or walking them off the land)
        continue;
      }
      if (n.follow) {
        this.followFriend(n, dt, now); // (someone's best friend: they come everywhere with them)
        continue;
      }
      if (n.def.reporter) this.report(n, dt, players);
      this.notice(n, players, now);
      if (n.nav) this.homeMove(n, dt, players);
      else this.move(n, dt, players);
    }
    this.clock += dt;
    this.shutDoors(this.clock * 1000);
  }

  // Say hello, admire things, go and pet pets.
  notice(n, players, now) {
    if (n.task || n.actionT > 0) return;
    if (n.def.guard) return this.guardWatch(n, players, now);
    if (n.def.land) return this.bodyguardWatch(n, players, now);
    for (const c of players) {
      const [x, y, z] = c.pos;
      if (!this.near(n, x, y, z, 5)) continue;
      if (now - (n.seen.get(c.id) || 0) > 120 * SECOND) {
        n.seen.set(c.id, now);
        this.face(n, x, z);
        this.act(n, NPC_ACT.wave, 2);
        this.say(n, pickOne(n.def.hello(c.name, this.room)), true);
        return;
      }
      const hold = c.hold;
      const line = COOL[hold];
      const key = `${c.id}:${hold}`;
      if (line && now - (n.noticed.get(key) || 0) > 180 * SECOND && this.near(n, x, y, z, 6)) {
        n.noticed.set(key, now);
        this.face(n, x, z);
        this.act(n, NPC_ACT.cheer, 1.5);
        this.say(n, line);
        return;
      }
      // A pet! Go over and give it a pat.
      const pet = Array.isArray(c.pet) ? c.pet : null;
      if (pet && c.look?.pet !== 'none' && now - (n.petted.get(c.id) || 0) > 75 * SECOND && this.near(n, pet[0], pet[1], pet[2], 7)) {
        n.petted.set(c.id, now);
        n.task = { kind: 'pet', client: c.id, until: now + 8 * SECOND };
        return;
      }
    }
  }

  move(n, dt, players) {
    const now = Date.now();
    let target = null;
    if (n.task?.kind === 'pet') {
      const c = this.room.clients.get(n.task.client);
      const pet = c && Array.isArray(c.pet) ? c.pet : null;
      if (!pet || now > n.task.until) {
        n.task = null;
      } else {
        const d = Math.hypot(pet[0] - n.pos[0], pet[2] - n.pos[2]);
        if (d < 1.1) return this.patPet(n, c, pet);
        target = [pet[0] - ((pet[0] - n.pos[0]) / d) * 0.8, n.pos[1], pet[2] - ((pet[2] - n.pos[2]) / d) * 0.8];
      }
    }
    if (n.actionT > 0 && n.action !== NPC_ACT.walk) return; // busy waving, dancing, petting
    if (!target) {
      if (!n.goal) {
        n.wait -= dt;
        // Standing about: look at whoever is nearby.
        const c = players.find(p => this.near(n, p.pos[0], p.pos[1], p.pos[2], 6));
        if (c) n.yaw = turn(n.yaw, Math.atan2(-(c.pos[0] - n.pos[0]), -(c.pos[2] - n.pos[2])), dt * 4);
        else if (Math.hypot(n.pos[0] - n.home[0], n.pos[2] - n.home[2]) < 0.6) n.yaw = turn(n.yaw, n.face, dt * 2);
        if (n.wait <= 0) n.goal = this.wanderGoal(n);
        n.action = NPC_ACT.idle;
        if (!n.goal) return;
      }
      target = n.goal;
    }
    // Walk toward the target, if the way is clear.
    const dx = target[0] - n.pos[0], dz = target[2] - n.pos[2], d = Math.hypot(dx, dz);
    if (d < 0.15) {
      n.goal = null;
      n.wait = 2 + Math.random() * 5;
      n.action = NPC_ACT.idle;
      return;
    }
    const step = Math.min(d, 1.4 * dt);
    const next = [n.pos[0] + (dx / d) * step, n.pos[1], n.pos[2] + (dz / d) * step];
    if (!this.standable(Math.floor(next[0]), n.pos[1], Math.floor(next[2]), n.def)) {
      n.goal = null;
      if (n.task) n.task = null;
      n.wait = 1;
      n.action = NPC_ACT.idle;
      return;
    }
    n.pos = next;
    n.yaw = turn(n.yaw, Math.atan2(-dx, -dz), dt * 8);
    n.action = NPC_ACT.walk;
  }

  // Crouch down and give someone's pet a pat.
  patPet(n, c, pet) {
    this.face(n, pet[0], pet[2]);
    this.act(n, NPC_ACT.pet, 2.5);
    const kind = c.look?.pet || 'dog';
    this.say(n, kind === 'dragon' ? 'A baby dragon?! How amazing! 🐉' : pickOne([`Aww, what a cute ${PET_WORDS[kind] || kind}! 🐾`, `Who's a good ${PET_WORDS[kind] || kind}? You are! 💕`, `Hello, little ${PET_WORDS[kind] || kind}! 🐾`]), true);
    this.room.broadcast({ t: 'fx', kind: 'hearts', x: pet[0], y: pet[1] + 0.6, z: pet[2], color: '#ffffff', seed: 0 });
    c.send({ t: 'npc_pet' });
    n.task = null;
    n.goal = null;
    n.path = null;
    n.chase = null;
  }

  // Somewhere nearby to stroll to (home, now and then).
  wanderGoal(n) {
    if (Math.random() < 0.3) return n.home.slice();
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * n.def.roam;
      const x = n.home[0] + Math.cos(a) * r, z = n.home[2] + Math.sin(a) * r;
      if (n.area && (x < n.area[0] || x > n.area[2] + 1 || z < n.area[1] || z > n.area[3] + 1)) continue;
      const spot = [Math.floor(x) + 0.5, n.home[1], Math.floor(z) + 0.5];
      if (this.standable(Math.floor(x), n.home[1], Math.floor(z), n.def) && this.clearLine(n.pos, spot, n.def)) return spot;
    }
    return null;
  }

  // ---------- Getting about at home (families and bodyguards) ----------
  // They have a map of their land and just round it (homenav.js): every room, every floor (up
  // the stairs, up ladders, and in elevators), the yard. They stroll from place to place, go and
  // say hi when the owner comes home, pat pets, and the bodyguards walk right up to anyone who
  // shouldn't be there. They keep away from garage doors.

  homeWorld(n) {
    const def = n.def, [x0, z0, x1, z1] = n.nav.rect;
    const own = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
    return {
      get: (x, y, z) => this.room.get(x, y, z),
      solid: (x, y, z) => this.solid(x, y, z),
      stand: (x, y, z) => this.standable(x, y, z, def),
      own,
      // (Their own land, and anywhere just round it that isn't somebody else's.)
      allowed: (x, z) => own(x, z) || !claimAt(this.room.claims || [], x, z),
      garages: n.map?.garages || [],
    };
  }

  cellOf(n) {
    return [Math.floor(n.pos[0]), Math.round(n.pos[1]), Math.floor(n.pos[2])];
  }

  // The map of where they live (shared by everyone who lives there, and made again every half
  // a minute or so, or sooner when the way's been blocked).
  homeMap(n, soon = false) {
    const now = Date.now(), here = cellKey(...this.cellOf(n));
    this.homeMaps ??= new Map();
    const shared = this.homeMaps.get(n.nav.key);
    const good = m => m && now - m.at < (soon || m.stale ? 3000 : 30000) && m.map.nodes.has(here);
    if (good(shared)) return (n.map = shared.map);
    if (good(n.ownMap)) return (n.map = n.ownMap.map);
    if (n.mapAt && now - n.mapAt < 3000) return n.map?.nodes.has(here) ? n.map : null;
    n.mapAt = now;
    const map = this.buildHome(n, this.cellOf(n));
    const entry = { map, at: now };
    if (!shared || now - shared.at > 3000 || map.nodes.size >= shared.map.nodes.size) this.homeMaps.set(n.nav.key, entry);
    else n.ownMap = entry;
    return (n.map = map);
  }

  buildHome(n, seed) {
    const [x0, z0, x1, z1] = n.nav.rect, M = 3;
    return buildMap(this.homeWorld(n), [x0 - M, z0 - M, x1 + M, z1 + M], seed);
  }

  // What to do next, and where: lie on a bed, sit on a chair or the couch (maybe with a book),
  // read at a bookshelf, look out of a window, or just wander off to another room, another
  // floor or the yard. Always somewhere away from everyone else who lives there, so they spread
  // out round the house instead of trailing after each other. Bodyguards patrol: the house, the
  // yard, the front door, and the windows. Returns { key, spot } (spot: null for a stroll).
  homePlan(n) {
    const map = n.map;
    if (!map?.nodes.size) return null;
    const guard = !!n.def.land, here = this.cellOf(n);
    const mates = this.list.filter(o => o !== n && o.nav?.key === n.nav.key);
    const theirs = [];
    for (const o of mates) {
      theirs.push(o.doing?.back || o.pos);
      const g = o.goalKey && map.nodes.get(o.goalKey);
      if (g) theirs.push([g.x + 0.5, g.y, g.z + 0.5]);
    }
    const busy = new Set(mates.flatMap(o => [o.plan?.id, o.doing?.id]).filter(Boolean));
    // (Not a bed somebody's asleep in.)
    const sleepers = [...this.room.clients.values()].filter(c => c.joined && (c.sleeping || c.flags & 1) && c.pos); // (1: lying down, see FLAG in avatars.js)
    for (const sp of map.spots || []) if (sp.kind === 'bed' && sleepers.some(c => Math.hypot(c.pos[0] - sp.pos[0], c.pos[2] - sp.pos[2]) < 1.5 && Math.abs(c.pos[1] - sp.pos[1]) < 1)) busy.add(sp.id);
    // How far from the nearest of them (another floor counts as far).
    const room = m => theirs.reduce((best, p) => Math.min(best, Math.hypot(p[0] - m.x - 0.5, p[2] - m.z - 0.5) + Math.abs(p[1] - m.y) * 3), 99);
    const usable = m => m && m.f === STAND && !nearGarage(map.garages, m.x, m.y, m.z, 3) && !m.to.some(e => e[1] === RIDE);
    const far = m => m.y !== here[1] || Math.hypot(m.x - here[0], m.z - here[2]) > 3;
    // The best few of some candidates (the roomiest), then one of those at random.
    const choose = list => {
      const scored = list.map(c => ({ ...c, room: room(map.nodes.get(c.key)) + Math.random() * 3 })).sort((x, y) => y.room - x.room);
      const roomy = scored.filter(c => c.room >= 4);
      const pool = (roomy.length ? roomy : scored).slice(0, 3);
      return pool.length ? pickOne(pool) : null;
    };
    const kinds = { bed: [], seat: [], shelf: [], window: [] };
    for (const s of map.spots || []) {
      if (busy.has(s.id) || s.id === n.lastSpot || (guard && s.kind !== 'window')) continue;
      if (!usable(map.nodes.get(s.from)) && s.kind !== 'bed' && s.kind !== 'seat') continue;
      kinds[s.kind].push({ key: s.from, spot: s });
    }
    // Somewhere to stroll to: usually another floor or another room, in the house more often
    // than out in the yard.
    const stroll = [];
    const levels = new Map();
    for (const [k, m] of map.nodes) {
      if (!usable(m) || !far(m)) continue;
      if (!levels.has(m.y)) levels.set(m.y, []);
      levels.get(m.y).push({ key: k, m });
    }
    const floors = [...levels.values()].filter(l => l.length >= 4); // (not the steps of the stairs)
    if (floors.length) {
      const level = pickOne(floors);
      const inside = level.filter(c => c.m.roof), outside = level.filter(c => !c.m.roof);
      const pool = inside.length && (!outside.length || Math.random() < (guard ? 0.5 : 0.65)) ? inside : outside;
      for (let i = 0; i < 24 && pool.length; i++) stroll.push({ key: pickOne(pool).key, spot: null });
    }
    if (n.post) {
      const k = nearestNode(map, n.post[0], n.post[1], n.post[2], 4);
      // (Standing guard there for a while, looking out.)
      const ahead = [n.post[0] - Math.sin(n.face) * 4, n.post[2] - Math.cos(n.face) * 4];
      if (k && !busy.has('post') && Math.hypot(n.post[0] - n.pos[0], n.post[2] - n.pos[2]) > 2.5) kinds.post = [{ key: k, spot: { kind: 'post', id: 'post', face: ahead } }];
    }
    const night = isNightTime(this.room.time ?? 0);
    const weights = guard ? { stroll: 2, window: 1.2, post: 1.6 } : { stroll: 1.2, seat: 2.4, bed: night ? 6 : 1, shelf: 1, window: 0.8 };
    const options = Object.entries(weights).map(([kind, w]) => [kind === 'stroll' ? stroll : kinds[kind] || [], w]).filter(([l]) => l.length);
    let total = options.reduce((t, [, w]) => t + w, 0);
    while (options.length) {
      let r = Math.random() * total, i = 0;
      while (i < options.length - 1 && (r -= options[i][1]) > 0) i++;
      const c = choose(options[i][0]);
      if (c) return c;
      total -= options[i][1];
      options.splice(i, 1);
    }
    return null;
  }

  // Someone wants this bed: whoever's lying in it sits up on the edge, then gets out (and says
  // night night, and goes off somewhere else).
  helpUp(c, id) {
    const n = this.list.find(m => m.id === id), d = n?.doing;
    if (!d || d.kind !== 'bed' || !c.pos || Math.hypot(c.pos[0] - n.pos[0], c.pos[2] - n.pos[2]) > 4) return;
    const back = d.back;
    n.pos = [n.pos[0] + (back[0] - n.pos[0]) * 0.45, back[1] - 0.16, n.pos[2] + (back[2] - n.pos[2]) * 0.45]; // (on the edge of the bed)
    this.face(n, back[0], back[2]);
    n.pose = NPC_POSE.sit;
    n.doing = { kind: 'up', id: d.id, t: 1.3, back, face: null, helper: c.name };
    this.say(n, pickOne(['Oh! Is it your turn? 😴', 'Yawn… okay, okay! 😄', 'Mmm… bedtime already? 😊']), true);
  }

  // Doing something (lying in bed, sitting, reading, looking out of the window) until it's time
  // to get up. Saying hello to the boss gets them up (unless they're asleep).
  homeDoing(n, dt, players, now) {
    const d = n.doing;
    d.t -= dt;
    if (d.kind === 'up') {
      // Out of bed, a wave goodnight, and off they go in a moment.
      if (d.t > 0) return;
      this.stopDoing(n);
      this.act(n, NPC_ACT.wave, 1.5);
      this.say(n, pickOne([`Night night, ${d.helper}! 🌙`, 'Sweet dreams! 💤', 'Sleep tight! 🌙']), true);
      n.wait = 2;
      return;
    }
    if (n.task?.kind === 'pet') n.task = null; // (too comfy to go and pat pets)
    const chase = d.kind === 'bed' ? null : this.homeChase(n, players, now);
    if (d.t <= 0 || chase || !this.stillThere(d)) return this.stopDoing(n);
    if (d.face) n.yaw = turn(n.yaw, Math.atan2(-(d.face[0] - n.pos[0]), -(d.face[1] - n.pos[2])), dt * 4);
    n.action = NPC_ACT.idle;
  }

  // Is the bed (or chair) still there?
  stillThere(d) {
    if (d.kind !== 'bed' && d.kind !== 'seat') return true;
    const [x, y, z] = d.id.split(',').map(Number), def = BLOCKS[blockId(itemOf(this.room.get(x, y, z)))];
    return d.kind === 'bed' ? def === BLOCKS[64] : !!def?.seat;
  }

  startDoing(n, spot) {
    if (!this.stillThere({ kind: spot.kind, id: spot.id })) return this.restAWhile(n);
    const night = isNightTime(this.room.time ?? 0);
    const [lo, hi] = { bed: night ? [90, 220] : [40, 110], seat: [25, 75], shelf: [12, 28], window: [8, 20], post: [20, 45] }[spot.kind];
    n.doing = { kind: spot.kind, id: spot.id, t: lo + Math.random() * (hi - lo), back: n.pos.slice(), face: spot.face || null };
    n.lastSpot = spot.id;
    if (spot.pos) {
      n.pos = spot.pos.slice();
      n.yaw = spot.yaw;
    }
    if (spot.face) this.face(n, spot.face[0], spot.face[1]);
    n.pose = spot.kind === 'bed' ? NPC_POSE.lie : spot.kind === 'seat' ? (Math.random() < 0.4 ? NPC_POSE.read : NPC_POSE.sit) : spot.kind === 'shelf' ? NPC_POSE.readStanding : NPC_POSE.none;
    n.action = NPC_ACT.idle;
  }

  stopDoing(n) {
    const d = n.doing;
    n.doing = null;
    n.pose = NPC_POSE.none;
    if (d?.back) n.pos = d.back.slice();
    // (Up, and off somewhere else: not hanging about by the couch.)
    n.wait = 0.5 + Math.random() * 2;
    n.action = NPC_ACT.idle;
  }

  // A little while standing about before the next thing.
  restAWhile(n) {
    n.wait = n.def.land ? 8 + Math.random() * 12 : 6 + Math.random() * 16;
    n.action = NPC_ACT.idle;
  }

  // Someone (or something) to go over to: a pet to pat, the boss coming home, or (for
  // bodyguards) somebody who's not on the guest list. { id, x, y, z, near }
  homeChase(n, players, now) {
    if (n.task?.kind === 'pet') {
      const c = this.room.clients.get(n.task.client);
      const pet = c && Array.isArray(c.pet) ? c.pet : null;
      if (!pet || now > n.task.until) n.task = null;
      else return { id: `pet:${c.id}`, x: pet[0], y: pet[1], z: pet[2], near: 1.1, pet, c };
    }
    const [x0, z0, x1, z1] = n.nav.rect;
    const onLand = (p, m) => p[0] >= x0 - m && p[0] <= x1 + 1 + m && p[2] >= z0 - m && p[2] <= z1 + 1 + m && Math.abs(p[1] - n.pos[1]) < 9;
    const land = n.def.land && this.lands.find(l => l.key === n.def.land);
    let best = null, bossHome = false;
    for (const c of players) {
      if (!c.pos || c.sleeping) continue;
      const boss = nameKey(c.name) === n.nav.key, seenKey = n.def.land ? `${c.id}:true` : c.id;
      if (land && !this.room.welcomeOn(land, c) && onLand(c.pos, 2)) {
        if (onLand(c.pos, 0)) return { id: c.id, x: c.pos[0], y: c.pos[1], z: c.pos[2], near: 2 };
        // Just outside: shadow them along the edge (like a puppy), staying between them and the
        // land. Just one of us: whoever's nearest and free.
        const nearest = this.list.filter(g => g.def.land === land.key && !g.catch && !g.escort && !g.ride)
          .sort((a, b) => Math.hypot(a.pos[0] - c.pos[0], a.pos[2] - c.pos[2]) - Math.hypot(b.pos[0] - c.pos[0], b.pos[2] - c.pos[2]))[0];
        if (nearest !== n) continue;
        const sx = Math.min(x1 + 0.5, Math.max(x0 + 0.5, c.pos[0])), sz = Math.min(z1 + 0.5, Math.max(z0 + 0.5, c.pos[2]));
        return { id: c.id, x: sx, y: n.pos[1], z: sz, near: 0.6, shadow: true, lx: c.pos[0], lz: c.pos[2] };
      }
      if (!boss || !onLand(c.pos, 4)) continue;
      bossHome = true;
      // (Just come home: go and say hi. Not every time they walk past, though.)
      if (now - (n.bossHome ||= now) < 25 * SECOND && now - (n.seen.get(seenKey) || 0) > 120 * SECOND) best = { id: c.id, x: c.pos[0], y: c.pos[1], z: c.pos[2], near: 3 };
    }
    if (!bossHome) n.bossHome = 0;
    return best;
  }

  homeMove(n, dt, players) {
    if (n.ride) return this.rideLift(n, dt);
    if (n.stay) {
      // Staying put by someone we've just seen off (so they can ask to come in).
      const c = this.room.clients.get(n.stay.client);
      if (!c?.joined || !c.pos || Date.now() > n.stay.until || Math.hypot(c.pos[0] - n.pos[0], c.pos[2] - n.pos[2]) > 12) n.stay = null;
      else {
        n.yaw = turn(n.yaw, Math.atan2(-(c.pos[0] - n.pos[0]), -(c.pos[2] - n.pos[2])), dt * 4);
        if (n.actionT <= 0) n.action = NPC_ACT.idle;
        return;
      }
    }
    if (n.doing) return this.homeDoing(n, dt, players, Date.now());
    const step = n.path?.[n.pathI];
    const between = step && (step.how === CLIMB || Math.abs(n.pos[1] - Math.round(n.pos[1])) > 0.01);
    if (n.actionT > 0 && n.action !== NPC_ACT.walk && !between) return; // busy waving, dancing, petting
    const now = Date.now();
    const chase = between ? null : this.homeChase(n, players, now);
    if (between) {
      // (Finish the step, or the climb, first.)
    } else if (chase) {
      const d = Math.hypot(chase.x - n.pos[0], chase.z - n.pos[2]);
      n.shadow = !!chase.shadow;
      if (d < chase.near && Math.abs(chase.y - n.pos[1]) < 1.5) {
        if (chase.pet) return this.patPet(n, chase.c, chase.pet);
        if (n.chase) [n.path, n.chase] = [null, null];
        this.face(n, chase.lx ?? chase.x, chase.lz ?? chase.z);
        n.action = NPC_ACT.idle;
        return;
      }
      n.shadowT = (n.shadowT ?? 0) - dt;
      const moved = chase.shadow && n.chase && Math.hypot(n.chase.x - chase.x, n.chase.z - chase.z) > 1 && n.shadowT <= 0;
      if (moved) n.shadowT = 0.3;
      if (n.chase?.id !== chase.id || now - n.chaseAt > 1500 || moved) {
        n.chase = chase;
        n.chaseAt = now;
        const map = this.homeMap(n);
        const goal = map && nearestNode(map, chase.x, chase.y, chase.z, 5);
        const path = goal && route(map, cellKey(...this.cellOf(n)), goal);
        if (path?.length) {
          this.setPath(n, path, goal);
          n.plan = null;
        } else if (chase.pet) n.task = null; // (can't get there from here)
      }
    } else if (n.chase) [n.path, n.chase, n.shadow] = [null, null, false];
    if (!n.path) {
      n.action = NPC_ACT.idle;
      n.wait -= dt;
      const c = players.find(p => this.near(n, p.pos[0], p.pos[1], p.pos[2], 6));
      if (c) n.yaw = turn(n.yaw, Math.atan2(-(c.pos[0] - n.pos[0]), -(c.pos[2] - n.pos[2])), dt * 4);
      if (n.wait > 0) return;
      const map = this.homeMap(n);
      const plan = map && this.homePlan(n);
      const path = plan && route(map, cellKey(...this.cellOf(n)), plan.key);
      if (!path) {
        n.wait = 2 + Math.random() * 3;
        return;
      }
      if (!path.length) return plan.spot ? this.startDoing(n, plan.spot) : this.restAWhile(n);
      this.setPath(n, path, plan.key);
      n.plan = plan.spot;
    }
    this.followPath(n, dt);
  }

  setPath(n, path, goal) {
    n.path = path;
    n.pathI = 0;
    n.stepOk = false;
    n.goalKey = goal;
  }

  // Is the next bit of the way still there? (Someone might have built in the way.)
  stepOk(n, step) {
    if (step.how === RIDE) {
      const get = (x, y, z) => this.room.get(x, y, z), y = Math.round(n.pos[1]);
      const col = liftColumn(get, step.sx, y, step.sz);
      return !!col && liftStops((a, b, c) => this.solid(a, b, c), step.sx, step.sz, col.lo, col.hi, col.facing).includes(step.y);
    }
    const f = cellFlags(this.homeWorld(n), step.x, step.y, step.z);
    return !!f && (f & DOOR) === (step.f & DOOR);
  }

  followPath(n, dt) {
    const step = n.path[n.pathI];
    if (!n.stepOk) {
      if (!this.stepOk(n, step)) {
        // Blocked: stop, and look again in a moment (with a new map).
        const shared = this.homeMaps?.get(n.nav.key);
        if (shared) shared.stale = true;
        if (n.ownMap) n.ownMap.stale = true;
        [n.path, n.chase, n.goalKey, n.plan] = [null, null, null, null];
        n.wait = 1;
        n.action = NPC_ACT.idle;
        return;
      }
      n.stepOk = true;
      if (step.how === RIDE) return this.startRide(n, step);
      if (step.f & DOOR) this.openDoor(n, step.x, step.y, step.z);
    }
    const tx = step.x + 0.5, tz = step.z + 0.5, ty = step.y;
    const dx = tx - n.pos[0], dz = tz - n.pos[2], d = Math.hypot(dx, dz), dy = ty - n.pos[1];
    if (step.how === CLIMB) {
      n.pos[1] += Math.sign(dy) * Math.min(Math.abs(dy), (n.catch ? n.catch.speed / 2 : 1.8) * dt);
    } else {
      const s = Math.min(d, (n.catch ? n.catch.speed : n.escort ? 3 : n.shadow ? 5 : n.def.land ? 1.7 : 1.4) * dt); // (bodyguards run after intruders)
      if (d > 1e-6) {
        n.pos[0] += (dx / d) * s;
        n.pos[2] += (dz / d) * s;
        n.yaw = turn(n.yaw, Math.atan2(-dx, -dz), dt * 8);
      }
      // Up a step straight away, but down one only once we're over it.
      if (dy > 0 || (dy < 0 && d < 0.55)) n.pos[1] += Math.sign(dy) * Math.min(Math.abs(dy), 5 * dt);
    }
    n.action = NPC_ACT.walk;
    if (d < 0.02 && Math.abs(ty - n.pos[1]) < 0.01) {
      n.pos = [tx, ty, tz];
      this.stepDone(n);
    }
  }

  stepDone(n) {
    n.pathI++;
    n.stepOk = false;
    if (n.pathI < n.path.length) return;
    const plan = n.plan;
    [n.path, n.chase, n.goalKey, n.plan] = [null, null, null, null];
    if (plan) this.startDoing(n, plan);
    else this.restAWhile(n);
  }

  // ---------- Doors and elevators at home ----------

  // Open a door to go through it (it's shut again once they're through: see shutDoors).
  openDoor(n, x, y, z) {
    const d = doorAt((a, b, c) => this.room.get(a, b, c), x, y, z);
    if (!d || blockMeta(itemOf(this.room.get(x, d.lo, z))) & DOOR_OPEN) return;
    const cells = [];
    for (let yy = d.lo; yy <= d.hi; yy++) {
      const v = toggleDoorValue(this.room.get(x, yy, z));
      this.room.world.set(blockKey(x, yy, z), v);
      cells.push(x, yy, z, v);
    }
    this.room.broadcast({ t: 'many', cells });
    this.room.onDirty?.();
    (this.doorsOpen ??= []).push({ x, z, lo: d.lo, cells, at: this.clock * 1000 });
  }

  // Doors they opened, shut once nobody's in the doorway (unless someone's changed them since).
  shutDoors(now) {
    if (this.liftsOpen?.length) {
      this.liftsOpen = this.liftsOpen.filter(l => {
        if (now < l.at) return true;
        this.liftDoors(l.x, l.z, l.y, false);
        return false;
      });
    }
    if (!this.doorsOpen?.length) return;
    this.doorsOpen = this.doorsOpen.filter(o => {
      if (now - o.at < 1200) return true;
      const inDoor = p => p && Math.abs(p[0] - o.x - 0.5) < 1 && Math.abs(p[2] - o.z - 0.5) < 1 && Math.abs(p[1] - o.lo) < 2;
      if (now - o.at < 30 * SECOND && (this.list.some(n => inDoor(n.pos)) || [...this.room.clients.values()].some(c => c.joined && inDoor(c.pos)))) return true;
      for (let i = 0; i < o.cells.length; i += 4) if (this.room.get(o.cells[i], o.cells[i + 1], o.cells[i + 2]) !== o.cells[i + 3]) return false;
      const cells = [];
      for (let i = 0; i < o.cells.length; i += 4) {
        const [x, y, z, v] = o.cells.slice(i, i + 4), shut = toggleDoorValue(v);
        this.room.world.set(blockKey(x, y, z), shut);
        cells.push(x, y, z, shut);
      }
      this.room.broadcast({ t: 'many', cells });
      this.room.onDirty?.();
      return false;
    });
  }

  // An elevator's doors at one floor sliding open or shut (on everyone's screen).
  liftDoors(x, z, y, open, ding = false) {
    this.room.broadcast({ t: 'lift_doors', x, z, y, open, ding });
  }

  startRide(n, step) {
    const y0 = Math.round(n.pos[1]);
    n.ride = { x: step.sx, z: step.sz, y0, y1: step.y, from: [n.pos[0], n.pos[2]], out: [step.x + 0.5, step.z + 0.5], phase: 'call', t: 0, travel: Math.max(1.4, Math.abs(step.y - y0) / 6 + 1) };
    this.face(n, step.sx + 0.5, step.sz + 0.5);
    this.liftDoors(step.sx, step.sz, y0, true);
    n.action = NPC_ACT.idle;
  }

  // Riding: in through the doors, they shut, up (or down) the shaft, ding, out.
  rideLift(n, dt) {
    const r = n.ride, cx = r.x + 0.5, cz = r.z + 0.5;
    r.t += dt;
    const k = t => Math.min(1, r.t / t);
    const next = phase => [r.phase, r.t] = [phase, 0];
    if (r.phase === 'call') {
      n.action = NPC_ACT.idle;
      if (r.t > 0.8) next('in');
    } else if (r.phase === 'in') {
      n.action = NPC_ACT.walk;
      n.pos = [r.from[0] + (cx - r.from[0]) * k(0.5), r.y0, r.from[1] + (cz - r.from[1]) * k(0.5)];
      if (r.t >= 0.5) {
        n.yaw = Math.atan2(-(r.out[0] - cx), -(r.out[1] - cz)); // (turned round to face the doors)
        this.liftDoors(r.x, r.z, r.y0, false);
        next('shut');
      }
    } else if (r.phase === 'shut') {
      n.action = NPC_ACT.idle;
      if (r.t >= 0.5) next('go');
    } else if (r.phase === 'go') {
      const e = k(r.travel), s = e * e * (3 - 2 * e);
      n.pos = [cx, r.y0 + (r.y1 - r.y0) * s, cz];
      if (r.t >= r.travel) {
        this.liftDoors(r.x, r.z, r.y1, true, true);
        next('open');
      }
    } else if (r.phase === 'open') {
      if (r.t >= 0.5) next('out');
    } else {
      n.action = NPC_ACT.walk;
      n.pos = [cx + (r.out[0] - cx) * k(0.5), r.y1, cz + (r.out[1] - cz) * k(0.5)];
      if (r.t >= 0.5) {
        (this.liftsOpen ??= []).push({ x: r.x, z: r.z, y: r.y1, at: this.clock * 1000 + 1200 });
        n.ride = null;
        n.pos = [r.out[0], r.y1, r.out[1]];
        this.stepDone(n);
      }
    }
  }

  // Where someone who lives here starts out: indoors on the ground floor if there's an indoors
  // (not by the garage door), else somewhere on the land.
  homeStart(n, seeds) {
    let map = null;
    for (const s of seeds) {
      const m = this.buildHome(n, [Math.floor(s[0]), Math.round(s[1]), Math.floor(s[2])]);
      if (!map || m.nodes.size > map.nodes.size) map = m;
      if (map.nodes.size >= 30) break;
    }
    if (!map?.nodes.size) return;
    const [x0, z0, x1, z1] = n.nav.rect;
    const spots = [...map.nodes.values()].filter(m => m.f === STAND && !nearGarage(map.garages, m.x, m.y, m.z, 3) && !m.to.some(e => e[1] === RIDE));
    const onLand = spots.filter(m => m.x >= x0 && m.x <= x1 && m.z >= z0 && m.z <= z1);
    const low = Math.min(...(onLand.length ? onLand : spots).map(m => m.y));
    const pool = [onLand.filter(m => m.roof && m.y === low), onLand.filter(m => m.roof), onLand, spots].find(l => l.length);
    if (!pool) return;
    const taken = p => this.list.some(o => o !== n && o.nav && Math.hypot(o.pos[0] - p.x - 0.5, o.pos[2] - p.z - 0.5) < 1.2);
    const free = pool.filter(p => !taken(p));
    const m = pickOne(free.length ? free : pool);
    n.home = n.pos = [m.x + 0.5, m.y, m.z + 0.5];
    n.pos = n.home.slice();
    n.map = map;
    this.homeMaps ??= new Map();
    this.homeMaps.set(n.nav.key, { map, at: Date.now() });
  }

  // ---------- Things happening around them ----------

  react(x, y, z, range, action, lines, cooldownKey) {
    const now = Date.now();
    for (const n of this.list) {
      if (!this.near(n, x, y - Math.min(30, Math.max(0, y - n.pos[1])), z, range)) continue;
      if (now - (n[cooldownKey] || 0) < 8 * SECOND) continue;
      n[cooldownKey] = now;
      this.face(n, x, z);
      this.act(n, action, 2.5);
      n.goal = null;
      this.say(n, pickOne(lines), true);
    }
  }

  onFirework(x, y, z) {
    this.react(x, y, z, 80, NPC_ACT.cheer, ['Wooow! 🎆', 'So pretty! ✨', 'Again! Again! 🎇', 'Ooooh! Aaaah! 🎆'], 'fireworkAt');
    if (Math.random() < 0.4) this.breaking(pickOne(['This just in: fireworks over BuildZone! Look up! 🎆', 'What a show! Somebody is setting off fireworks! 🎇']));
  }

  onExplosion(x, y, z) {
    this.react(x, y, z, 80, NPC_ACT.cheer, ['WHOA!! 💥', 'Yikes! Is everyone okay?! 😱', 'That car went BOOM! 💥'], 'boomAt');
    this.breaking(pickOne(['BREAKING NEWS: a car just went BOOM! Don\'t worry, everyone is OK! 💥', 'This just in: an explosion in town! A new car is on its way! 🚗', 'BREAKING NEWS: KABOOM! Somebody call the mechanic! 🔧']));
  }

  // It's raining tacos! Everyone near a player cheers (and Skye reports it).
  // It's raining something (paid for at the weather station): everyone near a player cheers, and
  // Skye reports it.
  onShower(kind, who) {
    const lines = {
      taco: ['TACOS! 🌮', 'Yum yum! 🌮😋', "It's raining tacos! 🌮🌮", 'Catch one! 🌮'],
      icecream: ['ICE CREAM! 🍦', 'Ice cream! 😋🍦', 'I want the strawberry one! 🍓🍦', 'Brain freeze! 🥶🍦'],
      pizza: ['PIZZA! 🍕', 'Pepperoni from the sky! 🍕😋', 'Pizza party! 🍕🎉', 'Catch a slice! 🍕'],
      donut: ['DONUTS! 🍩', 'Sprinkles! 🍩✨', 'Donut worry, be happy! 🍩😄', 'Yum! 🍩'],
      pets: ['Puppies! 🐶', 'Kitties! 🐱', "It's raining cats and dogs! 🐱🐶", 'Look, little parachutes! 🪂'],
    }[kind] || ['Wow! ⛅'];
    const players = [...this.room.clients.values()].filter(c => c.joined && c.pos);
    for (const n of this.list) {
      if (!players.some(c => this.near(n, c.pos[0], c.pos[1], c.pos[2], 30))) continue;
      this.face(n, n.pos[0], n.pos[2] - 1);
      this.act(n, NPC_ACT.cheer, 3);
      n.goal = null;
      this.say(n, pickOne(lines), true);
    }
    const what = { taco: 'TACOS', icecream: 'ICE CREAM', pizza: 'PIZZA', donut: 'DONUTS', pets: 'CATS AND DOGS (on little parachutes!)' }[kind] || 'something amazing';
    const icon = SHOWERS[kind]?.icon || '⛅';
    this.breaking(`BREAKING NEWS: it's raining ${what} all over BuildZone, thanks to ${who}! ${icon}${icon}`);
  }

  onDance(c) {
    const [x, y, z] = c.pos;
    for (const n of this.list) {
      if (!this.near(n, x, y, z, 10) || n.task) continue;
      this.face(n, x, z);
      this.act(n, NPC_ACT.dance, 4);
      n.goal = null;
      this.say(n, pickOne(['I love this song! 💃', 'Dance party! 🕺', 'Look at my moves! 💃']));
    }
  }

  // A water balloon flying past: work out whether it hits anyone.
  onThrow(c, p, v) {
    let [x, y, z] = p, [vx, vy, vz] = v;
    for (let t = 0; t < 3; t += 0.05) {
      vy -= 20 * 0.05;
      x += vx * 0.05;
      y += vy * 0.05;
      z += vz * 0.05;
      if (y < 0 || isSolidBlock(itemOf(this.room.get(Math.floor(x), Math.floor(y), Math.floor(z))))) return;
      for (const n of this.list) {
        if (Math.abs(x - n.pos[0]) < 0.45 && Math.abs(z - n.pos[2]) < 0.45 && y > n.pos[1] && y < n.pos[1] + 1.9) {
          setTimeout(() => {
            this.face(n, c.pos[0], c.pos[2]);
            this.act(n, NPC_ACT.wave, 2);
            this.say(n, pickOne(["Hey! I'm soaked! 😂", 'Eek! Cold water! 💦', `You got me, ${c.name}! 😆`]), true);
          }, t * 1000);
          return;
        }
      }
    }
  }

  // Someone right-clicked one of us.
  onTalk(c, id) {
    const n = this.list.find(m => m.id === id);
    if (!n || !this.near(n, c.pos[0], c.pos[1], c.pos[2], 9)) return;
    this.face(n, c.pos[0], c.pos[2]);
    this.act(n, NPC_ACT.wave, 1.5);
    if (n.def.store) {
      this.say(n, n.def.store === 'luxe' ? pickOne([`Take a look, ${c.name}! ✨`, 'Everything sparkles here! 💎', 'What catches your eye? 🛍️']) : pickOne([`Have a look, ${c.name}! 🛍️`, 'What would you like? 😊']), true);
      c.send({ t: 'shop_open', store: n.def.store });
    } else if (n.def.resident) {
      this.say(n, this.room.quests.talk(c, n), true);
    } else if (n.def.home) {
      // Someone's family (from the Luxe Store): the owner can change them; anyone else gets a hello.
      if (nameKey(c.name) === n.def.home) {
        this.say(n, pickOne([`Hi! 🏡`, `What's up? 😊`, `Love you! 💖`]), true);
        c.send({ t: 'family_open', members: this.room.wallet(c).family || [] });
      } else this.say(n, pickOne([`Hi ${c.name}! This is ${n.def.owner}'s house! 🏡`, `Hello! Are you a friend of ${n.def.owner}'s? 👋`]), true);
    } else if (n.def.weather) {
      const raining = this.room.showerLeft() > 0 ? this.room.shower.kind : null;
      this.say(n, raining ? `Look up! ${SHOWERS[raining].icon.repeat(3)}` : pickOne([`What shall it rain, ${c.name}? ⛅`, 'Tacos? Ice cream? Cats and dogs? ⛅🌮🍦🐶']), true);
      if (!raining) c.send({ t: 'weather_open', coins: this.room.wallet(c).coins });
    } else if (n.def.place === 'pizza') {
      this.room.startJob(c);
    } else if (n.def.land) {
      const land = this.lands.find(l => l.key === n.def.land);
      if (land && land.key === nameKey(c.name)) {
        this.say(n, pickOne(['Yes, boss! Who gets in? 📋', 'Your guest list, boss! 🕶️']), true);
        c.send({ t: 'guests_open', guests: land.guests });
      } else if (land && this.room.welcomeOn(land, c)) this.say(n, pickOne([`${c.name}! You're on the list. Come on in! ✅`, `Welcome, ${c.name}! ${land.owner} said you're a guest. 🫡`]), true);
      else if (land && this.room.clientNamed(land.key)) {
        // Not on the list: shall they ask the boss? (See guard_ask in game.js.)
        this.say(n, pickOne([`🛑 Guests only, ${c.name}! Want me to ask ${n.def.owner}? 🔔`, `${n.def.owner}'s house! Shall I ask the boss? 🔔`]), true);
        c.send({ t: 'guard_offer', key: land.key, owner: land.owner });
      } else this.say(n, pickOne([`🛑 Sorry ${c.name}, guests only. 📵 ${n.def.owner} isn't home, so I can't ask.`, `📵 The boss isn't home, ${c.name}. Try again later!`]), true);
    } else if (n.def.agent) {
      this.say(n, this.mission(c), true);
      c.send({ t: 'club_open', club: 'agency' });
    } else if (n.def.guard) {
      this.say(n, this.room.cleared(c) ? pickOne([`Welcome back, Agent ${c.name}! 🫡 In you go.`, `Agent ${c.name}! The door's open for you. 🫡`]) : pickOne([`🛑 No clearance, no entry, ${c.name}! Agent Shadow on the town square can tell you how to get some.`, '🛑 This is a TOP SECRET area! Only agents with Top Secret clearance get in.']), true);
    } else if (n.def.coach) {
      const g = this.room.playground.game;
      this.say(n, g ? pickOne([`A game's on! Jump in, ${c.name}! 🏃`, 'Go go go! 🎉']) : pickOne([`Tag or hide-and-seek, ${c.name}? 🏃🙈`, 'Pick a game! 🎉']), true);
      if (g) this.room.playground.join(c);
      else c.send({ t: 'games_open' });
    } else if (n.def.kid && this.room.playground.game?.ids.includes(n.id)) {
      this.say(n, pickOne(['Hee hee! 😆', 'Can\'t catch me! 🏃']), true);
    } else if (n.def.pal) {
      // A kid at Friendship Park: be best friends? (Your answer: the pal message, in game.js.)
      const mine = n.follow === c.id, other = n.follow && !mine ? this.room.clients.get(n.follow) : null;
      if (other) this.say(n, pickOne([`I'm hanging out with ${other.name} right now! 😊`, `${other.name} is my best friend! 💕`]), true);
      else {
        this.say(n, mine ? pickOne([`I'm right here, ${c.name}! 😄`, 'Best friends! 💕']) : pickOne([`Want to be best friends, ${c.name}? 🤝`, `Hi ${c.name}! Be my friend? 😊`]), true);
        const current = this.list.find(m => m.id === this.room.wallet(c).pal);
        c.send({ t: 'pal_open', id: n.id, name: n.def.name, mine, current: !mine && current ? current.def.name : null });
      }
    } else if (n.def.challenges) {
      this.say(n, pickOne([`Let's see what you've built, ${c.name}! 🔍`, 'Pick a card and build it! 🃏', 'Build it on your land, then show me! 🏗️']), true);
      this.room.sendChallenges(c);
    } else if (n.def.club) {
      // A club's leader: shows you what to do (in the badge book: pictures, not lots of words).
      const done = this.room.perk(c, n.def.club);
      this.say(n, done ? pickOne([`You're a star, ${c.name}! ⭐`, `Thanks for all your help, ${c.name}! 🏅`]) : pickOne([`Join my club, ${c.name}! 🏅`, `Can you help me, ${c.name}? 🙂`, `Here's what to do! 👇`]), true);
      c.send({ t: 'club_open', club: n.def.club });
    } else {
      this.say(n, pickOne(n.def.tips), true);
    }
  }

  // ---------- Best friends ----------
  // A kid from Friendship Park who's someone's best friend walks along with them (running to
  // catch up, hopping up and down steps), sits when they sit, chats now and then, and pops up
  // beside them if they've gone far ahead (in a car, flying, through a teleporter). When their
  // friend leaves the game they go home to the park.
  followFriend(n, dt, now) {
    const c = this.room.clients.get(n.follow);
    if (!c?.joined) {
      n.follow = null;
      n.pos = n.home.slice();
      n.pose = 0;
      n.action = NPC_ACT.idle;
      return;
    }
    const [px, py, pz] = c.pos;
    const dx = px - n.pos[0], dz = pz - n.pos[2], d = Math.hypot(dx, dz), dy = py - n.pos[1];
    n.stuckT ??= 0;
    if (d > 28 || Math.abs(dy) > 4 || n.stuckT > 2.5) {
      // Too far behind: pop up just beside them.
      for (const [sx, sz] of [[-1.6, 1.2], [1.6, 1.2], [0, 2], [-1.6, -1.2], [1.6, -1.2]].map(([ox, oz]) => [px + ox, pz + oz])) {
        const spot = this.findStand(sx, Math.max(0, Math.floor(py + 0.05)), sz, n.def);
        if (!spot) continue;
        n.pos = spot;
        n.stuckT = 0;
        this.room.broadcast({ t: 'fx', kind: 'sparkle', x: spot[0], y: spot[1] + 0.5, z: spot[2] });
        break;
      }
      n.stuckT = 0;
      return;
    }
    const sitting = !!(c.flags & 2);
    if (d > 2.2) {
      n.pose = 0;
      const speed = d > 6 ? 5.6 : 3.4, step = Math.min(d - 1.8, speed * dt);
      const nx = n.pos[0] + (dx / d) * step, nz = n.pos[2] + (dz / d) * step, y = Math.floor(n.pos[1] + 0.05);
      const fy = [y, y + 1, y - 1].find(t => t >= 0 && this.standable(Math.floor(nx), t, Math.floor(nz), n.def));
      if (fy === undefined) n.stuckT += dt;
      else {
        n.pos = [nx, fy, nz];
        n.stuckT = Math.max(0, n.stuckT - dt);
      }
      n.yaw = turn(n.yaw, Math.atan2(-dx, -dz), dt * 8);
      n.action = NPC_ACT.walk;
    } else {
      n.stuckT = 0;
      if (n.action === NPC_ACT.walk) n.action = NPC_ACT.idle;
      n.yaw = turn(n.yaw, Math.atan2(-dx, -dz), dt * 4);
      n.pose = sitting ? NPC_POSE.sit : 0;
    }
    // A chat now and then.
    n.chatAt ??= now + 20 * SECOND;
    if (now > n.chatAt) {
      n.chatAt = now + (35 + Math.random() * 40) * SECOND;
      this.say(n, pickOne(n.def.lines));
      if (Math.random() < 0.3) this.act(n, NPC_ACT.cheer, 1.5);
    }
    // Hanging out together (the Best Friends club counts the minutes), and a snack now and then
    // once you've got its badge.
    if (d < 10) {
      n.together = (n.together || 0) + dt;
      if (n.together >= 60) {
        n.together = 0;
        this.room.hangout(c, n);
      }
    }
  }

  // ---------- The Secret Agency ----------

  // What Agent Shadow tells you: how to get clearance (and how you're getting on).
  mission(c) {
    const w = this.room.wallet(c), need = this.room.filesNeeded(), found = w.agent.files.length;
    if (w.agent.clear) return pickOne([`Agent ${c.name}! 🕶️ Your clearance is good. The base is hidden out in the south-east, past the campground. Show the guards your badge!`, `Good work, Agent ${c.name}. The drones, the spy cameras and the lasers are waiting for you at the base. Shhh! 🤫`]);
    const left = this.room.filesLeft(w);
    if (!found) return `Psst, ${c.name}... 🕶️ The Secret Agency needs new agents. Find our ${need} TOP SECRET files: one is ${left[0]}, one is ${left[1] || 'hidden'}, and one is ${left[2] || 'hidden'}. Right-click each one. Find them all and you'll get Top Secret clearance!`;
    return `You've found ${found} of ${need} TOP SECRET files, ${c.name}. 🕵️ Still to find: ${left.join(', and ')}.`;
  }

  // A guard at the base's door: stops anyone without clearance, salutes agents.
  guardWatch(n, players, now) {
    for (const c of players) {
      const [x, y, z] = c.pos;
      if (!this.near(n, x, y, z, 5)) continue;
      const clear = this.room.cleared(c);
      const key = `${c.id}:${clear}`;
      if (now - (n.seen.get(key) || 0) < (clear ? 90 : 25) * SECOND) continue;
      n.seen.set(key, now);
      this.face(n, x, z);
      this.act(n, NPC_ACT.wave, 1.5);
      this.say(n, clear ? pickOne([`Welcome, Agent ${c.name}! 🫡`, `Agent ${c.name}! Go right in. 🫡`, `Badge checked. Good to see you, Agent ${c.name}! 🕶️`])
        : pickOne([`🛑 Halt, ${c.name}! This is a TOP SECRET area. No clearance, no entry!`, `🛑 Stop right there, ${c.name}! Secret Agency agents only.`, `🛑 Sorry ${c.name}, Top Secret clearance only! Ask Agent Shadow on the town square. 🕶️`]), true);
      return;
    }
  }

  // ---------- Bodyguards (from the Luxe Store) ----------

  // Two bodyguards for each guarded land: they come and go with it (and look the part).
  syncGuards(lands) {
    this.lands = lands;
    const want = new Set(lands.map(l => l.key));
    this.list = this.list.filter(n => !n.def.land || want.has(n.def.land));
    this.guardIds ??= new Map();
    for (const land of lands) {
      const mine = this.list.filter(n => n.def.land === land.key);
      if (mine.length) {
        // (The land might have moved or changed size.)
        for (const n of mine) if (String(n.nav.rect) !== String(land.rect)) [n.nav.rect, n.path, n.map, n.ownMap] = [land.rect, null, null, null];
        continue;
      }
      if (!this.guardIds.has(land.key)) this.guardIds.set(land.key, -100 - this.guardIds.size * 2);
      const id0 = this.guardIds.get(land.key);
      const spots = this.guardSpots(land);
      ['Max', 'Jo'].forEach((who, i) => {
        const def = {
          id: id0 - i, name: who, title: `${who} 🛡️ ${land.owner}'s bodyguard`, roam: 0.6, land: land.key, owner: land.owner,
          look: { face: 'cool', hair: i ? 'buns' : 'short', hat: 'none', shirt: 'jacket', pants: 'jeans', skin: i ? '#e8b088' : '#6b4226', hairColor: '#1b1209', shirtColor: '#111316', shirtColor2: '#ffffff', pantsColor: '#111316', shoesColor: '#111111' },
          hello: () => [], tips: [],
        };
        const [x, y, z, face] = spots[i];
        const home = this.findStand(x, y, z, def) || [x, y, z];
        this.list.push({
          def, id: def.id, home, area: [Math.floor(home[0]) - 1, Math.floor(home[2]) - 1, Math.floor(home[0]) + 1, Math.floor(home[2]) + 1], face,
          pos: home.slice(), yaw: face, goal: null, wait: 3 + i * 4, action: NPC_ACT.idle, actionT: 0, saidAt: 0, look: sanitizeLook(def.look),
          seen: new Map(), noticed: new Map(), petted: new Map(), task: null,
          nav: { key: land.key, rect: land.rect }, post: home.slice(), // (they patrol, and keep coming back to the front door)
        });
      });
    }
  }

  // Families (from the Luxe Store) living on their owners' land: [{ key, owner, rect, members }].
  syncFamilies(families) {
    const sig = JSON.stringify(families);
    if (sig === this.familySig) return false;
    this.familySig = sig;
    this.list = this.list.filter(n => !n.def.home);
    this.familyIds ??= new Map();
    for (const fam of families) {
      if (!this.familyIds.has(fam.key)) this.familyIds.set(fam.key, -300 - this.familyIds.size * 8);
      const id0 = this.familyIds.get(fam.key);
      const [x0, z0, x1, z1] = fam.rect;
      fam.members.forEach((m, i) => {
        const def = {
          id: id0 - i, name: m.name, title: `${m.name} 🏡`, roam: Math.max(2, Math.min(5, (x1 - x0) / 2)), home: fam.key, owner: fam.owner,
          look: m.look,
          hello: n => (nameKey(n) === fam.key ? [`Welcome home, ${n}! 🏡`, `${n}! You're home! 🥰`, 'Hi! 👋'] : [`Hi ${n}! 👋`]), tips: [],
        };
        const cx = (x0 + x1) / 2 + (i - 1) * 1.2, cz = (z0 + z1) / 2;
        const home = this.findStand(cx, 0, cz, def) || [cx + 0.5, 0, cz + 0.5];
        const n = {
          def, id: def.id, home, area: [x0, z0, x1, z1], face: 0,
          pos: home.slice(), yaw: Math.random() * Math.PI * 2, goal: null, wait: 3 + Math.random() * 12, action: NPC_ACT.idle, actionT: 0, saidAt: 0, look: sanitizeLook(def.look),
          seen: new Map(), noticed: new Map(), petted: new Map(), task: null,
          nav: { key: fam.key, rect: fam.rect },
        };
        this.list.push(n);
        // (Indoors, if there's a house: tried from the middle of the land, and from its front door.)
        this.homeStart(n, [home, ...this.guardSpots({ rect: fam.rect }).map(s => s.slice(0, 3))]);
      });
    }
    return true;
  }

  // Where a land's bodyguards stand: either side of its front door (outside it), or, with no
  // door, either side of the middle of the edge that's nearest the middle of town.
  guardSpots(land) {
    const [x0, z0, x1, z1] = land.rect, room = this.room;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const covered = (x, z) => {
      for (let y = 2; y < 14; y++) if (this.solid(x, y, z)) return 1;
      return 0;
    };
    // A front door: of the two sides you can walk through it from, the outside is the one with
    // less roof over the next few steps (and, if that's even, the one farther from the middle).
    let best = null;
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const v = room.get(x, 0, z);
        if (shapeOf(itemOf(v)) !== 'door' || blockMeta(itemOf(v)) & DOOR_TOP) continue;
        if (doorAt((a, b, c) => room.get(a, b, c), x, 0, z)?.garage) continue; // (that's for the car)
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ox = x + dx, oz = z + dz;
          if (this.solid(ox, 0, oz) || this.solid(ox, 1, oz)) continue;
          const roof = covered(ox, oz) + covered(ox + dx, oz + dz) + covered(ox + 2 * dx, oz + 2 * dz);
          const score = roof * 10 - Math.hypot(ox - cx, oz - cz);
          if (!best || score < best.score) best = { score, ox, oz, dx, dz };
        }
      }
    if (best) {
      const { ox, oz, dx, dz } = best;
      const face = Math.atan2(-dx, -dz); // (looking out, away from the door)
      return [[ox + dx + 0.5 + dz * 1.5, 0, oz + dz + 0.5 - dx * 1.5, face], [ox + dx + 0.5 - dz * 1.5, 0, oz + dz + 0.5 + dx * 1.5, face]];
    }
    const edges = [[(x0 + x1) / 2, z0 - 0.5, 0, 1], [(x0 + x1) / 2, z1 + 1.5, 0, -1], [x0 - 0.5, (z0 + z1) / 2, 1, 0], [x1 + 1.5, (z0 + z1) / 2, -1, 0]];
    edges.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    const [ex, ez, ix, iz] = edges[0];
    const face = Math.atan2(ix, iz); // (looking out, away from the land)
    return [[ex + 0.5 + iz * 1.5, 0, ez + 0.5 - ix * 1.5, face], [ex + 0.5 - iz * 1.5, 0, ez + 0.5 + ix * 1.5, face]];
  }

  // A bodyguard: stops anyone who isn't the owner or a guest, says hi to the boss and the guests.
  bodyguardWatch(n, players, now) {
    const land = this.lands.find(l => l.key === n.def.land);
    if (!land) return;
    const handled = new Set(this.list.filter(g => g.def.land === land.key).map(g => (g.catch || g.escort)?.client).filter(Boolean)); // (a partner's already on it)
    for (const c of players) {
      const [x, y, z] = c.pos;
      if (!this.near(n, x, y, z, 5) || handled.has(c.id)) continue;
      const boss = nameKey(c.name) === land.key, ok = this.room.welcomeOn(land, c);
      const key = `${c.id}:${ok}`;
      if (now - (n.seen.get(key) || 0) < (ok ? 120 : 25) * SECOND) continue;
      n.seen.set(key, now);
      this.face(n, x, z);
      this.act(n, NPC_ACT.wave, 1.5);
      this.say(n, boss ? pickOne([`Welcome home, boss! 🫡`, `All quiet here, boss. 🕶️`]) : ok ? `Welcome, ${c.name}! You're on the list. ✅`
        : pickOne([`🛑 Halt, ${c.name}! This is ${land.owner}'s house. Guests only!`, `🛑 Sorry ${c.name}, you're not on ${land.owner}'s guest list.`]), true);
      return;
    }
  }

  // Someone's on guarded land who shouldn't be (see intrude in game.js). On foot: the nearest
  // bodyguard runs over, catches them and walks them off (guardChase). From the air, they huff
  // and puff and blow them away; in a vehicle, a stop sign; tunnelling underneath, a bucket of
  // water. (Their own screens do the rest: see guardcatch.js.) gentle: they were welcome a
  // moment ago (taken off the list, or their visit's over).
  catchIntruder(c, land, how, gentle = false) {
    const guards = this.list.filter(n => n.def.land === land.key);
    if (!guards.length) return;
    const [x, y, z] = c.pos;
    const far = n => Math.hypot(n.pos[0] - x, n.pos[2] - z) + Math.abs(n.pos[1] - y) * 8;
    if (how === 'foot') {
      if (guards.some(n => n.catch?.client === c.id || n.escort?.client === c.id)) return;
      const n = guards.filter(g => !g.catch && !g.escort && !g.ride).sort((a, b) => far(a) - far(b))[0];
      if (!n) return c.send({ t: 'guard_shoo', id: guards[0].id });
      if (n.doing) this.stopDoing(n);
      n.actionT = 0;
      n.stay = null;
      // left: seconds to catch them in; speed: always a good bit faster than them (see guardChase).
      n.catch = { client: c.id, left: 12, gentle, speed: 11, v: 0, acc: 0, prev: c.pos.slice() };
      n.catchAt = null;
      [n.path, n.chase, n.plan] = [null, null, null];
      this.say(n, gentle ? 'Time\'s up, friend! 🕶️' : pickOne(['🛑 HALT!', '🛑 HEY! Stop right there!', '🛑 Not so fast!']), true);
      return;
    }
    const n = guards.sort((a, b) => far(a) - far(b))[0];
    if (how === 'air') {
      for (const g of guards) {
        this.face(g, x, z);
        this.act(g, NPC_ACT.cheer, 2);
      }
      this.say(n, 'HUFF... PUFF... 💨💨💨', true);
    } else if (how === 'car') {
      this.face(n, x, z);
      this.act(n, NPC_ACT.wave, 2);
      this.say(n, `🚧 STOP! No vehicles on ${land.owner}'s land!`, true);
    } else {
      this.say(n, pickOne(['👂 I hear digging! 🪣💦', '🪣 Somebody\'s tunnelling! FLUSH! 💦']), true);
    }
  }

  guardChase(n, dt) {
    const now = Date.now();
    if (n.escort) return this.guardEscort(n, dt, now);
    const k = n.catch, c = this.room.clients.get(k.client);
    const land = this.lands.find(l => l.key === n.def.land);
    k.left -= dt;
    if (!c?.joined || !c.pos || k.left <= 0 || !land) {
      // Couldn't get to them in time: shoo!
      n.catch = null;
      [n.path, n.chase] = [null, null];
      n.wait = 1;
      if (c?.joined) {
        c.send({ t: 'guard_shoo', id: n.id });
        this.act(n, NPC_ACT.wave, 1.5);
        this.say(n, k.gentle ? 'Time\'s up! Off you go! 👋' : pickOne(['SHOO! 👋', 'Off you go! SHOO! 👋']), true);
        this.stayBy(n, c.id, now);
      }
      return;
    }
    const [x, y, z] = c.pos, d = Math.hypot(x - n.pos[0], z - n.pos[2]);
    // Off the land again before we got to them? That'll do: no fuss.
    const [x0, z0, x1, z1] = land.rect, m = 0.5;
    if (x < x0 - m || x > x1 + 1 + m || z < z0 - m || z > z1 + 1 + m) return this.releaseIntruder(c, land.key);
    // How fast are they going? (We're always a good bit faster.)
    k.acc += dt;
    if (k.acc >= 0.1) {
      const v = Math.hypot(x - k.prev[0], z - k.prev[2]) / k.acc;
      k.v = k.v * 0.5 + Math.min(30, v) * 0.5;
      k.prev = [x, y, z];
      k.acc = 0;
      k.speed = Math.min(25, Math.max(11, k.v * 1.35));
    }
    if (d < 1.4 && Math.abs(y - n.pos[1]) < 1.6) return this.caughtIntruder(n, c, land, now);
    // Still running after a few seconds? The other bodyguard joins in, from wherever they are.
    k.t = (k.t || 0) + dt;
    if (k.t > 4 && !k.called) {
      k.called = true;
      const other = this.list.find(g => g !== n && g.def.land === n.def.land && !g.catch && !g.escort && !g.ride);
      if (other) {
        if (other.doing) this.stopDoing(other);
        other.stay = null;
        other.catch = { ...k, prev: k.prev.slice(), called: true, replan: 0 };
        other.catchAt = null;
        [other.path, other.chase, other.plan] = [null, null, null];
        this.say(other, pickOne(['I\'ll head them off! 🕶️', 'Coming round the other side! 🏃']), true);
      }
    }
    // In plain sight on the same level: straight at them. (Otherwise the way round: below.)
    if (Math.abs(y - n.pos[1]) < 0.5 && d < 14 && this.clearLine(n.pos, [x, n.pos[1], z], n.def)) {
      n.path = null;
      n.catchAt = null;
      return this.runAt(n, x, z, d, k.speed, dt);
    }
    // Run there: through the house and yard (doors, stairs) if there's a way, or straight at them.
    // (A new way only when they've moved off from where we were heading.)
    const moved = !n.catchAt || Math.hypot(n.catchAt[0] - x, n.catchAt[2] - z) > 1.5 || Math.abs(n.catchAt[1] - y) > 0.5;
    k.replan = (k.replan ?? 0) - dt;
    if ((!n.path || moved) && k.replan <= 0) {
      k.replan = 0.3;
      n.catchAt = [x, y, z];
      const map = this.homeMap(n);
      const goal = map && nearestNode(map, x, y, z, 3);
      const path = goal && route(map, cellKey(...this.cellOf(n)), goal);
      if (path?.length) this.setPath(n, path, goal);
      else n.path = null;
    }
    if (n.path) return this.followPath(n, dt);
    this.runAt(n, x, z, d, k.speed, dt);
  }

  runAt(n, x, z, d, speed, dt) {
    const step = Math.min(d, speed * dt), nx = n.pos[0] + ((x - n.pos[0]) / d) * step, nz = n.pos[2] + ((z - n.pos[2]) / d) * step;
    if (this.standable(Math.floor(nx), Math.round(n.pos[1]), Math.floor(nz), n.def)) {
      n.pos[0] = nx;
      n.pos[2] = nz;
      n.yaw = turn(n.yaw, Math.atan2(-(x - n.pos[0]), -(z - n.pos[2])), dt * 10);
      n.action = NPC_ACT.walk;
    } else n.action = NPC_ACT.idle;
  }

  // Caught! The way out (through the doors and down the stairs, on our map of the place), for
  // them to be walked along, and us a step behind.
  caughtIntruder(n, c, land, now) {
    const k = n.catch, [x, y, z] = c.pos;
    for (const g of this.list) if (g !== n && g.catch?.client === c.id) [g.catch, g.path, g.chase] = [null, null, null]; // (we've got them)
    // The shortest way off the land: out of whichever side's quickest to get to (through the doors).
    const map = this.homeMap(n), from = map && nearestNode(map, x, y, z, 2);
    let to = this.exitSpot(land.rect, c.pos), steps = null;
    if (from) {
      for (const side of [0, 1, 2, 3]) {
        const spot = this.exitSpot(land.rect, c.pos, side), goal = nearestNode(map, spot[0], spot[1], spot[2], 2);
        const r = goal && route(map, from, goal);
        if (r && (!steps || r.length < steps.length)) [steps, to] = [r, spot];
      }
    }
    const path = steps?.length ? steps.map(st => [st.x + 0.5, st.y, st.z + 0.5]) : [to];
    if (steps?.length && Math.hypot(path.at(-1)[0] - to[0], path.at(-1)[2] - to[2]) > 0.3) path.push(to);
    c.send({ t: 'guard_caught', id: n.id, path, gentle: k.gentle });
    n.catch = null;
    [n.chase, n.plan] = [null, null];
    if (steps?.length > 1) {
      this.setPath(n, steps.slice(0, -1), null); // (a step behind them, all the way out)
      n.escort = { client: c.id, gentle: k.gentle, left: path.length / 3 + 4, along: true };
    } else {
      n.path = null;
      const wx = to[0] - x, wz = to[2] - z, wl = Math.hypot(wx, wz) || 1;
      n.escort = { to: [to[0] - (wz / wl) * 0.8, to[1], to[2] + (wx / wl) * 0.8], client: c.id, gentle: k.gentle, left: wl / 3 + 2.5 };
    }
    this.face(n, x, z);
    this.say(n, k.gentle ? 'This way, friend. 🕶️' : pickOne(['Gotcha! This way, please. 🕶️', 'Caught you! Out you go! 🕶️', 'Nice try! Off we go. 🕶️']), true);
  }

  // Walking them off (along the way out, or straight there), then a word, and we stay put a
  // while so they can ask to come in.
  guardEscort(n, dt, now) {
    const e = n.escort;
    e.left -= dt;
    let there = e.left <= 0;
    if (!there && e.along) {
      if (n.path) this.followPath(n, dt);
      there = !n.path;
    } else if (!there) {
      const dx = e.to[0] - n.pos[0], dz = e.to[2] - n.pos[2], d = Math.hypot(dx, dz);
      if (d < 0.1) there = true;
      else {
        const step = Math.min(d, 3 * dt);
        n.pos[0] += (dx / d) * step;
        n.pos[2] += (dz / d) * step;
        n.pos[1] = e.to[1];
        n.yaw = turn(n.yaw, Math.atan2(-dx, -dz), dt * 8);
        n.action = NPC_ACT.walk;
      }
    }
    if (!there) return;
    n.escort = null;
    [n.path, n.chase, n.plan] = [null, null, null];
    const c = this.room.clients.get(e.client);
    if (c?.pos) this.face(n, c.pos[0], c.pos[2]);
    this.act(n, NPC_ACT.wave, 1.5);
    this.say(n, e.gentle ? pickOne(['Come back soon! 👋', 'Bye now! 🕶️']) : pickOne(['And stay out! 🕶️', 'Guests only! Want me to ask the boss? 🔔', 'Have a nice day! Ask first next time. 🔔']), true);
    this.stayBy(n, e.client, now);
  }

  // Stay right here a while, facing them (so they can ask to come in), and no more "halt!"
  // from either of us straight away.
  stayBy(n, client, now) {
    n.stay = { client, until: now + 60 * SECOND };
    n.wait = 2;
    for (const g of this.list) if (g.def.land === n.def.land) g.seen.set(`${client}:false`, now);
  }

  // They got back off the land before we caught them: fine by us. (Or their game says so.)
  releaseIntruder(c, key) {
    const n = this.list.find(g => g.def.land === key && g.catch?.client === c.id);
    if (!n) return;
    n.catch = null;
    [n.path, n.chase, n.plan] = [null, null, null];
    if (c.pos) this.face(n, c.pos[0], c.pos[2]);
    this.act(n, NPC_ACT.wave, 1.5);
    this.say(n, pickOne(['Thanks! Guests only. 🔔', 'Ask the boss first! 🔔', 'Thank you! 🕶️']), true);
    c.send({ t: 'guard_release', id: n.id });
    this.stayBy(n, c.id, Date.now());
  }

  // Just outside the land, nearest to (where they are): somewhere to stand, a step or two out.
  // side: just that side (0 west, 1 east, 2 north, 3 south); otherwise the nearest.
  exitSpot([x0, z0, x1, z1], p, side = null) {
    const y = Math.max(0, Math.round(p[1])), fx = Math.floor(p[0]), fz = Math.floor(p[2]);
    // [x, z, along-x, along-z]: the cells just past each edge, and which way that edge runs.
    const all = [[x0 - 2, fz, 0, 1], [x1 + 2, fz, 0, 1], [fx, z0 - 2, 1, 0], [fx, z1 + 2, 1, 0]];
    const ways = side !== null ? [all[side]] : all.sort((a, b) => Math.hypot(a[0] + 0.5 - p[0], a[1] + 0.5 - p[2]) - Math.hypot(b[0] + 0.5 - p[0], b[1] + 0.5 - p[2]));
    for (const [cx, cz, ax, az] of ways) {
      for (const back of [0, 1]) for (const o of [0, 1, -1, 2, -2, 3, -3]) {
        const x = cx + ax * o + (cx < x0 ? back : cx > x1 ? -back : 0), z = cz + az * o + (cz < z0 ? back : cz > z1 ? -back : 0);
        if (this.standable(x, y, z)) return [x + 0.5, y, z + 0.5];
      }
    }
    const [cx, cz] = ways[0];
    return [cx + 0.5, y, cz + 0.5];
  }

  // Someone without clearance tried the base's door: the nearest guard tells them.
  halt(c) {
    const now = Date.now();
    if (now - (c.haltedAt || 0) < 4 * SECOND) return;
    c.haltedAt = now;
    const guard = this.list.filter(n => n.def.guard).sort((a, b) => Math.hypot(a.pos[0] - c.pos[0], a.pos[2] - c.pos[2]) - Math.hypot(b.pos[0] - c.pos[0], b.pos[2] - c.pos[2]))[0];
    if (!guard) return;
    this.face(guard, c.pos[0], c.pos[2]);
    this.act(guard, NPC_ACT.wave, 1.5);
    this.say(guard, pickOne([`🛑 Locked! You need Top Secret clearance, ${c.name}.`, `🛑 Nice try, ${c.name}! Clearance only. Talk to Agent Shadow on the town square. 🕶️`]), true);
  }

  // ---------- The news ----------
  // Skye does a "segment" in one place, then cuts to the next one (she's off to her next story):
  // the town square, the Luxe Store, the Pizza Palace, the tower, the ski lodge, or wherever
  // someone's playing. She talks to the camera every few seconds.

  report(n, dt, players) {
    n.beatT = (n.beatT ?? 0) - dt;
    n.lineT = (n.lineT ?? 3) - dt;
    if (n.beatT <= 0) return this.nextBeat(n, players);
    const story = n.story;
    if (!story) return;
    if (story.guest) {
      const c = this.room.clients.get(story.guest);
      if (c?.joined) this.face(n, c.pos[0], c.pos[2]);
    }
    if (n.lineT <= 0 && !n.task) {
      n.lineT = 6 + Math.random() * 2.5;
      this.say(n, story.lines[story.i++ % story.lines.length], true);
      if (story.guest && story.i === 2) this.act(n, NPC_ACT.wave, 1.5);
    }
  }

  nextBeat(n, players) {
    const places = this.room.places || {};
    const spots = Object.entries(BEATS).map(([key, beat]) => ({ key, beat, p: key === 'plaza' ? { x: 3.5, y: 0, z: 3.5 } : places[key] })).filter(s => s.p);
    let stand = null, story = null;
    // Sometimes: drop in on someone who's playing (on foot, out in the open).
    const guests = players.filter(c => c.pos[1] < 40 && !c.sleeping && !inZone(this.zone, ...c.pos));
    if (guests.length && Math.random() < 0.45 && n.story?.guest === 0) {
      const c = guests[Math.floor(Math.random() * guests.length)];
      stand = this.besideGuest(c);
      if (stand) story = { label: `with ${c.name}`, guest: c.id, lines: GUEST_LINES(c.name), i: 0 };
    }
    if (!stand) {
      const choices = spots.filter(s => s.key !== n.story?.key);
      const s = choices[Math.floor(Math.random() * choices.length)] || spots[0];
      if (!s) return;
      stand = this.findStand(s.p.x, s.p.y ?? 0, s.p.z) || [s.p.x, s.p.y ?? 0, s.p.z];
      story = { key: s.key, label: s.beat.label, guest: 0, lines: [...s.beat.lines, ...SIGN_OFFS], i: 0 };
    }
    n.pos = stand.slice();
    n.home = stand.slice();
    n.area = [Math.floor(stand[0]) - 3, Math.floor(stand[2]) - 3, Math.floor(stand[0]) + 3, Math.floor(stand[2]) + 3];
    n.goal = null;
    n.task = null;
    n.wait = story.guest ? 99 : 3;
    n.story = story;
    n.beatT = story.guest ? 26 : 34;
    n.lineT = 1.2;
    this.room.broadcast({ t: 'news', place: story.label, guest: story.guest });
  }

  // Where Skye stands to interview someone: a few blocks away and off to one side of where
  // they're looking, so she's in view but never in the way of what they're building.
  besideGuest(c) {
    const a = c.rot[0], y = Math.floor(c.pos[1] + 0.05);
    const side = Math.random() < 0.5 ? 1 : -1;
    for (const turn of [55, 40, 70, 90, 30]) {
      for (const s of [side, -side]) {
        for (const d of [3.8, 4.5, 3.4]) {
          const b = a + s * turn * Math.PI / 180;
          const x = c.pos[0] - Math.sin(b) * d, z = c.pos[2] - Math.cos(b) * d;
          const cx = Math.floor(x), cz = Math.floor(z);
          if (!this.standable(cx, y, cz)) continue;
          const spot = [cx + 0.5, y, cz + 0.5];
          if (Math.hypot(spot[0] - c.pos[0], spot[2] - c.pos[2]) >= 3.2) return spot;
        }
      }
    }
    return null;
  }

  newsInfo() {
    const n = this.list.find(m => m.def.reporter);
    return n?.story ? { place: n.story.label, guest: n.story.guest } : null;
  }

  // Big news: Skye reports it wherever she is.
  breaking(text) {
    const n = this.list.find(m => m.def.reporter);
    if (n) {
      this.say(n, text, true);
      n.lineT = 7;
    }
  }

  // The chef sends someone off with a pizza (or cheers when they're back).
  chefSays(text) {
    const n = this.list.find(m => m.def.place === 'pizza');
    if (n) this.say(n, text, true);
  }

  onBuy(c, item) {
    const n = this.list.find(m => m.def.place === 'store');
    const name = typeof item === 'number' ? BLOCKS[item]?.name : SHOP_TOOLS[item]?.name;
    if (n && name) this.say(n, `Thank you, ${c.name}! Enjoy your ${name}! ✨`, true);
  }
}

// Turns an angle a toward b by at most `step`.
function turn(a, b, step) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + Math.max(-step, Math.min(step, d));
}
