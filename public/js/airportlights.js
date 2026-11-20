// The airport's lights, as each player's game draws them (where they go: airportLightSpots in
// shared/airport.js). Little lamps set into the ground (green down the taxiway and every link,
// blue along the taxiway's edges, white along the runway's, green across its ends), the approach
// lights reaching out from each end of the runway with a strobe racing in toward it, and the
// glide-slope lights: four lamps beside each end that show white or red depending on how steeply
// you're coming down (two white and two red: just right; all white: too high; all red: too low!).
// They glow softly by day and brightly at night.
import * as THREE from 'three';
import { airportLightSpots } from './shared/airport.js';

const COLORS = { green: 0x2bff5a, blue: 0x3a6dff, white: 0xfff6dc, yellow: 0xffd23f, approach: 0xfff6dc, red: 0xff2a2a };
const PAPI = [4.5, 5.5, 6.5, 7.5]; // (degrees: each lamp turns white above its angle. Just right: 6°)
const SEE = 600; // (farther than this, they aren't drawn)

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class AirportLights {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.spots = [];
  }

  setPlace(place) {
    this.group.clear();
    this.spots = airportLightSpots(place);
    if (!this.spots.length) return;
    const n = this.spots.length;
    this.center = this.spots.reduce((c, s) => [c[0] + s.x / n, c[1] + s.z / n], [0, 0]);
    // The lamps: little glowing caps set into the ground (approach lights up on short posts).
    const lamp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.1, 0.32), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    const posts = this.spots.filter(s => s.kind === 'approach' || s.kind === 'papi');
    const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.8 }), posts.length);
    const m = new THREE.Matrix4(), color = new THREE.Color();
    const height = s => (s.kind === 'approach' || s.kind === 'papi' ? 0.55 : 0.08);
    this.spots.forEach((s, i) => {
      m.makeTranslation(s.x, height(s), s.z);
      lamp.setMatrixAt(i, m);
      lamp.setColorAt(i, color.set(COLORS[s.kind === 'papi' ? 'red' : s.kind]));
    });
    posts.forEach((s, i) => post.setMatrixAt(i, m.makeTranslation(s.x, 0.25, s.z)));
    lamp.frustumCulled = post.frustumCulled = false;
    // And a glow round each one (brighter at night).
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    this.spots.forEach((s, i) => {
      pos.set([s.x, height(s) + 0.1, s.z], i * 3);
      color.set(COLORS[s.kind === 'papi' ? 'red' : s.kind]);
      col.set([color.r, color.g, color.b], i * 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const glow = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    glow.frustumCulled = false;
    // The strobe ("the rabbit") racing in along each set of approach lights.
    const rabbitGeo = new THREE.BufferGeometry();
    rabbitGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const rabbit = new THREE.Points(rabbitGeo, new THREE.PointsMaterial({ size: 4, map: glow.material.map, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    rabbit.frustumCulled = false;
    this.group.add(lamp, post, glow, rabbit);
    Object.assign(this, { lamp, glow, rabbit });
    this.papi = this.spots.map((s, i) => ({ s, i })).filter(o => o.s.kind === 'papi');
    this.approach = [-1, 1].map(end => this.spots.filter(s => s.kind === 'approach' && s.end === end));
  }

  // Every frame: on or off (by distance), how bright (night), the strobes, and the glide-slope
  // lights' colors for where you're watching from.
  update(t, eye, nightK) {
    if (!this.spots.length) return;
    const near = Math.hypot(eye.x - this.center[0], eye.z - this.center[1]) < SEE;
    this.group.visible = near;
    if (!near) return;
    this.glow.material.opacity = 0.25 + 0.75 * nightK;
    this.glow.material.size = 1.2 + 1.2 * nightK;
    // The glide-slope lights: how steeply you'd be coming down to them, from where you are.
    const color = new THREE.Color(), cols = this.glow.geometry.attributes.color;
    for (const { s, i } of this.papi) {
      const angle = (Math.atan2(eye.y, Math.hypot(eye.x - s.x, eye.z - s.z)) * 180) / Math.PI;
      color.set(angle > PAPI[s.i] ? COLORS.white : COLORS.red);
      this.lamp.setColorAt(i, color);
      cols.setXYZ(i, color.r, color.g, color.b);
    }
    this.lamp.instanceColor.needsUpdate = true;
    cols.needsUpdate = true;
    // The rabbit: twice a second it runs in from the far end of each set of approach lights.
    const p = this.rabbit.geometry.attributes.position;
    this.approach.forEach((lights, k) => {
      if (!lights.length) return;
      const n = lights[0].n, step = Math.floor(((t * 2) % 1) * (n + 2)); // (n bars, then a little gap)
      const bar = n - step, mid = lights.filter(s => s.i === bar)[2]; // (the middle lamp of that bar)
      if (mid) p.setXYZ(k, mid.x, 0.75, mid.z);
      else p.setXYZ(k, 0, -100, 0);
    });
    p.needsUpdate = true;
  }
}
