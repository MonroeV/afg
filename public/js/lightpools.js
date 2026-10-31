// Soft pools of light on the ground (or floor) under every lamp. Real lights are costly,
// so only the closest lamps get one; these glowing pools are nearly free, so every lamp
// you can see spreads a wide, gentle glow around it.
import * as THREE from 'three';
import { BLOCKS, blockId, lightOff } from './shared/blocks.js';

function poolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  // A smooth falloff with no hard edge.
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    g.addColorStop(t, `rgba(255,255,255,${(1 - t) ** 2.2})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class LightPools {
  constructor(scene) {
    this.scene = scene;
    this.texture = poolTexture();
    this.version = -1;
    this.meshes = {};
    // Outdoor pools fade in at dusk; indoor ones (lamps that are always on) stay.
    for (const kind of ['outdoor', 'indoor']) {
      const material = new THREE.MeshBasicMaterial({
        map: this.texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        polygonOffset: true, polygonOffsetFactor: -2,
      });
      this.meshes[kind] = { material, mesh: null };
    }
  }

  // The floor under a lamp: for lamps you can bump into, look beside them (not under
  // their own post); for hanging lights, straight down.
  floorFor(world, x, y, z, def) {
    const [cx, cz] = def.box || def.shape !== 'model' ? [x + 1, z] : [x, z];
    for (let fy = y - (cx === x ? 1 : 0); fy >= 0; fy--) if (world.isSolid(cx, fy, cz)) return fy + 1;
    return 0;
  }

  rebuild(world) {
    const lists = { outdoor: [], indoor: [] };
    for (const k of world.lamps) {
      const [x, y, z] = k.split(',').map(Number);
      const v = world.get(x, y, z);
      const block = BLOCKS[blockId(v)];
      const light = block?.light;
      if (!light || lightOff(v)) continue;
      // Lamps under a roof are indoor lamps: their glow stays on in the daytime too.
      const indoor = light.always || world.isCovered(x, y, z);
      const color = world.lightTint(k, v) || light.color;
      lists[indoor ? 'indoor' : 'outdoor'].push({ x, z, floor: this.floorFor(world, x, y, z, block), light, color, power: light.power * (indoor ? 1.3 : 1) });
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), color = new THREE.Color();
    for (const [kind, list] of Object.entries(lists)) {
      const slot = this.meshes[kind];
      if (slot.mesh) {
        this.scene.remove(slot.mesh);
        slot.mesh.dispose();
      }
      if (!list.length) {
        slot.mesh = null;
        continue;
      }
      const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), slot.material, list.length);
      list.forEach((p, i) => {
        const r = p.light.range * 0.2;
        m.compose(new THREE.Vector3(p.x + 0.5, p.floor + 0.05, p.z + 0.5), q, new THREE.Vector3(r * 2, r * 2, 1));
        mesh.setMatrixAt(i, m);
        // A gentle tint of the lamp's color (mixed with white so it isn't too orange).
        mesh.setColorAt(i, color.set(p.color).lerp(new THREE.Color(1, 1, 1), 0.35).multiplyScalar(0.15 * p.power));
      });
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      this.scene.add(mesh);
      slot.mesh = mesh;
    }
  }

  // version changes whenever the world does; lampK is 0 by day, 1 at night.
  update(world, version, lampK) {
    if (version !== this.version) {
      this.version = version;
      this.rebuild(world);
    }
    this.meshes.outdoor.material.opacity = lampK;
    this.meshes.indoor.material.opacity = 0.4 + 0.4 * lampK;
    if (this.meshes.outdoor.mesh) this.meshes.outdoor.mesh.visible = lampK > 0.01;
  }
}
