# BuildZone

A first-person, multiplayer creative sandbox that runs in the browser. Jump in, pick
blocks from your hotbar and build things together with friends.

- **Real-time multiplayer**: see other builders move around, build together and chat
- **20 textured blocks** with color + normal maps: grass, stone, brick, wood, glass, metal, marble, lamps, bounce pads…
- **Realistic lighting**: atmospheric sky with clouds, sun shadows, reflections and fog
- **No downloads for players**: just open a web page
- **World saves automatically** on the server (`data/world.json`)

## Controls

| Key | Action |
| --- | --- |
| Mouse | Look around |
| W A S D | Move |
| Space | Jump |
| Left click | Use item (place block / swing hammer) |
| Right click | Break block |
| Middle click | Copy the block you're looking at |
| 1–9 or mouse wheel | Choose hotbar slot |
| E | Open the block menu |
| Shift | Sprint |
| F | Toggle flying (Space = up, C = down) |
| T or Enter | Chat |
| R | Go back to spawn |
| Esc | Pause / settings |

## Running it on your computer

1. Install [Node.js](https://nodejs.org) (version 18 or newer).
2. Open a terminal in this folder and run:

   ```bash
   npm install
   ```

   ```bash
   npm start
   ```

3. Open <http://localhost:3000> in your browser.

To play with someone else on the same Wi-Fi, they can open `http://YOUR-COMPUTER-IP:3000`.

## Putting it online so friends can join

The game is a normal Node.js web app, so any host that runs Node works
(for example [Render](https://render.com), [Railway](https://railway.app) or [Fly.io](https://fly.io)):

- **Build command:** `npm install`
- **Start command:** `npm start`
- The server reads the `PORT` environment variable automatically.

Note: on free hosting the `data/` folder may be wiped on restart, which resets the world.

## How the code is organized

```
server.js              Web server + multiplayer (WebSockets), saves the world
public/
  index.html           Page layout: menus, HUD, hotbar
  style.css            Look of the menus and HUD
  js/
    main.js            Starts everything: renderer, sky, input, UI, game loop
    textures.js        Generates all block textures in code
    world.js           Stores blocks, draws them, finds what you're looking at
    player.js          Movement, jumping, flying, collisions
    items.js           Hotbar items, icons, the item in your hand
    avatars.js         Other players' characters and name tags
    network.js         Talks to the server
    effects.js         Block-break particles and sound effects
    shared/
      blocks.js        The list of blocks (used by server and browser)
      worldgen.js      Builds the starting world
```

### Ideas for what to add next

- A new block: add it to `public/js/shared/blocks.js` and draw its texture in `public/js/textures.js`
- Day/night cycle (move the sun in `main.js`)
- New tools: paint bucket, copy/paste areas, doors that open
- Game modes: parkour races on bounce pads, hide and seek

Built with [three.js](https://threejs.org) and [ws](https://github.com/websockets/ws).
