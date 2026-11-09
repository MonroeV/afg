// The ground: a big grassy plane (snowy up north), with holes where it's been dug out down to
// the bedrock, and the soft force field around the edge of the world.
import * as THREE from 'three';
import { WORLD, SNOW_LINE } from './shared/blocks.js';
import { TUNNEL_TOP, TUNNEL_BOTTOM, tunnelKey, earthAt } from './shared/underground.js';

// The six sides of an underground cell: the direction to the neighbor, and the face's corners
// (seen from inside the cell, so the tunnel's walls face into it).
const SIDES = [
  [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
  [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
  [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
  [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
  [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
  [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
];

const SIZE = WORLD.max - WORLD.min + 1;
// Where a hole's walls go (and which neighbor has to be ground for there to be one):
// [dx, dz, geometry].
const WALLS = [
  [0, -1, new THREE.PlaneGeometry(1, 1).translate(0.5, -0.5, 0)],
  [0, 1, new THREE.PlaneGeometry(1, 1).rotateY(Math.PI).translate(0.5, -0.5, 1)],
  [-1, 0, new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2).translate(0, -0.5, 0.5)],
  [1, 0, new THREE.PlaneGeometry(1, 1).rotateY(-Math.PI / 2).translate(1, -0.5, 0.5)],
];

export class Ground {
  constructor(scene, textures) {
    this.scene = scene;
    this.holes = new Set();
    // One byte per cell of the world: 255 where there's a hole (the grass isn't drawn there).
    this.holeData = new Uint8Array(SIZE * SIZE);
    this.holeMap = new THREE.DataTexture(this.holeData, SIZE, SIZE, THREE.RedFormat, THREE.UnsignedByteType);
    this.holeMap.magFilter = this.holeMap.minFilter = THREE.NearestFilter;
    this.holeMap.needsUpdate = true;
    this.buildPlane(textures);
    this.buildEdge();
    // Inside the holes: dirt walls (grassy along the top) and the bedrock at the bottom.
    this.wallMaterial = new THREE.MeshStandardMaterial({ map: textures.grass_side.map, normalMap: textures.grass_side.normalMap, roughness: 0.95 });
    this.floorMaterial = new THREE.MeshStandardMaterial({ map: textures.bedrock.map, normalMap: textures.bedrock.normalMap, roughness: 0.9 });
    this.floorGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, -1, 0.5);
    this.meshes = [];
    this.capacity = 0;
    // Secret tunnels (only Tunnel Diggers have any): earth walls up top, rock further down, the
    // bedrock at the bottom. A little darker than outside: it's underground.
    this.tunnels = new Set();
    this.tunnelMaterials = {
      dirt: new THREE.MeshStandardMaterial({ map: textures.dirt.map, normalMap: textures.dirt.normalMap, roughness: 0.95, color: 0xb8a898, side: THREE.DoubleSide }),
      stone: new THREE.MeshStandardMaterial({ map: textures.stone.map, normalMap: textures.stone.normalMap, roughness: 0.9, color: 0xa8a8b0, side: THREE.DoubleSide }),
      bedrock: new THREE.MeshStandardMaterial({ map: textures.bedrock.map, normalMap: textures.bedrock.normalMap, roughness: 0.9, side: THREE.DoubleSide }),
    };
    this.tunnelMeshes = [];
  }

  setTunnels(set) {
    this.tunnels = set;
    this.rebuild();
    this.rebuildTunnels();
  }

  // Draws the inside of every tunnel: a face wherever a tunnel meets solid earth.
  rebuildTunnels() {
    for (const m of this.tunnelMeshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.tunnelMeshes = [];
    if (!this.tunnels.size) return;
    const parts = { dirt: { pos: [], uv: [], idx: [] }, stone: { pos: [], uv: [], idx: [] }, bedrock: { pos: [], uv: [], idx: [] } };
    const solid = (x, y, z) => (y === -1 ? !this.holes.has(`${x},${z}`) : y < TUNNEL_BOTTOM || (y <= TUNNEL_TOP && !this.tunnels.has(tunnelKey(x, y, z))));
    for (const k of this.tunnels) {
      const [x, y, z] = k.split(',').map(Number);
      for (const [[dx, dy, dz], corners] of SIDES) {
        const ny = y + dy;
        if (!solid(x + dx, ny, z + dz)) continue;
        const p = parts[ny < TUNNEL_BOTTOM ? 'bedrock' : earthAt(ny)];
        const base = p.pos.length / 3;
        for (const c of corners) p.pos.push(x + c[0], y + c[1], z + c[2]);
        p.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
        p.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    for (const [name, p] of Object.entries(parts)) {
      if (!p.idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2));
      geo.setIndex(p.idx);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, this.tunnelMaterials[name]);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.tunnelMeshes.push(mesh);
    }
  }

  buildPlane(textures) {
    const groundTex = textures.grass_top;
    const repeat = 1000;
    const map = groundTex.map.clone();
    const normalMap = groundTex.normalMap.clone();
    for (const t of [map, normalMap]) {
      t.repeat.set(repeat, repeat);
      t.needsUpdate = true;
    }
    const geo = new THREE.PlaneGeometry(repeat, repeat, 200, 200).rotateX(-Math.PI / 2);
    // Gentle large-scale color variation hides the texture repeating.
    const colors = [];
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const n = Math.sin(x * 0.07) * Math.cos(z * 0.05) * 0.5 + Math.sin(x * 0.023 + z * 0.031) * 0.5;
      const k = 0.9 + n * 0.1;
      colors.push(k * (0.97 + n * 0.03), k, k * (0.95 - n * 0.05));
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.MeshStandardMaterial({ map, normalMap, vertexColors: true, roughness: 0.95 });
    const holeMap = this.holeMap;
    material.onBeforeCompile = shader => {
      shader.uniforms.holeMap = { value: holeMap };
      shader.uniforms.holeRect = { value: new THREE.Vector3(WORLD.min, WORLD.min, SIZE) };
      shader.uniforms.snowLine = { value: SNOW_LINE };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGround;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGround;\nuniform sampler2D holeMap;\nuniform vec3 holeRect;\nuniform float snowLine;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          vec2 huv = (vGround - holeRect.xy) / holeRect.z;
          if (huv.x >= 0.0 && huv.y >= 0.0 && huv.x < 1.0 && huv.y < 1.0 && texture2D(holeMap, huv).r > 0.5) discard;`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          // Up north the grass is under snow (with a wavy edge, not a straight line).
          float snowK = smoothstep(snowLine + 5.0, snowLine - 5.0, vGround.y + sin(vGround.x * 0.09) * 4.0 + sin(vGround.x * 0.27) * 1.5);
          float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.85, 0.93) * (0.82 + lum * 0.7), snowK);`);
    };
    const ground = new THREE.Mesh(geo, material);
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.plane = ground;
  }

  // A soft force-field marks the edge of the world.
  buildEdge() {
    const fc = document.createElement('canvas');
    fc.width = 4;
    fc.height = 64;
    const g = fc.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, 'rgba(90,180,255,0)');
    grad.addColorStop(1, 'rgba(90,180,255,0.55)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 64);
    const fieldMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(fc), transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false });
    const span = WORLD.max - WORLD.min + 1, h = 4, mid = (WORLD.min + WORLD.max + 1) / 2;
    for (const [x, z, ry] of [[mid, WORLD.min, 0], [mid, WORLD.max + 1, 0], [WORLD.min, mid, Math.PI / 2], [WORLD.max + 1, mid, Math.PI / 2]]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(span, h), fieldMat);
      wall.position.set(x, h / 2, z);
      wall.rotation.y = ry;
      this.scene.add(wall);
    }
  }

  // ---------- Holes ----------

  set(list) {
    this.holes = new Set(list.map(([x, z]) => `${x},${z}`));
    this.holeData.fill(0);
    for (const k of this.holes) this.mark(k, 255);
    this.rebuild();
  }

  setHole(x, z, on) {
    const k = `${x},${z}`;
    if (on === this.holes.has(k)) return;
    if (on) this.holes.add(k);
    else this.holes.delete(k);
    this.mark(k, on ? 255 : 0);
    this.rebuild();
    if (this.tunnels.size) this.rebuildTunnels(); // (a tunnel's roof opened, or closed)
  }

  mark(k, v) {
    const [x, z] = k.split(',').map(Number);
    if (x < WORLD.min || x > WORLD.max || z < WORLD.min || z > WORLD.max) return;
    this.holeData[(z - WORLD.min) * SIZE + (x - WORLD.min)] = v;
    this.holeMap.needsUpdate = true;
  }

  // Draws every hole again (there are never very many, and they don't change often).
  rebuild() {
    const n = this.holes.size;
    if (n > this.capacity) {
      for (const m of this.meshes) {
        this.scene.remove(m);
        m.dispose();
      }
      this.capacity = Math.max(64, n * 2);
      this.meshes = [this.floorGeometry, ...WALLS.map(w => w[2])].map((geo, i) => {
        const mesh = new THREE.InstancedMesh(geo, i ? this.wallMaterial : this.floorMaterial, this.capacity);
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        return mesh;
      });
    }
    if (!this.meshes.length) return;
    const m = new THREE.Matrix4();
    const counts = [0, 0, 0, 0, 0];
    for (const k of this.holes) {
      const [x, z] = k.split(',').map(Number);
      m.makeTranslation(x, 0, z);
      if (!this.tunnels.has(tunnelKey(x, TUNNEL_TOP, z))) this.meshes[0].setMatrixAt(counts[0]++, m); // (no floor over a tunnel)
      WALLS.forEach(([dx, dz], i) => {
        if (!this.holes.has(`${x + dx},${z + dz}`)) this.meshes[i + 1].setMatrixAt(counts[i + 1]++, m);
      });
    }
    this.meshes.forEach((mesh, i) => {
      mesh.count = counts[i];
      mesh.instanceMatrix.needsUpdate = true;
    });
  }
}
