// Stores the blocks and draws them. Each kind of block is one InstancedMesh,
// so tens of thousands of blocks render in a handful of draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCKS, WORLD, PAINT_COLORS, blockKey, blockId, blockMeta, paintOf, shapeOf, isSolidBlock, doorBox, DOOR_OPEN, DOOR_TOP } from './shared/blocks.js';
import { modelGeometry, modelMaterials } from './models.js';

const GEOMETRY = {
  cube: new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5),
  flat: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0.03, 0.5), // only the top is ever seen
  plant: mergeGeometries([
    new THREE.PlaneGeometry(1.2, 1).rotateY(Math.PI / 4),
    new THREE.PlaneGeometry(1.2, 1).rotateY(-Math.PI / 4),
  ]).translate(0.5, 0.5, 0.5),
  door: new THREE.BoxGeometry(1, 1, 0.18).translate(0, 0.5, 0),
  // Two rails and three rungs, flat against the wall on the block's -z side.
  ladder: mergeGeometries([
    new THREE.BoxGeometry(0.07, 1, 0.05).translate(-0.36, 0.5, -0.46),
    new THREE.BoxGeometry(0.07, 1, 0.05).translate(0.36, 0.5, -0.46),
    ...[0.17, 0.5, 0.83].map(y => new THREE.BoxGeometry(0.72, 0.06, 0.04).translate(0, y, -0.45)),
  ]),
};

// Painted blocks: instead of just tinting the texture (which can't make dark blocks
// light), recolor it, keeping its light and dark details. White instance color = not painted.
function paintable(material) {
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #if defined( USE_COLOR )
        if ( vColor.r + vColor.g + vColor.b < 2.99 ) {
          float lum = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
          diffuseColor.rgb = vColor.rgb * ( 0.3 + lum * 1.25 );
        }
      #endif
    `).replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      #if defined( USE_COLOR )
        // Painted lamps and neon glow in their new color.
        if ( vColor.r + vColor.g + vColor.b < 2.99 ) {
          float glow = dot( totalEmissiveRadiance, vec3( 0.299, 0.587, 0.114 ) );
          totalEmissiveRadiance = vColor.rgb * glow * 1.3;
        }
      #endif
    `);
  };
  return material;
}

export function createBlockMaterials(textures) {
  const make = (texName, def, extra = {}) => {
    const t = textures[texName];
    // How shiny each kind of block is. Shiny blocks reflect the world around them.
    const roughness = def.mirror ? 0.02 : def.gold ? 0.2 : def.metal ? 0.22 : def.water ? 0.03 : def.glossy ? 0.14 : 0.88;
    const m = new THREE.MeshStandardMaterial({
      map: t.map,
      normalMap: t.normalMap,
      roughness,
      metalness: def.mirror || def.gold ? 1 : def.metal ? 0.85 : 0,
      ...extra,
    });
    if (def.water) m.normalScale.set(1.6, 1.6);
    // How strongly it reflects its surroundings (see lighting.js).
    m.userData.shine = def.mirror ? 1.6 : def.gold ? 1.3 : def.water || def.transparent ? 1.4 : def.metal ? 1 : def.glossy ? 0.6 : 0;
    paintable(m);
    if (def.cutout) m.alphaTest = 0.5;
    if (def.transparent) {
      m.transparent = true;
      m.depthWrite = false;
      m.roughness = 0.05;
    }
    if (t.emissiveMap) {
      m.emissive = new THREE.Color(0xffffff);
      m.emissiveMap = t.emissiveMap;
      m.emissiveIntensity = def.emissive ? 2.2 : 1;
    }
    return m;
  };

  // Materials are keyed by "render key": the block id, plus a part for doors.
  const materials = {};
  for (const [id, def] of Object.entries(BLOCKS)) {
    const shape = def.shape || 'cube';
    if (shape === 'model') {
      materials[id] = modelMaterials(def.model);
      paintable(materials[id][0]);
      paintable(materials[id][2]);
    } else if (shape === 'door') {
      const edge = make(def.tex.edge, def);
      for (const part of ['bottom', 'top']) {
        const face = make(def.tex[part], def, { alphaTest: 0.5 });
        materials[`${id}:${part}`] = [edge, edge, edge, edge, face, face];
      }
      // Garage doors (three or more doors in a row) are ribbed metal.
      const garage = make('garage', { metal: true });
      garage.metalness = 0.25;
      garage.roughness = 0.6;
      garage.userData.shine = 0.3; // painted metal: only a soft reflection
      materials[`${id}:garage`] = [garage, garage, garage, garage, garage, garage];
    } else if (shape === 'plant') {
      materials[id] = make(def.tex, def, { alphaTest: 0.5, side: THREE.DoubleSide });
    } else if (typeof def.tex === 'string') {
      materials[id] = make(def.tex, def);
    } else {
      // BoxGeometry face order: +x, -x, +y (top), -y (bottom), +z, -z
      const side = make(def.tex.side, def), top = make(def.tex.top, def), bottom = make(def.tex.bottom, def);
      materials[id] = [side, side, top, bottom, side, side];
    }
  }
  return materials;
}

// Picks a material for things like particles and the held item.
export function blockMaterial(materials, v) {
  const id = blockId(v);
  const m = materials[id] ?? materials[`${id}:bottom`];
  return m;
}

// The world is split into square chunks so the game only draws what you can see.
const CHUNK = 64;
const CHUNK_RADIUS = Math.hypot(CHUNK / 2, CHUNK / 2, 32);

export class World {
  constructor(scene, materials) {
    this.scene = scene;
    this.materials = materials;
    this.blocks = new Map(); // "x,y,z" -> block value
    this.layers = {}; // "chunk|render key" -> { mesh, keys: [], index: Map(key -> instance index) }
    this.cellLayer = new Map(); // "x,y,z" -> the layer its instance is in
    this.lamps = new Set(); // keys of light-giving blocks
    this.revision = 0; // goes up whenever anything changes
    this.matrix = new THREE.Matrix4();
    this.tmp = new THREE.Matrix4();
    this.color = new THREE.Color();
  }

  get(x, y, z) {
    return this.blocks.get(blockKey(x, y, z)) || 0;
  }

  // Ground (below y=0) and the world edges are solid.
  isSolid(x, y, z) {
    if (y < 0) return true;
    if (x < WORLD.min || x > WORLD.max || z < WORLD.min || z > WORLD.max) return true;
    return isSolidBlock(this.get(x, y, z));
  }

  // Is there a roof (anything solid) somewhere above this spot?
  isCovered(x, y, z, height = 12) {
    for (let up = 1; up <= height; up++) if (isSolidBlock(this.get(x, y + up, z))) return true;
    return false;
  }

  // Adds the collision boxes of one cell to `out` as [minX, minY, minZ, maxX, maxY, maxZ].
  cellBoxes(x, y, z, out) {
    if (y < 0 || x < WORLD.min || x > WORLD.max || z < WORLD.min || z > WORLD.max) {
      out.push([x, y, z, x + 1, y + 1, z + 1]);
      return;
    }
    const v = this.get(x, y, z);
    if (!v) return;
    const shape = shapeOf(v);
    if (shape === 'cube') out.push([x, y, z, x + 1, y + 1, z + 1]);
    else if (shape === 'door') {
      const meta = blockMeta(v);
      const role = this.doorRole(x, y, z);
      const b = doorBox(meta, role.hinge);
      if (role.kind === 'garage' && meta & DOOR_OPEN) {
        // A rolled-up garage door is just a roll at the very top (above your head).
        if (meta & DOOR_TOP) {
          const c = doorBox(meta & ~DOOR_OPEN);
          out.push([x + c[0], y + 0.85, z + c[2], x + c[3], y + 1, z + c[5]]);
        }
        return;
      }
      out.push([x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]);
    } else if (shape === 'model') {
      const b = BLOCKS[blockId(v)].box;
      if (b) out.push([x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]);
    }
  }

  load(flat) {
    this.loading = true;
    for (const k of [...this.blocks.keys()]) {
      const [x, y, z] = k.split(',').map(Number);
      this.set(x, y, z, 0);
    }
    for (let i = 0; i + 3 < flat.length; i += 4) this.set(flat[i], flat[i + 1], flat[i + 2], flat[i + 3]);
    this.loading = false;
    // Doors could only tell they were double or garage doors once all their neighbors arrived.
    for (const [k, v] of this.blocks) {
      if (shapeOf(v) !== 'door') continue;
      const [x, y, z] = k.split(',').map(Number);
      this.rerender(x, y, z);
    }
    this.revision++;
    this.onLoad?.();
  }

  set(x, y, z, v) {
    const k = blockKey(x, y, z);
    const old = this.blocks.get(k) || 0;
    if (old === v) return false;
    if (old) {
      this.removeInstance(k);
      this.lamps.delete(k);
    }
    if (v) {
      this.blocks.set(k, v);
      this.addInstance(v, k, x, y, z);
      if (BLOCKS[blockId(v)]?.light) this.lamps.add(k);
    } else {
      this.blocks.delete(k);
    }
    this.revision++;
    if (!this.loading) {
      if (shapeOf(old) === 'door' || shapeOf(v) === 'door') this.refreshDoorsNear(x, y, z);
      this.onChange?.(x, y, z);
    }
    return true;
  }

  // ---------- Doors ----------
  // Doors side by side (facing the same way) work together: two make double doors that
  // swing open to either side, three or more make a roll-up garage door.

  // The row of doors (bottom halves) that the door at (x, y, z) belongs to.
  doorRow(x, y, z) {
    const v = this.get(x, y, z);
    const by = blockMeta(v) & DOOR_TOP ? y - 1 : y;
    const facing = blockMeta(v) & 3;
    const [ax, az] = facing % 2 === 0 ? [1, 0] : [0, 1];
    const sameRow = (cx, cz) => {
      const n = this.get(cx, by, cz);
      return shapeOf(n) === 'door' && !(blockMeta(n) & DOOR_TOP) && (blockMeta(n) & 3) % 2 === facing % 2;
    };
    let start = 0, end = 0;
    while (start > -16 && sameRow(x + ax * (start - 1), z + az * (start - 1))) start--;
    while (end < 16 && sameRow(x + ax * (end + 1), z + az * (end + 1))) end++;
    const cells = [];
    for (let i = start; i <= end; i++) cells.push([x + ax * i, by, z + az * i]);
    return { cells, index: -start, ax, az };
  }

  doorRole(x, y, z) {
    const row = this.doorRow(x, y, z);
    const n = row.cells.length;
    if (n >= 3) return { kind: 'garage', hinge: -1, size: n };
    if (n === 1) return { kind: 'single', hinge: -1, size: 1 };
    // Double doors: each swings toward its own outside edge.
    const facing = blockMeta(this.get(x, y, z)) & 3;
    const a = facing * Math.PI / 2;
    const localX = Math.round(Math.cos(a) * row.ax - Math.sin(a) * row.az); // +1 if the door's right points along the row
    return { kind: 'double', hinge: (row.index === 0 ? -1 : 1) * localX, size: 2 };
  }

  // Every door cell (both halves) in the rows next to (x, y, z).
  refreshDoorsNear(x, y, z) {
    const seen = new Set();
    for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0], [0, 1, 0], [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1]]) {
      const cx = x + dx, cy = y + dy, cz = z + dz;
      if (shapeOf(this.get(cx, cy, cz)) !== 'door') continue;
      for (const [rx, ry, rz] of this.doorRow(cx, cy, cz).cells) {
        for (const yy of [ry, ry + 1]) {
          const k = blockKey(rx, yy, rz);
          if (seen.has(k) || shapeOf(this.get(rx, yy, rz)) !== 'door') continue;
          seen.add(k);
          this.rerender(rx, yy, rz);
        }
      }
    }
  }

  // Every door cell (both halves) that opens and closes together with this one.
  doorGroup(x, y, z) {
    const out = [];
    for (const [rx, ry, rz] of this.doorRow(x, y, z).cells) {
      for (const yy of [ry, ry + 1]) {
        const v = this.get(rx, yy, rz);
        if (shapeOf(v) === 'door') out.push([rx, yy, rz, v]);
      }
    }
    return out;
  }

  // ---------- Ladders ----------

  // The whole ladder (every rung going up and down) that includes (x, y, z).
  ladderCells(x, y, z) {
    const v = this.get(x, y, z);
    const same = yy => {
      const n = this.get(x, yy, z);
      return shapeOf(n) === 'ladder' && blockMeta(n) === blockMeta(v);
    };
    let lo = y, hi = y;
    while (lo > 0 && same(lo - 1)) lo--;
    while (hi < WORLD.maxY && same(hi + 1)) hi++;
    const out = [];
    for (let yy = lo; yy <= hi; yy++) out.push([x, yy, z, this.get(x, yy, z)]);
    return out;
  }

  // ---------- Drawing ----------

  renderKey(v, x, y, z) {
    const id = blockId(v);
    if (shapeOf(v) === 'door') {
      if (x !== undefined && this.doorRole(x, y, z).kind === 'garage') return `${id}:garage`;
      return `${id}:${blockMeta(v) & DOOR_TOP ? 'top' : 'bottom'}`;
    }
    return String(id);
  }

  layer(key, renderKey, v, x, z) {
    let layer = this.layers[key];
    if (!layer) {
      const def = BLOCKS[blockId(v)];
      const cx = (Math.floor(x / CHUNK) + 0.5) * CHUNK, cz = (Math.floor(z / CHUNK) + 0.5) * CHUNK;
      layer = this.layers[key] = {
        mesh: null, keys: [], index: new Map(), def,
        geometry: def.shape === 'model' ? modelGeometry(def.model) : GEOMETRY[def.shape || 'cube'],
        material: this.materials[renderKey],
        center: new THREE.Vector3(cx, 32, cz),
      };
      this.grow(layer, 64);
    }
    return layer;
  }

  grow(layer, capacity) {
    const mesh = new THREE.InstancedMesh(layer.geometry, layer.material, capacity);
    mesh.count = layer.keys.length;
    mesh.boundingSphere = new THREE.Sphere(layer.center, CHUNK_RADIUS + 2);
    const shape = layer.def.shape || 'cube';
    mesh.castShadow = !layer.def.transparent && shape !== 'flat';
    mesh.receiveShadow = true;
    if (layer.def.transparent) mesh.renderOrder = 1;
    // Every instance has a color: white for normal blocks, the paint color for painted ones.
    mesh.setColorAt(0, this.color.setRGB(1, 1, 1));
    if (layer.mesh) {
      const n = layer.keys.length;
      mesh.instanceMatrix.array.set(layer.mesh.instanceMatrix.array.subarray(0, n * 16));
      mesh.instanceColor.array.set(layer.mesh.instanceColor.array.subarray(0, n * 3));
      this.scene.remove(layer.mesh);
      layer.mesh.dispose();
    }
    layer.mesh = mesh;
    this.scene.add(mesh);
  }

  instanceMatrix(v, x, y, z) {
    const m = this.matrix;
    const shape = shapeOf(v);
    const meta = blockMeta(v);
    if (shape === 'ladder') return m.makeTranslation(x + 0.5, y, z + 0.5).multiply(this.tmp.makeRotationY(meta * Math.PI / 2));
    if (shape !== 'door') return m.makeTranslation(x, y, z);
    m.makeTranslation(x + 0.5, y, z + 0.5).multiply(this.tmp.makeRotationY((meta & 3) * Math.PI / 2));
    if (!(meta & DOOR_OPEN)) return m;
    const role = this.doorRole(x, y, z);
    if (role.kind === 'garage') {
      // Rolled up: the bottom half disappears, the top half becomes the roll.
      if (!(meta & DOOR_TOP)) return m.multiply(this.tmp.makeScale(0.0001, 0.0001, 0.0001));
      return m.multiply(this.tmp.makeTranslation(0, 0.85, 0)).multiply(this.tmp.makeScale(1, 0.15, 1.5));
    }
    // Swing open on its hinge side.
    return m.multiply(this.tmp.makeTranslation(role.hinge * 0.41, 0, 0)).multiply(this.tmp.makeRotationY(Math.PI / 2));
  }

  addInstance(v, k, x, y, z) {
    const renderKey = this.renderKey(v, x, y, z);
    const key = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}|${renderKey}`;
    const layer = this.layer(key, renderKey, v, x, z);
    if (layer.keys.length >= layer.mesh.instanceMatrix.count) this.grow(layer, layer.mesh.instanceMatrix.count * 2);
    const i = layer.keys.length;
    layer.keys.push(k);
    layer.index.set(k, i);
    this.cellLayer.set(k, key);
    layer.mesh.setMatrixAt(i, this.instanceMatrix(v, x, y, z));
    const paint = paintOf(v);
    layer.mesh.setColorAt(i, paint ? this.color.set(PAINT_COLORS[paint]) : this.color.setRGB(1, 1, 1));
    layer.mesh.count = layer.keys.length;
    layer.mesh.instanceMatrix.needsUpdate = true;
    layer.mesh.instanceColor.needsUpdate = true;
  }

  removeInstance(k) {
    const layer = this.layers[this.cellLayer.get(k)];
    this.cellLayer.delete(k);
    if (!layer) return;
    const i = layer.index.get(k);
    const last = layer.keys.length - 1;
    if (i !== last) {
      // Move the last instance into the freed slot.
      const lastKey = layer.keys[last];
      layer.mesh.getMatrixAt(last, this.matrix);
      layer.mesh.setMatrixAt(i, this.matrix);
      layer.mesh.getColorAt(last, this.color);
      layer.mesh.setColorAt(i, this.color);
      layer.keys[i] = lastKey;
      layer.index.set(lastKey, i);
    }
    layer.keys.pop();
    layer.index.delete(k);
    layer.mesh.count = layer.keys.length;
    layer.mesh.instanceMatrix.needsUpdate = true;
    layer.mesh.instanceColor.needsUpdate = true;
  }

  // Draws a block again (when its neighbors change how it should look).
  rerender(x, y, z) {
    const k = blockKey(x, y, z);
    const v = this.blocks.get(k);
    if (!v) return;
    this.removeInstance(k);
    this.addInstance(v, k, x, y, z);
  }

  // Hides chunks that are lost in the fog anyway.
  updateVisibility(position, distance) {
    const max = distance + CHUNK * 0.75;
    for (const layer of Object.values(this.layers)) {
      const dx = layer.center.x - position.x, dz = layer.center.z - position.z;
      layer.mesh.visible = layer.keys.length > 0 && dx * dx + dz * dz < max * max;
    }
  }

  // Walks through the voxel grid along a ray (Amanatides & Woo).
  // Returns the block (or ground) that was hit and where a new block would go.
  raycast(origin, dir, maxDist) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = Math.sign(dir.x), stepY = Math.sign(dir.y), stepZ = Math.sign(dir.z);
    const tDeltaX = Math.abs(1 / dir.x), tDeltaY = Math.abs(1 / dir.y), tDeltaZ = Math.abs(1 / dir.z);
    let tMaxX = dir.x === 0 ? Infinity : (stepX > 0 ? x + 1 - origin.x : origin.x - x) * tDeltaX;
    let tMaxY = dir.y === 0 ? Infinity : (stepY > 0 ? y + 1 - origin.y : origin.y - y) * tDeltaY;
    let tMaxZ = dir.z === 0 ? Infinity : (stepZ > 0 ? z + 1 - origin.z : origin.z - z) * tDeltaZ;
    let normal = [0, 0, 0];
    let t = 0;

    while (t <= maxDist) {
      if (y < 0) {
        if (normal[1] !== 1) return null;
        return { ground: true, block: [x, y, z], normal, place: [x, 0, z], distance: t };
      }
      if (x < WORLD.min || x > WORLD.max || z < WORLD.min || z > WORLD.max) return null;
      const v = this.get(x, y, z);
      if (v) {
        return { value: v, id: blockId(v), block: [x, y, z], normal, place: [x + normal[0], y + normal[1], z + normal[2]], distance: t };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX; normal = [-stepX, 0, 0];
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY; normal = [0, -stepY, 0];
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; normal = [0, 0, -stepZ];
      }
    }
    return null;
  }
}
