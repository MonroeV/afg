// Stores the blocks and draws them. Each kind of block is one InstancedMesh,
// so tens of thousands of blocks render in a handful of draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCKS, WORLD, blockKey, blockId, blockMeta, shapeOf, isSolidBlock, doorBox, DOOR_OPEN, DOOR_TOP } from './shared/blocks.js';

const GEOMETRY = {
  cube: new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5),
  flat: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0.03, 0.5), // only the top is ever seen
  plant: mergeGeometries([
    new THREE.PlaneGeometry(1.2, 1).rotateY(Math.PI / 4),
    new THREE.PlaneGeometry(1.2, 1).rotateY(-Math.PI / 4),
  ]).translate(0.5, 0.5, 0.5),
  door: new THREE.BoxGeometry(1, 1, 0.18).translate(0, 0.5, 0),
};

export function createBlockMaterials(textures) {
  const make = (texName, def, extra = {}) => {
    const t = textures[texName];
    const m = new THREE.MeshStandardMaterial({
      map: t.map,
      normalMap: t.normalMap,
      roughness: def.metal ? 0.35 : def.glossy ? 0.25 : 0.88,
      metalness: def.metal ? 0.85 : 0,
      ...extra,
    });
    if (def.cutout) m.alphaTest = 0.5;
    if (def.transparent) {
      m.transparent = true;
      m.depthWrite = false;
      m.roughness = 0.05;
      m.envMapIntensity = 1.5;
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
    if (shape === 'door') {
      const edge = make(def.tex.edge, def);
      for (const part of ['bottom', 'top']) {
        const face = make(def.tex[part], def, { alphaTest: 0.5 });
        materials[`${id}:${part}`] = [edge, edge, edge, edge, face, face];
      }
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
    this.lamps = new Set(); // keys of light-giving blocks
    this.matrix = new THREE.Matrix4();
    this.tmp = new THREE.Matrix4();
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
      const b = doorBox(blockMeta(v));
      out.push([x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]);
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
    this.onLoad?.();
  }

  set(x, y, z, v) {
    const k = blockKey(x, y, z);
    const old = this.blocks.get(k) || 0;
    if (old === v) return false;
    if (old) {
      this.removeInstance(this.layerKey(old, x, z), k);
      this.lamps.delete(k);
    }
    if (v) {
      this.blocks.set(k, v);
      this.addInstance(v, k, x, y, z);
      if (BLOCKS[blockId(v)]?.light) this.lamps.add(k);
    } else {
      this.blocks.delete(k);
    }
    if (!this.loading) this.onChange?.(x, y, z);
    return true;
  }

  renderKey(v) {
    const id = blockId(v);
    if (shapeOf(v) === 'door') return `${id}:${blockMeta(v) & DOOR_TOP ? 'top' : 'bottom'}`;
    return String(id);
  }

  layerKey(v, x, z) {
    return `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}|${this.renderKey(v)}`;
  }

  layer(key, v, x, z) {
    let layer = this.layers[key];
    if (!layer) {
      const def = BLOCKS[blockId(v)];
      const cx = (Math.floor(x / CHUNK) + 0.5) * CHUNK, cz = (Math.floor(z / CHUNK) + 0.5) * CHUNK;
      layer = this.layers[key] = {
        mesh: null, keys: [], index: new Map(), geometry: GEOMETRY[def.shape || 'cube'], def,
        material: this.materials[this.renderKey(v)],
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
    if (layer.mesh) {
      mesh.instanceMatrix.array.set(layer.mesh.instanceMatrix.array.subarray(0, layer.keys.length * 16));
      this.scene.remove(layer.mesh);
      layer.mesh.dispose();
    }
    layer.mesh = mesh;
    this.scene.add(mesh);
  }

  instanceMatrix(v, x, y, z) {
    const m = this.matrix.makeTranslation(x, y, z);
    if (shapeOf(v) !== 'door') return m;
    const meta = blockMeta(v);
    m.makeTranslation(x + 0.5, y, z + 0.5).multiply(this.tmp.makeRotationY((meta & 3) * Math.PI / 2));
    if (meta & DOOR_OPEN) m.multiply(this.tmp.makeTranslation(-0.41, 0, 0)).multiply(this.tmp.makeRotationY(Math.PI / 2));
    return m;
  }

  addInstance(v, k, x, y, z) {
    const layer = this.layer(this.layerKey(v, x, z), v, x, z);
    if (layer.keys.length >= layer.mesh.instanceMatrix.count) this.grow(layer, layer.mesh.instanceMatrix.count * 2);
    const i = layer.keys.length;
    layer.keys.push(k);
    layer.index.set(k, i);
    layer.mesh.setMatrixAt(i, this.instanceMatrix(v, x, y, z));
    layer.mesh.count = layer.keys.length;
    layer.mesh.instanceMatrix.needsUpdate = true;
  }

  removeInstance(key, k) {
    const layer = this.layers[key];
    const i = layer.index.get(k);
    const last = layer.keys.length - 1;
    if (i !== last) {
      // Move the last instance into the freed slot.
      const lastKey = layer.keys[last];
      layer.mesh.getMatrixAt(last, this.matrix);
      layer.mesh.setMatrixAt(i, this.matrix);
      layer.keys[i] = lastKey;
      layer.index.set(lastKey, i);
    }
    layer.keys.pop();
    layer.index.delete(k);
    layer.mesh.count = layer.keys.length;
    layer.mesh.instanceMatrix.needsUpdate = true;
  }

  // Hides chunks that are lost in the fog anyway.
  updateVisibility(position, distance) {
    const max = distance + CHUNK * 0.75;
    for (const layer of Object.values(this.layers)) {
      const dx = layer.center.x - position.x, dz = layer.center.z - position.z;
      layer.mesh.visible = layer.keys.length > 0 && dx * dx + dz * dz < max * max;
    }
  }

  // Both halves of a door, as [x, y, z, value] for the bottom then the top.
  doorParts(x, y, z) {
    const v = this.get(x, y, z);
    const by = blockMeta(v) & DOOR_TOP ? y - 1 : y;
    return [[x, by, z, this.get(x, by, z)], [x, by + 1, z, this.get(x, by + 1, z)]]
      .filter(([, , , pv]) => shapeOf(pv) === 'door');
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
