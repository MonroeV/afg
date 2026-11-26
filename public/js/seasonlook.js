// How the world looks through the seasons (shared/seasons.js says which one it is): the trees'
// leaves (green, then red and gold, then bare twigs with snow on, then buds and blossom), the
// grass and the ground (snow all over in winter), snow on the roofs, the flowers; leaves blowing
// about in the fall, and wildflowers popping up all over the grass in spring (not on anyone's
// land, though: there it's just the flowers they plant). All just on this
// screen (everyone works out the same season from the server's day and time).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seasonAt, snowAt, SPRING, SUMMER, FALL, WINTER } from './shared/seasons.js';
import { paintSeason, prepareSeason, SEASONAL_TEXTURES } from './textures.js';
import { isSnowyAt } from './shared/blocks.js';

// The grass's tint on the big ground: spring a fresh green, fall golden.
const TINTS = [new THREE.Color(0.95, 1.08, 0.9), new THREE.Color(1, 1, 1), new THREE.Color(1.12, 0.96, 0.62), new THREE.Color(1, 1, 1)];
const FLOWERS = 220; // wildflowers at most (round you)
const FLOWER_R = 20;

export class SeasonLook {
  constructor({ scene, textures, ground, effects, world, claimed }) {
    this.textures = textures;
    this.ground = ground;
    this.effects = effects;
    this.world = world;
    this.claimed = claimed || (() => false); // (no wildflowers on anyone's land: only what they plant)
    this.key = '1>1:1'; // (the textures start off looking like summer)
    this.queue = [];
    this.tint = new THREE.Color();
    this.leafT = 0;
    this.season = seasonAt(0, 0);
    this.flowers = this.makeFlowers(scene);
    this.lite = false; // (Lowest graphics: see update)
  }

  // A wildflower: two crossed pictures of flowers (the Flowers block's own picture, which is
  // itself in its springtime look then).
  makeFlowers(scene) {
    const geo = new THREE.PlaneGeometry(0.7, 0.7).translate(0, 0.35, 0);
    const both = mergeGeometries([geo, geo.clone().rotateY(Math.PI / 2)]);
    const mat = new THREE.MeshStandardMaterial({ map: this.textures.flowers?.map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
    const mesh = new THREE.InstancedMesh(both, mat, FLOWERS);
    mesh.count = 0;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { mesh, at: null, cells: [] };
  }

  // day and time: the server's; me: where you are.
  update(dt, day, time, me) {
    const s = (this.season = seasonAt(day, time));
    this.updateTextures(s);
    // The ground: snow coming and going, and the grass's color.
    const snow = snowAt(s);
    this.snow = snow;
    this.tint.copy(TINTS[s.last]).lerp(TINTS[s.i], s.mix);
    this.ground.setSeason(snow, this.tint);
    if (!me) return;
    if (this.lite) {
      // (Lowest graphics: no wildflowers or blowing leaves; the colors still change.)
      this.flowers.mesh.count = 0;
      this.flowers.at = this.flowers.shownAs = null;
      return;
    }
    // Fall: leaves blowing about.
    if (s.i === FALL) {
      this.leafT -= dt;
      if (this.leafT <= 0) {
        this.leafT = 0.12 / Math.max(0.2, s.mix);
        const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 14;
        const x = me.x + Math.cos(a) * r, z = me.z + Math.sin(a) * r;
        const wind = performance.now() / 9000;
        const low = Math.random() < 0.4; // (some skitter along the ground, some come down from the trees)
        this.effects.fallingLeaf(x, me.y + (low ? 0.15 : 2 + Math.random() * 5), z, Math.cos(wind) * (low ? 2 : 1), Math.sin(wind) * (low ? 2 : 1));
      }
    }
    this.updateFlowers(s, me);
  }

  // The textures: when the season (or how far it's come in) changes, each seasonal texture is
  // shown part way between last season's look and this one's, one texture a frame; their looks
  // are worked out a little each frame first.
  updateTextures(s) {
    const step = Math.round(s.mix * 8) / 8;
    const from = step >= 1 ? s.i : s.last, to = s.i;
    const key = `${from}>${to}:${step}`;
    if (key !== this.key) {
      this.key = key;
      this.job = { from, to, step, names: [...SEASONAL_TEXTURES] };
    }
    const job = this.job;
    if (!job?.names.length) return;
    const name = job.names[0];
    if (!prepareSeason(name, job.from, 24) || !prepareSeason(name, job.to, 24)) return;
    paintSeason(this.textures, name, job.from, job.to, job.step);
    job.names.shift();
  }

  // Spring: wildflowers all over the grass round you (each one in the same place every time:
  // which spots get one is worked out from where they are).
  updateFlowers(s, me) {
    const f = this.flowers;
    const bloom = s.i === SPRING ? s.mix : s.i === SUMMER ? 1 - s.mix : 0;
    if (bloom <= 0.01) {
      f.mesh.count = 0;
      f.at = null;
      return;
    }
    const cx = Math.round(me.x / 4) * 4, cz = Math.round(me.z / 4) * 4;
    if (!f.at || f.at[0] !== cx || f.at[1] !== cz) {
      f.at = [cx, cz];
      f.cells = [];
      for (let x = cx - FLOWER_R; x <= cx + FLOWER_R && f.cells.length < FLOWERS; x++)
        for (let z = cz - FLOWER_R; z <= cz + FLOWER_R && f.cells.length < FLOWERS; z++) {
          const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
          if (h > 0.16 || isSnowyAt(x, z) || this.world.get(x, 0, z) || !this.world.isSolid(x, -1, z) || this.claimed(x, z)) continue;
          f.cells.push([x + 0.2 + ((h * 37) % 0.6), z + 0.2 + ((h * 91) % 0.6), (h * 1000) % (Math.PI * 2)]);
        }
    }
    const shownAs = `${f.at}:${Math.round(bloom * 50)}`;
    if (shownAs === f.shownAs) return;
    f.shownAs = shownAs;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    f.cells.forEach(([x, z, a], i) => {
      m.compose(p.set(x, 0, z), q.setFromAxisAngle(up, a), sc.setScalar(Math.max(0.01, bloom)));
      f.mesh.setMatrixAt(i, m);
    });
    f.mesh.count = f.cells.length;
    f.mesh.instanceMatrix.needsUpdate = true;
  }

  // The land claims changed: work out where the wildflowers go again.
  refresh() {
    this.flowers.at = null;
    this.flowers.shownAs = null;
  }

  get winter() {
    return this.snow > 0.5;
  }
}

export { WINTER };
