// Under the ground. The ground itself (y = -1) can be dug out by anyone: a hole, which the grass
// grows back over after a while, unless something's been put in it. Below that is solid earth,
// down to the bedrock: only Tunnel Diggers (the ⛏️ club's badge) can dig into it, to make secret
// tunnels and rooms. Nobody else even knows they're there: the server only tells Tunnel
// Diggers about them, so to everyone else the bottom of a hole is solid as ever.
export const TUNNEL_TOP = -2; // the highest underground cell (just under the ground layer)
export const TUNNEL_BOTTOM = -9; // the lowest one: under it is the bedrock
export const MAX_TUNNELS = 40000; // dug-out underground cells in the whole world

export const isTunnelY = y => Number.isInteger(y) && y <= TUNNEL_TOP && y >= TUNNEL_BOTTOM;
export const tunnelKey = (x, y, z) => `${x},${y},${z}`;

// Is the underground cell (x, y, z) open (dug out)? holes: "x,z" of dug-out ground; tunnels:
// "x,y,z" of dug-out cells underground.
export function openBelow(holes, tunnels, x, y, z) {
  if (y === -1) return holes.has(`${x},${z}`);
  return isTunnelY(y) && tunnels.has(tunnelKey(x, y, z));
}

// What the walls of a tunnel are made of: earth up top, rock further down.
export const earthAt = y => (y >= -4 ? 'dirt' : 'stone');
