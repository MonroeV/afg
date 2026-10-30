// Builds the starting world: a spawn plaza, a little cabin and some trees.
// Returns an array of [x, y, z, blockId].

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateWorld(seed = 1337) {
  const rand = rng(seed);
  const map = new Map();
  const put = (x, y, z, b) => map.set(`${x},${y},${z}`, [x, y, z, b]);
  const fill = (x0, y0, z0, x1, y1, z1, b) => {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) put(x, y, z, b);
  };

  // Spawn plaza: marble ring around a tiled floor, lamps on the corners.
  fill(-6, 0, -6, 6, 0, 6, 12);
  fill(-5, 0, -5, 5, 0, 5, 20);
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
    fill(x, 1, z, x, 2, z, 3);
    put(x, 3, z, 18);
  }
  put(0, 1, 0, 19); // bounce pad in the middle

  // A small cabin to the north-east.
  const cx = 14, cz = -14;
  fill(cx, 0, cz, cx + 6, 0, cz + 6, 4);
  fill(cx, 1, cz, cx + 6, 3, cz + 6, 6);
  fill(cx + 1, 1, cz + 1, cx + 5, 3, cz + 5, 0);
  for (const y of [1, 2, 3]) {
    put(cx, y, cz, 7); put(cx + 6, y, cz, 7);
    put(cx, y, cz + 6, 7); put(cx + 6, y, cz + 6, 7);
  }
  fill(cx + 3, 1, cz + 6, cx + 3, 2, cz + 6, 0); // door
  put(cx, 2, cz + 3, 9); put(cx + 6, 2, cz + 3, 9); // windows
  put(cx + 3, 2, cz, 9);
  for (let i = 0; i <= 3; i++) fill(cx - 1 + i, 4 + i, cz - 1, cx + 7 - i, 4 + i, cz + 7, 5); // brick roof
  put(cx + 3, 1, cz + 3, 18);

  // A sandy patch with a stone tower to the south-west.
  fill(-24, 0, 12, -14, 0, 22, 10);
  fill(-20, 1, 16, -18, 7, 18, 4);
  fill(-19, 1, 17, -19, 7, 17, 0);
  put(-19, 8, 17, 18);

  // Trees, kept away from the plaza and the buildings.
  const taken = (x, z) =>
    (Math.abs(x) < 12 && Math.abs(z) < 12) ||
    (x > cx - 4 && x < cx + 11 && z > cz - 4 && z < cz + 11) ||
    (x > -27 && x < -11 && z > 9 && z < 25);
  let trees = 0;
  while (trees < 45) {
    const x = Math.floor(rand() * 116) - 58;
    const z = Math.floor(rand() * 116) - 58;
    if (taken(x, z)) continue;
    const h = 4 + Math.floor(rand() * 3);
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++)
        for (let dy = h - 2; dy <= h + 1; dy++) {
          const r = Math.abs(dx) + Math.abs(dz) + Math.max(0, dy - h) * 2;
          if (r <= 3 && rand() > 0.08) put(x + dx, dy, z + dz, 8);
        }
    fill(x, 0, z, x, h - 1, z, 7);
    trees++;
  }

  return [...map.values()].filter(b => b[3] !== 0);
}
