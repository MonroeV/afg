// Stores the blocks and draws them. Each block type is one InstancedMesh,
// so thousands of blocks render in a handful of draw calls.
import * as THREE from 'three';
import { BLOCKS, WORLD, blockKey } from './shared/blocks.js';

export function createBlockMaterials(textures) {
  const make = (texName, def) => {
    const t = textures[texName];
    const m = new THREE.MeshStandardMaterial({
      map: t.map,
      normalMap: t.normalMap,
      roughness: def.metal ? 0.35 : def.glossy ? 0.25 : 0.88,
      metalness: def.metal ? 0.85 : 0,
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

  const materials = {};
  for (const [id, def] of Object.entries(BLOCKS)) {
    if (typeof def.tex === 'string') {
      materials[id] = make(def.tex, def);
    } else {
      // BoxGeometry face order: +x, -x, +y (top), -y (bottom), +z, -z
      const side = make(def.tex.side, def), top = make(def.tex.top, def), bottom = make(def.tex.bottom, def);
      materials[id] = [side, side, top, bottom, side, side];
    }
  }
  return materials;
}

export class World {
  constructor(scene, materials) {
    this.scene = scene;
    this.materials = materials;
    this.blocks = new Map(); // "x,y,z" -> id
    this.layers = {}; // id -> { mesh, keys: [], index: Map(key -> instance index) }
    this.geometry = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);
    this.matrix = new THREE.Matrix4();
  }

  get(x, y, z) {
    return this.blocks.get(blockKey(x, y, z)) || 0;
  }

  // Ground (below y=0) and the world edges are solid.
  isSolid(x, y, z) {
    if (y < 0) return true;
    if (x < WORLD.min || x > WORLD.max || z < WORLD.min || z > WORLD.max) return true;
    return this.blocks.has(blockKey(x, y, z));
  }

  clear() {
    for (const k of [...this.blocks.keys()]) {
      const [x, y, z] = k.split(',').map(Number);
      this.set(x, y, z, 0);
    }
  }

  load(list) {
    this.clear();
    for (const [x, y, z, b] of list) this.set(x, y, z, b);
  }

  set(x, y, z, id) {
    const k = blockKey(x, y, z);
    const old = this.blocks.get(k) || 0;
    if (old === id) return false;
    if (old) this.removeInstance(old, k);
    if (id) {
      this.blocks.set(k, id);
      this.addInstance(id, k, x, y, z);
    } else {
      this.blocks.delete(k);
    }
    return true;
  }

  layer(id) {
    let layer = this.layers[id];
    if (!layer) {
      layer = this.layers[id] = { mesh: null, keys: [], index: new Map() };
      this.grow(layer, id, 256);
    }
    return layer;
  }

  grow(layer, id, capacity) {
    const mesh = new THREE.InstancedMesh(this.geometry, this.materials[id], capacity);
    mesh.count = layer.keys.length;
    mesh.frustumCulled = false;
    mesh.castShadow = !BLOCKS[id].transparent;
    mesh.receiveShadow = true;
    if (BLOCKS[id].transparent) mesh.renderOrder = 1;
    if (layer.mesh) {
      mesh.instanceMatrix.array.set(layer.mesh.instanceMatrix.array.subarray(0, layer.keys.length * 16));
      this.scene.remove(layer.mesh);
      layer.mesh.dispose();
    }
    layer.mesh = mesh;
    this.scene.add(mesh);
  }

  addInstance(id, k, x, y, z) {
    const layer = this.layer(id);
    if (layer.keys.length >= layer.mesh.instanceMatrix.count) this.grow(layer, id, layer.mesh.instanceMatrix.count * 2);
    const i = layer.keys.length;
    layer.keys.push(k);
    layer.index.set(k, i);
    this.matrix.makeTranslation(x, y, z);
    layer.mesh.setMatrixAt(i, this.matrix);
    layer.mesh.count = layer.keys.length;
    layer.mesh.instanceMatrix.needsUpdate = true;
  }

  removeInstance(id, k) {
    const layer = this.layers[id];
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
      const id = this.get(x, y, z);
      if (id) {
        return { id, block: [x, y, z], normal, place: [x + normal[0], y + normal[1], z + normal[2]], distance: t };
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
