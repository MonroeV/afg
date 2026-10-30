# BuildZone

A first-person, multiplayer creative sandbox that runs in the browser. Explore a town,
customize your character, drive cars, build anything and play with friends.

- **Towns to explore**: a main town around the spawn square plus four villages, joined by roads,
  with houses you can walk into, shops, parks, playgrounds, a beach and street lamps
- **Make your own character**: 10 faces, 8 hairstyles, 9 hats, 7 shirts, 4 kinds of pants,
  capes, wings and backpacks, and a color for every piece
- **Pets** that follow you everywhere: a puppy, kitten, bunny, piglet or baby dragon
- **Character Gallery**: save your character (with your name) so anyone can pick it later.
  It holds 25 characters in a 5×5 grid; when it's full you choose one to replace, or replace the oldest
- **Day and night**: the sun sets, the stars and moon come out and the street lamps light up
- **Cars**: drive regular cars, a police car with a siren, or a monster truck that can climb blocks
- **Doors** that open and close, **fireworks**, **dancing** and **waving**
- **36 kinds of blocks** with realistic textures: brick, wood, glass, marble, roads, flowers, rainbow…
- **Real-time multiplayer**: see each other, drive together, chat
- **Single player works too**: with no server, the world runs and saves right in the browser

## Controls

| Key | Action |
| --- | --- |
| Mouse | Look around |
| W A S D | Move |
| Space | Jump |
| Left click | Use item (place block, open doors, launch fireworks, get in a car) |
| Right click | Break block (with the hammer: remove a car) |
| Middle click | Copy the block you're looking at |
| 1–9 or mouse wheel | Choose hotbar slot |
| E | Open the item menu, or get in/out of a car you're looking at |
| Shift | Sprint |
| F | Toggle flying (Space = up, C = down) |
| V | Switch camera: first person, behind you, in front of you |
| G | Dance! |
| B | Wave |
| T or Enter | Chat |
| R | Go back to the town square |
| Esc | Pause, settings and character customization |

**Driving:** W/S to drive and reverse, A/D to steer, Space to brake, Shift for a boost,
H (or click) for the horn, G for the police siren, V to change the camera, E to get out.

## Running it on your computer

1. Install [Node.js](https://nodejs.org) (version 18 or newer).
2. Open a terminal in this folder and run:

   ```bash
   npm install
   ```

   ```bash
   npm start
   ```

3. Open <http://localhost:5010> in your browser.

To play with someone else on the same Wi-Fi, they can open `http://YOUR-COMPUTER-IP:5010`.

If the game feels slow, press Esc and set **Graphics** to Medium or Low.

## Putting it online so friends can join

The game is a normal Node.js web app, so any host that runs Node works
(for example [Render](https://render.com), [Railway](https://railway.app) or [Fly.io](https://fly.io)):

- **Build command:** `npm install`
- **Start command:** `npm start`
- The server reads the `PORT` environment variable automatically.

Note: on free hosting the `data/` folder may be wiped on restart, which resets the world.

## Saved files

The server keeps everything in the `data/` folder:

- `data/world.json` is the world. To start over with a fresh town, stop the server, delete
  that file and start it again. Worlds from older versions of the game are kept as
  `data/world-old-*.json` and a new town is built automatically.
- `data/characters.json` is the Character Gallery. Delete it to empty the gallery.

## The Character Gallery

Open it from the main menu or the pause menu. Click a character to play as them: you get their
name and look. To save your own, type a name and press **Save my character**. Saving again
with the same name updates that character, so it works like a simple account. When all 25 spots
are taken, the game asks you to click one to replace, or to replace the oldest one.

In single player (no server) the gallery is kept in your browser instead.

## How the code is organized

```
server.js              Web server + multiplayer (WebSockets), saves the world
public/
  index.html           Page layout: menus, HUD, character editor
  style.css            Look of the menus and HUD
  js/
    main.js            Starts everything and runs the game loop: input, building, driving, camera
    hud.js             Hotbar, item menu, chat and info panels
    textures.js        Generates all block textures in code
    world.js           Stores blocks, draws them in chunks, finds what you're looking at
    player.js          Walking, jumping, flying, collisions
    character.js       Builds a character from face/hair/hat/clothes choices
    editor.js          The "customize my character" screen
    gallery.js         The Character Gallery screen and its little portraits
    avatars.js         Other players' characters and name tags
    cars.js            Car models and driving physics
    daynight.js        Sky, sun, moon, stars and night lighting
    items.js           Hotbar items, icons, the item in your hand
    effects.js         Particles, fireworks and sound effects
    network.js         Talks to the server (or runs single player)
    shared/            Code used by both the server and the browser
      blocks.js        The list of blocks
      avatar.js        Character options
      characters.js    The saved character list (25 spots)
      game.js          The game rules: blocks, players, cars, the clock
      worldgen.js      Builds the towns
```

### Ideas for what to add next

- Signs you can write on
- A race track with a timer, or hide and seek
- Boats and water you can swim in
- Trains between the towns

Built with [three.js](https://threejs.org) and [ws](https://github.com/websockets/ws).
