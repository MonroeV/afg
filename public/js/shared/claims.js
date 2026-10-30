// Land claims: a player can claim up to 10 x 15 blocks (from the ground to the sky).
// Only someone using the owner's name can build or break there. Doors still work for everyone.

export const CLAIM_SHORT = 10;
export const CLAIM_LONG = 15;
export const CLAIM_EXPIRE_DAYS = 30;

export const nameKey = name => String(name || '').trim().toLowerCase();

export function normalizeRect(x0, z0, x1, z1) {
  return { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) };
}

export function claimSize(r) {
  return [r.x1 - r.x0 + 1, r.z1 - r.z0 + 1];
}

export function claimSizeOk(r) {
  const [w, d] = claimSize(r);
  return w >= 1 && d >= 1 && Math.min(w, d) <= CLAIM_SHORT && Math.max(w, d) <= CLAIM_LONG;
}

export function claimAt(claims, x, z) {
  for (const c of claims) if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) return c;
  return null;
}

export function rectsOverlap(a, b) {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.z0 <= b.z1 && a.z1 >= b.z0;
}

// Can this player change the block at (x, z)?
export function canBuild(claims, name, x, z) {
  const c = claimAt(claims, x, z);
  return !c || c.key === nameKey(name);
}
