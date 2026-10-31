// Stores the blocks and draws them. Each kind of block is one InstancedMesh,
// so tens of thousands of blocks render in a handful of draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BLOCKS, WORLD, PAINT_COLORS, blockKey, blockId, blockMeta, paintOf, withPaint, makeBlock, shapeOf, isSolidBlock, doorBox,
  railBoxes, railMask, itemOf, floorOf, carryPaint, rgbToHex, switchable, lightOff, DOOR_OPEN, DOOR_TOP, BED_FOOT,
} from './shared/blocks.js';
import { modelGeometry, modelMaterials } from './models.js';
import { pictureCanvas } from './pictures.js';

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
  // A picture hanging on the wall on the block's -z side (its front, +z, is the picture).
  picture: new THREE.BoxGeometry(0.9, 0.68, 0.05).translate(0, 0.5, -0.475),
};
const PICTURE_BOX = [-0.45, 0.16, -0.5, 0.45, 0.84, -0.44];

export const RAILING = 54;

// A railing along each edge in `mask`: a post at each end, a handrail on top, a rail
// near the bottom and thin bars in between. Built for the -z edge, then turned.
const railGeometries = {};
export function railGeometry(mask) {
  if (railGeometries[mask]) return railGeometries[mask];
  const parts = [];
  for (let i = 0; i < 4; i++) {
    if (!(mask & (1 << i))) continue;
    const edge = [
      ...[-0.44, 0.44].map(x => new THREE.BoxGeometry(0.12, 1, 0.12).translate(x, 0.5, -0.44)),
      new THREE.BoxGeometry(1, 0.08, 0.13).translate(0, 0.96, -0.44),
      new THREE.BoxGeometry(1, 0.06, 0.08).translate(0, 0.14, -0.44),
      ...[-0.22, 0, 0.22].map(x => new THREE.BoxGeometry(0.05, 0.8, 0.05).translate(x, 0.54, -0.44)),
    ];
    for (const g of edge) parts.push(g.rotateY(-i * Math.PI / 2).translate(0.5, 0, 0.5));
  }
  return (railGeometries[mask] = mergeGeometries(parts));
}

// A box in a cell turned by quarter turns around the cell's middle (for ladders). The box
// is given around the middle ([-0.5, 0.5] across), and returned from the cell's corner.
function turnBox(b, quarter) {
  const a = quarter * Math.PI / 2, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  const xs = [], zs = [];
  for (const [x, z] of [[b[0], b[2]], [b[3], b[2]], [b[0], b[5]], [b[3], b[5]]]) {
    xs.push(x * c + z * s + 0.5);
    zs.push(-x * s + z * c + 0.5);
  }
  return [Math.min(...xs), b[1], Math.min(...zs), Math.max(...xs), b[4], Math.max(...zs)];
}

// The same, for a box given from the cell's corner (furniture turned to face you).
export const turnCellBox = (b, quarter) => (quarter ? turnBox([b[0] - 0.5, b[1], b[2] - 0.5, b[3] - 0.5, b[4], b[5] - 0.5], quarter) : b);

// Which model a model block draws: couches have arms only on the ends of a row, and a bed
// has a head end and a foot end.
function modelName(v, renderKey) {
  const def = BLOCKS[blockId(v)];
  const variant = renderKey?.split(':')[1];
  if (def.connects && variant !== undefined) return `couch${variant}`;
  if (blockId(v) === BED) return blockMeta(v) & BED_FOOT ? 'bedFoot' : 'bed';
  return def.model;
}
const BED = 64;

// What you can click on a model: the box around its shape (turned the way it faces).
const modelBoxes = {};
function modelPickBox(v) {
  const name = modelName(v);
  if (!modelBoxes[name]) {
    const g = modelGeometry(name);
    g.computeBoundingBox();
    const { min, max } = g.boundingBox;
    const pad = 0.04;
    modelBoxes[name] = [Math.max(0, min.x - pad), Math.max(0, min.y - pad), Math.max(0, min.z - pad), Math.min(1, max.x + pad), Math.min(1, max.y + pad), Math.min(1, max.z + pad)];
  }
  return BLOCKS[blockId(v)].facing ? turnCellBox(modelBoxes[name], blockMeta(v) & 3) : modelBoxes[name];
}

// Does a ray hit a box? Returns the distance and the face it went in through.
export function rayBox(o, d, b) {
  let t0 = 0, t1 = Infinity, axis = -1;
  for (let a = 0; a < 3; a++) {
    const oa = a === 0 ? o.x : a === 1 ? o.y : o.z, da = a === 0 ? d.x : a === 1 ? d.y : d.z;
    if (Math.abs(da) < 1e-9) {
      if (oa < b[a] || oa > b[a + 3]) return null;
      continue;
    }
    let near = (b[a] - oa) / da, far = (b[a + 3] - oa) / da;
    if (near > far) [near, far] = [far, near];
    if (near > t0) {
      t0 = near;
      axis = a;
    }
    t1 = Math.min(t1, far);
    if (t0 > t1) return null;
  }
  const normal = [0, 0, 0];
  if (axis >= 0) normal[axis] = -Math.sign(axis === 0 ? d.x : axis === 1 ? d.y : d.z);
  return { t: t0, normal };
}

// Painted blocks: instead of just tinting the texture (which can't make dark blocks
// light), recolor it, keeping its light and dark details. A block can be painted all over
// (the white-or-colored instance color; white = not painted), and each of its six sides can
// have its own paint too (the paintA/paintB instance attributes: one packed RGB number per
// side, or -1). Doors use their own sides (PAINT_LOCAL) so the paint swings with them.
function paintable(material) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        #ifdef USE_INSTANCING
          attribute vec3 paintA;
          attribute vec3 paintB;
        #endif
        varying vec4 vFacePaint;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vFacePaint = vec4(0.0);
        #ifdef USE_INSTANCING
          #ifdef PAINT_LOCAL
            vec3 pn = objectNormal;
          #else
            vec3 pn = mat3(instanceMatrix) * objectNormal;
          #endif
          vec3 an = abs(pn);
          float packed = an.x >= an.y && an.x >= an.z ? (pn.x > 0.0 ? paintA.x : paintA.y)
            : an.y >= an.z ? (pn.y > 0.0 ? paintA.z : paintB.x)
            : (pn.z > 0.0 ? paintB.y : paintB.z);
          // Unpack the RGB, and turn it from screen colors into the linear light the shader uses.
          if (packed >= 0.0) vFacePaint = vec4(pow(vec3(floor(packed / 65536.0), mod(floor(packed / 256.0), 256.0), mod(packed, 256.0)) / 255.0, vec3(2.2)), 1.0);
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vFacePaint;`)
      .replace('#include <color_fragment>', `
        vec3 paintTint = vec3(1.0);
        bool painted = false;
        #if defined( USE_COLOR )
          if ( vColor.r + vColor.g + vColor.b < 2.99 ) { paintTint = vColor.rgb; painted = true; }
        #endif
        if ( vFacePaint.a > 0.5 ) { paintTint = vFacePaint.rgb; painted = true; }
        if ( painted ) {
          // Close to the paint's own color on any block, light or dark, with a little of the
          // block's texture showing through.
          float lum = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
          diffuseColor.rgb = paintTint * ( 0.62 + lum * 0.5 );
        }
      `)
      .replace('#include <metalnessmap_fragment>', `
        #include <metalnessmap_fragment>
        // Paint is a coat over the block: it isn't mirror-shiny or metallic, so its color shows.
        if ( painted ) {
          roughnessFactor = max( roughnessFactor, 0.55 );
          metalnessFactor = min( metalnessFactor, 0.2 );
        }
      `)
      .replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        // Painted lamps and neon glow in their new color.
        if ( painted ) {
          float glow = dot( totalEmissiveRadiance, vec3( 0.299, 0.587, 0.114 ) );
          totalEmissiveRadiance = paintTint * glow * 1.3;
        }
      `);
  };
  return material;
}

// Wind from a helicopter flying low: flowers bend away from it and flutter. The game sets
// these every frame (center = the spot on the ground under the helicopter).
export const WIND = { center: { value: new THREE.Vector3() }, strength: { value: 0 }, time: { value: 0 } };
function windy(material) {
  const paint = material.onBeforeCompile;
  material.onBeforeCompile = shader => {
    paint(shader);
    shader.uniforms.uWindCenter = WIND.center;
    shader.uniforms.uWindStrength = WIND.strength;
    shader.uniforms.uWindTime = WIND.time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uWindCenter;
        uniform float uWindStrength;
        uniform float uWindTime;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 windAt = (instanceMatrix * vec4(transformed, 1.0)).xyz;
          vec2 away = windAt.xz - uWindCenter.xz;
          float windDist = length(away);
          float bend = uWindStrength * clamp(1.0 - windDist / 9.0, 0.0, 1.0) * clamp(transformed.y, 0.0, 1.0);
          if (bend > 0.0) {
            float flutter = 0.65 + 0.35 * sin(uWindTime * 23.0 + windAt.x * 3.1 + windAt.z * 2.3);
            transformed.xz += away / max(windDist, 0.3) * bend * 0.45 * flutter;
            transformed.y -= bend * 0.18;
          }
        #endif`);
  };
}

export function createBlockMaterials(textures) {
  const make = (texName, def, extra = {}) => {
    const t = textures[texName];
    // How shiny each kind of block is. Shiny blocks reflect the world around them.
    // (Not too mirror-like, so lamps make soft highlights on them instead of glaring spots.)
    const roughness = def.mirror ? 0.02 : def.gold ? 0.24 : def.metal ? 0.28 : def.water ? 0.1 : def.glossy ? 0.3 : 0.88;
    const m = new THREE.MeshStandardMaterial({
      map: t.map,
      normalMap: t.normalMap,
      roughness,
      metalness: def.mirror || def.gold ? 1 : def.metal ? 0.85 : 0,
      ...extra,
    });
    if (def.water) m.normalScale.set(1.6, 1.6);
    // How strongly it reflects its surroundings (see lighting.js).
    // (Windows only reflect a little, so you can still see in and out through them.)
    m.userData.shine = def.mirror ? 1.6 : def.gold ? 1.3 : def.water ? 1.4 : def.transparent ? 0.5 : def.metal ? 1 : def.glossy ? 0.6 : 0;
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
      m.emissiveIntensity = def.emissive ? 1.5 : 1;
    }
    return m;
  };

  // Materials are keyed by "render key": the block id, plus a part for doors, or ":off" for
  // a lamp that's switched off.
  const materials = {};
  for (const [id, def] of Object.entries(BLOCKS)) {
    const shape = def.shape || 'cube';
    if (shape === 'picture') {
      // One material set per picture: the picture on the front, the frame color elsewhere.
      const frame = new THREE.MeshStandardMaterial({ color: def.art === 'poster' ? 0xf4f4f4 : 0x9a7330, roughness: 0.5, metalness: def.art === 'poster' ? 0 : 0.4 });
      for (let i = 0; i < 4; i++) {
        const tex = new THREE.CanvasTexture(pictureCanvas(def.art, i));
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        const art = new THREE.MeshStandardMaterial({ map: tex, roughness: def.art === 'poster' ? 0.55 : 0.75 });
        materials[`${id}:${i}`] = [frame, frame, frame, frame, art, frame];
      }
      materials[id] = materials[`${id}:0`];
    } else if (shape === 'model') {
      materials[id] = modelMaterials(def.model);
      paintable(materials[id][0]);
      paintable(materials[id][2]);
      paintable(materials[id][3]);
      if (switchable(Number(id))) {
        // Switched off: the shade or bulb is just a dull, unlit color.
        const off = modelMaterials(def.model);
        off[1] = new THREE.MeshStandardMaterial({ color: off[1].userData.baseColor.clone().multiplyScalar(0.4), vertexColors: true, roughness: 0.6 });
        paintable(off[0]);
        paintable(off[2]);
        paintable(off[3]);
        materials[`${id}:off`] = off;
      }
    } else if (shape === 'door') {
      const edge = make(def.tex.edge, def);
      edge.defines = { PAINT_LOCAL: 1 };
      for (const part of ['bottom', 'top']) {
        const face = make(def.tex[part], def, { alphaTest: 0.5 });
        face.defines = { PAINT_LOCAL: 1 };
        materials[`${id}:${part}`] = [edge, edge, edge, edge, face, face];
      }
      // Garage doors (three or more doors in a row) are ribbed metal.
      const garage = make('garage', { metal: true });
      garage.defines = { PAINT_LOCAL: 1 };
      garage.metalness = 0.25;
      garage.roughness = 0.6;
      garage.userData.shine = 0.3; // painted metal: only a soft reflection
      materials[`${id}:garage`] = [garage, garage, garage, garage, garage, garage];
    } else if (shape === 'plant') {
      materials[id] = make(def.tex, def, { alphaTest: 0.5, side: THREE.DoubleSide });
      windy(materials[id]);
    } else if (typeof def.tex === 'string') {
      materials[id] = make(def.tex, def);
      if (switchable(Number(id))) {
        const off = make(def.tex, def);
        off.emissive = new THREE.Color(0);
        materials[`${id}:off`] = off;
      }
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
    this.paints = new Map(); // painted sides, by spot (see blocks.js)
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
    this.partBoxes(itemOf(v), x, y, z, out);
    if (floorOf(v)) this.partBoxes(floorOf(v), x, y, z, out); // railings under a torch
  }

  partBoxes(v, x, y, z, out) {
    const shape = shapeOf(v);
    if (shape === 'cube') out.push([x, y, z, x + 1, y + 1, z + 1]);
    else if (shape === 'door') {
      const meta = blockMeta(v);
      const role = this.doorRole(x, y, z);
      const b = doorBox(meta, role.hinge);
      if (role.kind === 'garage' && meta & DOOR_OPEN) {
        // A rolled-up garage door is just a roll at the very top (above your head).
        if (role.top) {
          const c = doorBox(meta & ~DOOR_OPEN);
          out.push([x + c[0], y + 0.85, z + c[2], x + c[3], y + 1, z + c[5]]);
        }
        return;
      }
      out.push([x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]);
    } else if (shape === 'model') {
      const def = BLOCKS[blockId(v)];
      const b = def.box && (def.facing ? turnCellBox(def.box, blockMeta(v) & 3) : def.box);
      if (b) out.push([x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]);
    } else if (shape === 'rail' || shape === 'flat') {
      for (const b of railBoxes(blockMeta(v))) out.push([x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]);
    }
  }

  // What the crosshair can hit in a cell: the real shapes of thin things (a carpet, a door,
  // a ladder, a lamp…), so you can point past them at what's behind. Each box says which
  // part of the spot it belongs to: the item, or the floor / railing under it.
  pickBoxes(v, x, y, z) {
    const out = [];
    const add = (b, part) => out.push({ box: [x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]], part });
    const shapeBoxes = (u, part) => {
      const shape = shapeOf(u);
      if (shape === 'cube') add([0, 0, 0, 1, 1, 1], part);
      else if (shape === 'flat') {
        add([0, 0, 0, 1, 0.06, 1], part);
        for (const b of railBoxes(blockMeta(u), 1)) add(b, part);
      } else if (shape === 'rail') for (const b of railBoxes(blockMeta(u), 1)) add(b, part);
      else if (shape === 'plant') add([0.15, 0, 0.15, 0.85, 0.85, 0.85], part);
      else if (shape === 'ladder') add(turnBox([-0.42, 0, -0.5, 0.42, 1, -0.38], blockMeta(u)), part);
      else if (shape === 'model') add(modelPickBox(u), part);
      else if (shape === 'picture') add(turnBox(PICTURE_BOX, blockMeta(u) & 3), part);
      else if (shape === 'door') {
        // The door's panel (or, for an open garage door, just the roll at the top).
        const boxes = [];
        this.partBoxes(u, x, y, z, boxes);
        for (const b of boxes) out.push({ box: b, part });
      }
    };
    shapeBoxes(itemOf(v), 'item');
    if (floorOf(v)) shapeBoxes(floorOf(v), 'floor');
    return out;
  }

  load(flat) {
    this.loading = true;
    for (const k of [...this.blocks.keys()]) {
      const [x, y, z] = k.split(',').map(Number);
      this.set(x, y, z, 0);
    }
    for (let i = 0; i + 3 < flat.length; i += 4) this.set(flat[i], flat[i + 1], flat[i + 2], flat[i + 3]);
    this.loading = false;
    // Doors could only tell they were double or garage doors (and couches whether they join
    // up) once all their neighbors arrived.
    for (const [k, v] of this.blocks) {
      if (shapeOf(v) !== 'door' && !BLOCKS[blockId(itemOf(v))]?.connects) continue;
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
    carryPaint(this.paints, k, old, v);
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
      if (BLOCKS[blockId(itemOf(old))]?.connects || BLOCKS[blockId(itemOf(v))]?.connects) this.refreshCouchesNear(x, y, z);
      this.onChange?.(x, y, z);
    }
    return true;
  }

  // ---------- Doors ----------
  // A door is a column of door cells: two tall, or taller for a garage. Doors side by side
  // (facing the same way) work together: two make double doors that swing open to either
  // side, three or more make one big roll-up garage door, as tall as its columns.

  // The stack of door cells facing the same way that (x, y, z) is part of.
  doorColumn(x, y, z) {
    const facing = blockMeta(this.get(x, y, z)) & 3;
    const same = yy => {
      const n = this.get(x, yy, z);
      return shapeOf(n) === 'door' && (blockMeta(n) & 3) === facing;
    };
    let lo = y, hi = y;
    while (lo > 0 && y - lo < 24 && same(lo - 1)) lo--;
    while (hi < WORLD.maxY && hi - y < 24 && same(hi + 1)) hi++;
    return { lo, hi };
  }

  doorColumnCells(x, y, z) {
    const { lo, hi } = this.doorColumn(x, y, z), out = [];
    for (let yy = lo; yy <= hi; yy++) out.push([x, yy, z, this.get(x, yy, z)]);
    return out;
  }

  // The row of door columns (their bottom cells) that the door at (x, y, z) belongs to.
  doorRow(x, y, z) {
    const v = this.get(x, y, z);
    const by = this.doorColumn(x, y, z).lo;
    const facing = blockMeta(v) & 3;
    const [ax, az] = facing % 2 === 0 ? [1, 0] : [0, 1];
    const bottomAt = (cx, cz) => {
      const n = this.get(cx, by, cz), below = this.get(cx, by - 1, cz);
      if (shapeOf(n) !== 'door' || (blockMeta(n) & 3) % 2 !== facing % 2) return false;
      return !(shapeOf(below) === 'door' && (blockMeta(below) & 3) === (blockMeta(n) & 3));
    };
    let start = 0, end = 0;
    while (start > -16 && bottomAt(x + ax * (start - 1), z + az * (start - 1))) start--;
    while (end < 16 && bottomAt(x + ax * (end + 1), z + az * (end + 1))) end++;
    const cells = [];
    for (let i = start; i <= end; i++) cells.push([x + ax * i, by, z + az * i]);
    return { cells, index: -start, ax, az };
  }

  doorRole(x, y, z) {
    const row = this.doorRow(x, y, z);
    const n = row.cells.length;
    // In a garage door, the top cell of each column holds the roll when it's open.
    if (n >= 3) return { kind: 'garage', hinge: -1, size: n, top: this.doorColumn(x, y, z).hi === y };
    if (n === 1) return { kind: 'single', hinge: -1, size: 1 };
    // Double doors: each swings toward its own outside edge.
    const facing = blockMeta(this.get(x, y, z)) & 3;
    const a = facing * Math.PI / 2;
    const localX = Math.round(Math.cos(a) * row.ax - Math.sin(a) * row.az); // +1 if the door's right points along the row
    return { kind: 'double', hinge: (row.index === 0 ? -1 : 1) * localX, size: 2 };
  }

  // Redraws the doors around (x, y, z): a change can turn doors into double or garage
  // doors (or back), or change which cell is the top of a garage.
  refreshDoorsNear(x, y, z) {
    const seen = new Set();
    for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0], [0, 1, 0], [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1]]) {
      const cx = x + dx, cy = y + dy, cz = z + dz;
      if (shapeOf(this.get(cx, cy, cz)) !== 'door' || seen.has(blockKey(cx, cy, cz))) continue;
      for (const [rx, ry, rz] of this.doorGroup(cx, cy, cz)) {
        const k = blockKey(rx, ry, rz);
        if (seen.has(k)) continue;
        seen.add(k);
        this.rerender(rx, ry, rz);
      }
    }
  }

  // Every door cell that opens and closes together with this one.
  doorGroup(x, y, z) {
    const out = [];
    for (const [rx, ry, rz] of this.doorRow(x, y, z).cells) out.push(...this.doorColumnCells(rx, ry, rz));
    return out;
  }

  // Can a vehicle drive through this spot? Open doors let it through, except for the roll at
  // the top of a garage door; railings stop it.
  vehicleSolid(x, y, z) {
    const v = this.get(x, y, z);
    if (shapeOf(v) === 'door' && v && blockMeta(v) & DOOR_OPEN) {
      const role = this.doorRole(x, y, z);
      return role.kind === 'garage' && role.top;
    }
    return this.isSolid(x, y, z) || railMask(v) > 0;
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
    if (shapeOf(v) === 'rail') return `${id}:${blockMeta(v)}`;
    if (shapeOf(v) === 'picture') return `${id}:${(blockMeta(v) >> 2) & 3}`;
    if (BLOCKS[id].connects) return `${id}:${x === undefined ? 'ab' : this.couchArms(v, x, y, z)}`;
    if (id === BED) return `${id}:${blockMeta(v) & BED_FOOT ? 'foot' : 'head'}`;
    if (lightOff(v)) return `${id}:off`;
    return String(id);
  }

  // Which ends of a couch get an arm: not the sides where another couch (facing the same
  // way) carries on.
  couchArms(v, x, y, z) {
    const q = blockMeta(v) & 3, a = q * Math.PI / 2, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
    const joins = (dx, dz) => {
      const n = itemOf(this.get(x + dx, y, z + dz));
      return blockId(n) === blockId(v) && (blockMeta(n) & 3) === q;
    };
    return (joins(-c, s) ? '' : 'a') + (joins(c, -s) ? '' : 'b');
  }

  refreshCouchesNear(x, y, z) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (BLOCKS[blockId(itemOf(this.get(x + dx, y, z + dz)))]?.connects) this.rerender(x + dx, y, z + dz);
    }
  }

  layer(key, renderKey, v, x, z) {
    let layer = this.layers[key];
    if (!layer) {
      const def = BLOCKS[blockId(v)];
      const cx = (Math.floor(x / CHUNK) + 0.5) * CHUNK, cz = (Math.floor(z / CHUNK) + 0.5) * CHUNK;
      layer = this.layers[key] = {
        mesh: null, keys: [], index: new Map(), def,
        // Each layer has its own copy of the shape, to hold its blocks' painted sides.
        geometry: (def.shape === 'model' ? modelGeometry(modelName(v, renderKey)) : def.shape === 'rail' ? railGeometry(blockMeta(v)) : GEOMETRY[def.shape || 'cube']).clone(),
        material: this.materials[renderKey] ?? this.materials[blockId(v)],
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
    // (Little lamp models don't need shadows: you'd hardly see them, and they cost a lot.
    // Furniture does, or it would look like it's floating.)
    mesh.castShadow = !layer.def.transparent && shape !== 'flat' && shape !== 'picture' && !(shape === 'model' && layer.def.light);
    mesh.receiveShadow = true;
    if (layer.def.transparent) mesh.renderOrder = 1;
    // Every instance has a color: white for normal blocks, the paint color for painted ones.
    mesh.setColorAt(0, this.color.setRGB(1, 1, 1));
    // And the paint on each of its six sides (-1 = not painted).
    const sides = ['paintA', 'paintB'].map(name => {
      const attr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(-1), 3);
      const before = layer.geometry.getAttribute(name);
      if (before && layer.mesh) attr.array.set(before.array.subarray(0, layer.keys.length * 3));
      layer.geometry.setAttribute(name, attr);
      return attr;
    });
    layer.sides = sides;
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
    if (shape === 'ladder' || shape === 'picture') return m.makeTranslation(x + 0.5, y, z + 0.5).multiply(this.tmp.makeRotationY((meta & 3) * Math.PI / 2));
    if (BLOCKS[blockId(v)].facing) {
      // Furniture (and speed pads) turned around the middle of the cell.
      return m.makeTranslation(x + 0.5, y, z + 0.5).multiply(this.tmp.makeRotationY((meta & 3) * Math.PI / 2)).multiply(this.tmp.makeTranslation(-0.5, 0, -0.5));
    }
    if (shape !== 'door') return m.makeTranslation(x, y, z);
    m.makeTranslation(x + 0.5, y, z + 0.5).multiply(this.tmp.makeRotationY((meta & 3) * Math.PI / 2));
    if (!(meta & DOOR_OPEN)) return m;
    const role = this.doorRole(x, y, z);
    if (role.kind === 'garage') {
      // Rolled up: the door disappears except for the roll in its top row.
      if (!role.top) return m.multiply(this.tmp.makeScale(0.0001, 0.0001, 0.0001));
      return m.multiply(this.tmp.makeTranslation(0, 0.85, 0)).multiply(this.tmp.makeScale(1, 0.15, 1.5));
    }
    // Swing open on its hinge side.
    return m.multiply(this.tmp.makeTranslation(role.hinge * 0.41, 0, 0)).multiply(this.tmp.makeRotationY(Math.PI / 2));
  }

  addInstance(v, k, x, y, z) {
    // An item standing on a floor (a torch on a sidewalk): draw both. (Blocks from a newer
    // version of the game that this one doesn't know aren't drawn.)
    if (floorOf(v) && BLOCKS[blockId(floorOf(v))]) this.addPart(floorOf(v), `${k}|floor`, x, y, z);
    if (BLOCKS[blockId(itemOf(v))]) this.addPart(itemOf(v), k, x, y, z);
  }

  addPart(v, k, x, y, z) {
    const rails = shapeOf(v) === 'flat' ? blockMeta(v) : 0;
    if (!rails) return this.addOne(v, k, x, y, z);
    // A flat block with railings on it: the railings are a second instance, and they get the paint.
    this.addOne(v & 0x0fff, k, x, y, z);
    this.addOne(withPaint(makeBlock(RAILING, rails), paintOf(v)), `${k}|rail`, x, y, z);
  }

  removeInstance(k) {
    for (const part of [k, `${k}|rail`, `${k}|floor`, `${k}|floor|rail`]) if (this.cellLayer.has(part)) this.removeOne(part);
  }

  addOne(v, k, x, y, z) {
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
    // Painted sides: "a,b,c" for the block or item, "a,b,c|f" for a floor part ("|rail" is
    // just the railings drawn on a floor, painted with it).
    const faces = this.paints.get(k.replace('|rail', '').replace('|floor', '|f'));
    const [a, b] = layer.sides;
    for (let f = 0; f < 3; f++) {
      a.array[i * 3 + f] = faces ? faces[f] : -1;
      b.array[i * 3 + f] = faces ? faces[f + 3] : -1;
    }
    a.needsUpdate = b.needsUpdate = true;
    layer.mesh.count = layer.keys.length;
    layer.mesh.instanceMatrix.needsUpdate = true;
    layer.mesh.instanceColor.needsUpdate = true;
  }

  removeOne(k) {
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
      for (const attr of layer.sides) {
        attr.array.copyWithin(i * 3, last * 3, last * 3 + 3);
        attr.needsUpdate = true;
      }
      layer.keys[i] = lastKey;
      layer.index.set(lastKey, i);
    }
    layer.keys.pop();
    layer.index.delete(k);
    layer.mesh.count = layer.keys.length;
    layer.mesh.instanceMatrix.needsUpdate = true;
    layer.mesh.instanceColor.needsUpdate = true;
  }

  // ---------- Paint ----------

  facePaint(key) {
    return this.paints.get(key) || null;
  }

  // Sets the six side colors of a spot ("x,y,z" or "x,y,z|f"). Returns true if anything changed.
  setPaint(key, faces) {
    const old = this.paints.get(key);
    const empty = !faces || faces.every(c => c < 0);
    if (empty ? !old : old && old.every((c, i) => c === faces[i])) return false;
    if (empty) this.paints.delete(key);
    else this.paints.set(key, faces.slice());
    const [x, y, z] = key.split('|')[0].split(',').map(Number);
    this.rerender(x, y, z);
    this.revision++;
    return true;
  }

  loadPaints(list) {
    const cells = new Set();
    for (const key of this.paints.keys()) cells.add(key.split('|')[0]);
    this.paints = new Map(list || []);
    for (const key of this.paints.keys()) cells.add(key.split('|')[0]);
    for (const c of cells) this.rerender(...c.split(',').map(Number));
    this.revision++;
  }

  // The color a light shines in: its paint (all over, or on any side), if it's painted.
  lightTint(key, v) {
    if (paintOf(v)) return PAINT_COLORS[paintOf(v)];
    const faces = this.paints.get(key);
    const c = faces && [2, 0, 1, 4, 5, 3].map(i => faces[i]).find(f => f >= 0);
    return c >= 0 ? rgbToHex(c) : null;
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
        return { ground: true, block: [x, y, z], normal, place: [x, 0, z], distance: t, point: origin.clone().addScaledVector(dir, t) };
      }
      if (x < WORLD.min || x > WORLD.max || z < WORLD.min || z > WORLD.max) return null;
      const v = this.get(x, y, z);
      if (v && (shapeOf(v) !== 'cube' || floorOf(v))) {
        // Thin things only fill part of their cell: you can point (and click) past them.
        let best = null;
        for (const p of this.pickBoxes(v, x, y, z)) {
          const h = rayBox(origin, dir, p.box);
          if (h && h.t <= maxDist && (!best || h.t < best.t)) best = { ...h, ...p };
        }
        if (best) return { ...this.hitResult(v, x, y, z, best.normal, best.t, origin, dir), part: best.part, box: best.box };
      } else if (v) {
        return { ...this.hitResult(v, x, y, z, normal, t, origin, dir), part: 'item' };
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

  hitResult(v, x, y, z, normal, t, origin, dir) {
    return {
      value: v, id: blockId(v), block: [x, y, z], normal, place: [x + normal[0], y + normal[1], z + normal[2]],
      distance: t, point: origin.clone().addScaledVector(dir, t),
    };
  }
}
