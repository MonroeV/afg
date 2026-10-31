// Builds a customizable blocky character from a "look" (see shared/avatar.js).
// Faces and clothes are drawn on small canvases; hats, hair and extras are 3D shapes.
import * as THREE from 'three';
import { sanitizeLook } from './shared/avatar.js';

// Body measurements (in blocks). The character's feet are at y = 0.
const LEG = { w: 0.24, h: 0.72, d: 0.26 };
const TORSO = { w: 0.52, h: 0.66, d: 0.28 };
const ARM = { w: 0.2, h: 0.64, d: 0.22 };
const HEAD = 0.5;
const HIP_Y = LEG.h;
const NECK_Y = HIP_Y + TORSO.h;

// ---------- Canvas helpers ----------

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

function shadeHex(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

const material = (texOrColor, extra = {}) =>
  new THREE.MeshStandardMaterial({
    ...(texOrColor instanceof THREE.Texture ? { map: texOrColor } : { color: texOrColor }),
    roughness: 0.75,
    ...extra,
  });

// ---------- Faces (drawn on a 16x16 pixel grid) ----------

function drawFace(ctx, look) {
  const S = 4; // pixels per grid cell on a 64x64 canvas
  const px = (x, y, color, w = 1, h = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(x * S, y * S, w * S, h * S);
  };
  const skin = look.skin;
  const dark = '#2b1a12';
  const mouth = '#7a2b2b';
  const blush = 'rgba(255,110,140,0.45)';
  px(0, 0, skin, 16, 16);

  const eyes = (lx = 4, rx = 10, y = 7) => {
    for (const x of [lx, rx]) {
      px(x, y, '#ffffff', 2, 2);
      px(x + 1, y, look.eyes, 1, 2);
      px(x + 1, y, '#000000', 1, 1);
    }
  };
  const smile = (y = 11) => {
    px(5, y - 1, mouth);
    px(10, y - 1, mouth);
    px(6, y, mouth, 4, 1);
  };

  switch (look.face) {
    case 'grin':
      eyes();
      px(5, 10, mouth, 6, 3);
      px(5, 10, '#ffffff', 6, 1);
      px(6, 12, '#ff7b9c', 4, 1);
      px(2, 10, blush, 2, 1); px(12, 10, blush, 2, 1);
      break;
    case 'cool':
      px(3, 6, '#111111', 10, 1);
      px(3, 7, '#111111', 4, 2); px(9, 7, '#111111', 4, 2);
      px(4, 7, '#3d6cff'); px(10, 7, '#3d6cff');
      px(7, 11, mouth, 4, 1); px(11, 10, mouth);
      break;
    case 'wink':
      px(4, 8, dark, 2, 1);
      px(10, 7, '#ffffff', 2, 2); px(11, 7, look.eyes, 1, 2); px(11, 7, '#000', 1, 1);
      smile();
      px(2, 10, blush, 2, 1); px(12, 10, blush, 2, 1);
      break;
    case 'surprised':
      for (const x of [4, 10]) { px(x, 6, '#ffffff', 2, 3); px(x + 1, 7, look.eyes, 1, 1); }
      px(7, 10, mouth, 2, 3);
      px(7, 11, '#3a0d0d', 2, 1);
      break;
    case 'silly':
      px(4, 7, '#ffffff', 2, 2); px(5, 8, '#000');
      px(10, 7, '#ffffff', 2, 2); px(10, 7, '#000');
      px(5, 10, mouth, 6, 1);
      px(8, 11, '#ff6f91', 2, 2);
      break;
    case 'sleepy':
      px(4, 8, dark, 2, 1); px(10, 8, dark, 2, 1);
      px(7, 11, mouth, 2, 1);
      px(13, 2, '#ffffff'); px(14, 1, '#ffffff');
      px(2, 10, blush, 2, 1); px(12, 10, blush, 2, 1);
      break;
    case 'cat':
      eyes();
      px(7, 9, '#ff7b9c', 2, 1);
      px(6, 11, mouth); px(7, 10, mouth); px(8, 10, mouth); px(9, 11, mouth);
      px(1, 9, dark, 3, 1); px(1, 11, dark, 3, 1); px(12, 9, dark, 3, 1); px(12, 11, dark, 3, 1);
      break;
    case 'robot':
      px(1, 4, '#9aa3ad', 14, 11);
      px(2, 6, '#162029', 12, 4);
      px(3, 7, '#45f0ff', 3, 2); px(10, 7, '#45f0ff', 3, 2);
      for (let x = 4; x < 12; x += 2) px(x, 12, '#4c5560', 1, 2);
      break;
    case 'starry': {
      for (const cx of [4.5, 10.5]) {
        px(cx, 6, '#ffd84a', 1, 3);
        px(cx - 1, 7, '#ffd84a', 3, 1);
      }
      px(5, 10, mouth, 6, 2);
      px(6, 11, '#ff7b9c', 4, 1);
      px(2, 10, blush, 2, 1); px(12, 10, blush, 2, 1);
      break;
    }
    default:
      eyes();
      smile();
      px(2, 10, blush, 2, 1); px(12, 10, blush, 2, 1);
  }

  // Hair fringe along the top of the face.
  const hair = look.hair;
  if (hair !== 'none' && hair !== 'mohawk') {
    px(0, 0, look.hairColor, 16, 2);
    if (hair === 'spiky' || hair === 'short') { px(0, 2, look.hairColor, 3, 1); px(10, 2, look.hairColor, 6, 1); }
    if (hair === 'long' || hair === 'ponytail' || hair === 'buns') { px(0, 2, look.hairColor, 2, 6); px(14, 2, look.hairColor, 2, 6); px(2, 2, look.hairColor, 4, 1); }
    if (hair === 'afro') px(0, 2, look.hairColor, 16, 1);
  }
}

function headMaterials(look) {
  const hasHair = look.hair !== 'none' && look.hair !== 'mohawk';
  const side = canvas(16, 16, ctx => {
    ctx.fillStyle = look.skin;
    ctx.fillRect(0, 0, 16, 16);
    if (hasHair) {
      ctx.fillStyle = look.hairColor;
      const long = ['long', 'ponytail', 'buns', 'afro'].includes(look.hair);
      ctx.fillRect(0, 0, 16, 4);
      ctx.fillRect(10, 0, 6, long ? 14 : 8); // back of the side
    }
    ctx.fillStyle = shadeHex(look.skin, 0.85);
    ctx.fillRect(6, 7, 2, 3); // ear
  });
  const back = hasHair ? material(look.hairColor) : material(look.skin);
  const top = hasHair ? material(look.hairColor) : material(look.skin);
  const face = canvas(64, 64, ctx => drawFace(ctx, look));
  const sideMat = material(side);
  const bottom = material(look.skin);
  // +x, -x, +y, -y, +z (face, toward -z after we turn it), -z
  return [sideMat, sideMat, top, bottom, back, material(face)];
}

// ---------- Clothes ----------

function torsoTexture(look, front) {
  const s = look.shirt, c1 = look.shirtColor, c2 = look.shirtColor2;
  return canvas(64, 80, (ctx, w, h) => {
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, w, h);
    if (s === 'striped') {
      ctx.fillStyle = c2;
      for (let y = 4; y < h; y += 16) ctx.fillRect(0, y, w, 8);
    }
    if (s === 'jersey') {
      ctx.fillStyle = c2;
      ctx.fillRect(0, 0, 6, h); ctx.fillRect(w - 6, 0, 6, h);
      ctx.font = 'bold 40px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(front ? '10' : '7', w / 2, 56);
    }
    if (s === 'dress') {
      ctx.fillStyle = c2;
      ctx.fillRect(0, h - 22, w, 6); // belt
    }
    if (!front) return;
    if (s === 'tshirt' || s === 'dress' || s === 'tank') {
      ctx.fillStyle = look.skin;
      ctx.beginPath();
      ctx.moveTo(22, 0); ctx.lineTo(42, 0); ctx.lineTo(32, 12); ctx.fill();
      ctx.strokeStyle = c2;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    if (s === 'hoodie') {
      ctx.fillStyle = shadeHex(c1, 0.8);
      ctx.fillRect(14, 50, 36, 22);
      ctx.fillStyle = c2;
      ctx.fillRect(24, 4, 3, 22); ctx.fillRect(37, 4, 3, 22);
    }
    if (s === 'jacket') {
      ctx.fillStyle = c2;
      ctx.fillRect(22, 0, 20, h);
      ctx.fillStyle = shadeHex(c1, 0.7);
      ctx.fillRect(20, 0, 3, h); ctx.fillRect(41, 0, 3, h);
      ctx.fillStyle = '#d9d9d9';
      for (let y = 16; y < h; y += 16) ctx.fillRect(14, y, 4, 4);
    }
    if (s === 'tank') {
      ctx.fillStyle = look.skin;
      ctx.fillRect(0, 0, 12, 18); ctx.fillRect(w - 12, 0, 12, 18);
    }
  });
}

function sleeveFraction(shirt) {
  if (shirt === 'tank') return 0;
  if (shirt === 'hoodie' || shirt === 'jacket') return 0.88;
  return 0.38;
}

function armTexture(look) {
  const sleeve = sleeveFraction(look.shirt);
  return canvas(16, 64, (ctx, w, h) => {
    ctx.fillStyle = look.skin;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = look.shirtColor;
    ctx.fillRect(0, 0, w, h * sleeve);
    if (look.shirt === 'striped' && sleeve) {
      ctx.fillStyle = look.shirtColor2;
      for (let y = 4; y < h * sleeve; y += 16) ctx.fillRect(0, y, w, 8);
    }
    if (look.shirt === 'jacket' || look.shirt === 'hoodie') {
      ctx.fillStyle = shadeHex(look.shirtColor, 0.75);
      ctx.fillRect(0, h * sleeve - 4, w, 4);
    }
  });
}

function legTexture(look) {
  const p = look.pants;
  return canvas(16, 72, (ctx, w, h) => {
    ctx.fillStyle = look.skin;
    ctx.fillRect(0, 0, w, h);
    const pantsEnd = p === 'shorts' ? 0.42 : p === 'skirt' ? 0.1 : 0.88;
    ctx.fillStyle = look.pantsColor;
    ctx.fillRect(0, 0, w, h * pantsEnd);
    if (p === 'jeans') {
      ctx.fillStyle = shadeHex(look.pantsColor, 1.25);
      ctx.fillRect(7, 0, 1, h * pantsEnd);
      ctx.fillStyle = shadeHex(look.pantsColor, 0.75);
      ctx.fillRect(0, h * pantsEnd - 4, w, 4);
    }
    if (p === 'sweatpants') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 2, h * pantsEnd);
      ctx.fillStyle = shadeHex(look.pantsColor, 0.8);
      ctx.fillRect(0, h * pantsEnd - 5, w, 5);
    }
    if (look.shirt === 'dress') {
      ctx.fillStyle = look.skin;
      ctx.fillRect(0, 0, w, h * 0.88);
    }
    // Shoes with a white sole.
    ctx.fillStyle = look.shoesColor;
    ctx.fillRect(0, h * 0.86, w, h * 0.14);
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(0, h - 3, w, 3);
  });
}

// ---------- 3D bits ----------

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function addHair(head, look) {
  const m = material(look.hairColor);
  const top = HEAD / 2;
  switch (look.hair) {
    case 'short':
      head.add(box(0.53, 0.08, 0.53, m, 0, top + 0.03, 0.01));
      break;
    case 'spiky':
      head.add(box(0.53, 0.07, 0.53, m, 0, top + 0.03, 0.01));
      for (let i = 0; i < 7; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 4), m);
        spike.position.set(-0.18 + (i % 4) * 0.12, top + 0.12, i < 4 ? -0.08 : 0.1);
        spike.rotation.set(i < 4 ? -0.3 : 0.3, 0, -0.4 + (i % 4) * 0.25);
        spike.castShadow = true;
        head.add(spike);
      }
      break;
    case 'long':
      head.add(box(0.53, 0.08, 0.53, m, 0, top + 0.03, 0.01));
      head.add(box(0.53, 0.62, 0.1, m, 0, -0.06, 0.26));
      break;
    case 'ponytail': {
      head.add(box(0.53, 0.08, 0.53, m, 0, top + 0.03, 0.01));
      const tail = box(0.14, 0.38, 0.14, m, 0, 0.0, 0.33);
      tail.rotation.x = 0.35;
      head.add(tail);
      head.add(box(0.16, 0.08, 0.16, material('#ff5fa2'), 0, 0.18, 0.29));
      break;
    }
    case 'mohawk':
      head.add(box(0.1, 0.2, 0.5, m, 0, top + 0.1, 0.02));
      break;
    case 'afro': {
      const afro = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), m);
      afro.scale.set(1, 0.85, 1);
      afro.position.set(0, 0.17, 0.06);
      afro.castShadow = true;
      head.add(afro);
      break;
    }
    case 'buns':
      head.add(box(0.53, 0.08, 0.53, m, 0, top + 0.03, 0.01));
      for (const x of [-0.2, 0.2]) {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), m);
        bun.position.set(x, top + 0.1, 0.05);
        bun.castShadow = true;
        head.add(bun);
      }
      break;
  }
}

function addHat(head, look) {
  const color = look.hatColor;
  const m = material(color);
  // Hats sit on top of big hairdos.
  const top = HEAD / 2 + (look.hair === 'afro' ? 0.2 : look.hair === 'buns' || look.hair === 'spiky' ? 0.06 : look.hair === 'mohawk' ? 0.1 : 0);
  const add = mesh => {
    mesh.castShadow = true;
    head.add(mesh);
    return mesh;
  };
  switch (look.hat) {
    case 'cap':
      add(box(0.55, 0.16, 0.55, m, 0, top + 0.05, 0));
      add(box(0.5, 0.04, 0.28, m, 0, top - 0.01, -0.36));
      add(box(0.08, 0.04, 0.08, material('#ffffff'), 0, top + 0.14, 0));
      break;
    case 'beanie':
      add(box(0.56, 0.24, 0.56, m, 0, top + 0.06, 0));
      add(box(0.58, 0.08, 0.58, material(shadeHex(color, 0.75)), 0, top - 0.04, 0));
      add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), material('#ffffff'))).position.set(0, top + 0.22, 0);
      break;
    case 'tophat':
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 20), m)).position.y = top + 0.01;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.42, 20), m)).position.y = top + 0.22;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.07, 20), material('#111111'))).position.y = top + 0.07;
      break;
    case 'crown': {
      const gold = material('#ffcf3f', { metalness: 0.9, roughness: 0.25 });
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 5, 1, true), gold)).position.y = top + 0.05;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 4), gold));
        spike.position.set(Math.sin(a) * 0.24, top + 0.16, Math.cos(a) * 0.24);
      }
      add(new THREE.Mesh(new THREE.OctahedronGeometry(0.05), material(color, { emissive: color, emissiveIntensity: 0.4 }))).position.set(0, top + 0.07, -0.27);
      break;
    }
    case 'cowboy':
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 24), m)).position.y = top;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.26, 16), m)).position.y = top + 0.14;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.06, 16), material(shadeHex(color, 0.6)))).position.y = top + 0.05;
      break;
    case 'party': {
      const stripes = canvas(32, 32, (ctx, w, h) => {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ffffff';
        for (let y = 0; y < h; y += 8) ctx.fillRect(0, y, w, 4);
      });
      add(new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 16), material(stripes))).position.y = top + 0.22;
      add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), material('#ffd84a'))).position.y = top + 0.46;
      break;
    }
    case 'wizard': {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 24), m)).position.y = top;
      const cone = add(new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 16), m));
      cone.position.set(0, top + 0.34, 0.04);
      cone.rotation.x = 0.18;
      add(new THREE.Mesh(new THREE.OctahedronGeometry(0.06), material('#ffd84a', { emissive: '#ffd84a', emissiveIntensity: 0.6 }))).position.set(0, top + 0.25, -0.24);
      break;
    }
    case 'viking': {
      const helmet = add(new THREE.Mesh(new THREE.SphereGeometry(0.29, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), material('#9aa3ad', { metalness: 0.8, roughness: 0.35 })));
      helmet.position.y = top - 0.04;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.295, 0.07, 18), m)).position.y = top - 0.02;
      for (const s of [-1, 1]) {
        const horn = add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 10), material('#f3ead2')));
        horn.position.set(s * 0.33, top + 0.1, 0);
        horn.rotation.z = -s * 0.9;
      }
      break;
    }
  }
}

function addCatEars(head, look) {
  const m = material(look.hair === 'none' ? look.skin : look.hairColor);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 4), m);
    ear.position.set(s * 0.17, HEAD / 2 + 0.1, 0);
    ear.rotation.y = Math.PI / 4;
    ear.castShadow = true;
    head.add(ear);
  }
}

function addExtra(torso, look, parts) {
  const m = material(look.extraColor);
  if (look.extra === 'backpack') {
    torso.add(box(0.42, 0.46, 0.18, m, 0, 0, 0.23));
    torso.add(box(0.3, 0.16, 0.06, material(shadeHex(look.extraColor, 0.75)), 0, -0.1, 0.34));
    for (const x of [-0.15, 0.15]) torso.add(box(0.06, 0.6, 0.02, material(shadeHex(look.extraColor, 0.6)), x, 0.02, -0.15));
  } else if (look.extra === 'cape') {
    const pivot = new THREE.Group();
    pivot.position.set(0, TORSO.h / 2, 0.16);
    const cape = box(0.56, 0.95, 0.03, material(look.extraColor, { side: THREE.DoubleSide }), 0, -0.47, 0);
    pivot.add(cape);
    torso.add(pivot);
    parts.cape = pivot;
  } else if (look.extra === 'wings') {
    const wm = material(look.extraColor, { emissive: look.extraColor, emissiveIntensity: 0.15, transparent: true, opacity: 0.9 });
    parts.wings = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.08, 0.1, 0.16);
      const wing = box(0.55, 0.5, 0.03, wm, s * 0.28, 0.1, 0);
      wing.rotation.z = s * 0.3;
      pivot.add(wing);
      pivot.rotation.y = s * 0.5;
      torso.add(pivot);
      parts.wings.push(pivot);
    }
  }
}

// ---------- Character ----------

export function buildCharacter(rawLook) {
  const look = sanitizeLook(rawLook);
  const group = new THREE.Group();
  const parts = { group, look };

  // Legs (pivot at the hips)
  const legMat = material(legTexture(look));
  const legMats = [legMat, legMat, material(look.pantsColor), material(look.shoesColor), legMat, legMat];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.13, HIP_Y, 0);
    pivot.add(box(LEG.w, LEG.h, LEG.d, legMats, 0, -LEG.h / 2, 0));
    group.add(pivot);
    parts[s < 0 ? 'legL' : 'legR'] = pivot;
  }
  if (look.pants === 'skirt' || look.shirt === 'dress') {
    const color = look.shirt === 'dress' ? look.shirtColor : look.pantsColor;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, look.shirt === 'dress' ? 0.45 : 0.3, 8), material(color));
    skirt.position.y = HIP_Y - (look.shirt === 'dress' ? 0.2 : 0.13);
    skirt.rotation.y = Math.PI / 8;
    skirt.castShadow = true;
    group.add(skirt);
  }

  // Torso
  const side = material(look.shirt === 'striped' ? torsoTexture(look, false) : look.shirtColor);
  const torsoMats = [side, side, material(look.shirtColor), material(look.pantsColor), material(torsoTexture(look, false)), material(torsoTexture(look, true))];
  const torso = box(TORSO.w, TORSO.h, TORSO.d, torsoMats, 0, HIP_Y + TORSO.h / 2, 0);
  group.add(torso);
  parts.torso = torso;
  if (look.shirt === 'hoodie') torso.add(box(0.4, 0.16, 0.1, material(shadeHex(look.shirtColor, 0.85)), 0, TORSO.h / 2 - 0.02, 0.17));
  addExtra(torso, look, parts);

  // Arms (pivot at the shoulders)
  const armMat = material(armTexture(look));
  const sleeveTop = material(sleeveFraction(look.shirt) ? look.shirtColor : look.skin);
  const armMats = [armMat, armMat, sleeveTop, material(look.skin), armMat, armMat];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * (TORSO.w / 2 + ARM.w / 2 + 0.01), NECK_Y - 0.04, 0);
    pivot.add(box(ARM.w, ARM.h, ARM.d, armMats, 0, -ARM.h / 2 + 0.04, 0));
    group.add(pivot);
    parts[s < 0 ? 'armL' : 'armR'] = pivot;
  }

  // Head (pivot at the neck). The face is on the -z side, which is "forward".
  const head = new THREE.Group();
  head.position.y = NECK_Y;
  const headInner = new THREE.Group();
  headInner.position.y = HEAD / 2;
  headInner.add(box(HEAD, HEAD, HEAD, headMaterials(look)));
  addHair(headInner, look);
  if (look.face === 'cat' && look.hat === 'none') addCatEars(headInner, look);
  addHat(headInner, look);
  head.add(headInner);
  group.add(head);
  parts.head = head;

  parts.dispose = () => {
    group.traverse(o => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      for (const m of [].concat(o.material)) {
        m.map?.dispose();
        m.dispose();
      }
    });
  };
  return parts;
}

// Poses the character. state: { walk, speed (0..1), pitch, swing (0..1, 1 = done),
// dance (seconds left), sitting, time }
export function animateCharacter(ch, s) {
  const t = s.time || 0;
  let swingL = 0, swingR = 0, legL = 0, legR = 0, armLz = 0, armRz = 0, bob = 0, headZ = 0;
  const walk = Math.sin(s.walk || 0) * (s.speed || 0) * 0.8;
  legL = walk;
  legR = -walk;
  swingL = -walk;
  swingR = walk;

  if (s.dance > 0) {
    const d = t * 8;
    armLz = -2.4 + Math.sin(d) * 0.4;
    armRz = 2.4 + Math.sin(d + Math.PI) * 0.4;
    swingL = swingR = 0;
    legL = Math.max(0, Math.sin(d)) * 0.5;
    legR = Math.max(0, -Math.sin(d)) * 0.5;
    bob = Math.abs(Math.sin(d)) * 0.08;
    headZ = Math.sin(d) * 0.2;
  } else if (s.wave > 0) {
    armRz = 2.6;
    swingR = Math.sin(t * 12) * 0.3;
  }
  // (A positive turn swings a leg or arm forward, the way the face looks.) `sit` blends
  // smoothly from standing (0) to sitting (1).
  const sit = s.sit ?? (s.sitting ? 1 : 0);
  if (sit > 0) {
    legL += (Math.PI / 2 - legL) * sit;
    legR += (Math.PI / 2 - legR) * sit;
    swingL += (0.55 - swingL) * sit;
    swingR += (0.55 - swingR) * sit;
  }
  // Crouching: knees forward and a little lower, arms out in front for balance.
  let crouchDrop = 0;
  if (s.crouch) {
    legL = 0.75 + walk * 0.4;
    legR = 0.75 - walk * 0.4;
    swingL = 0.6 - walk * 0.3;
    swingR = 0.6 + walk * 0.3;
    crouchDrop = 0.72 * (1 - Math.cos(0.75)) + 0.05;
  }
  if (s.swing !== undefined && s.swing < 1) swingR = -1.8 * Math.sin(s.swing * Math.PI);

  ch.legL.rotation.x = legL;
  ch.legR.rotation.x = legR;
  ch.armL.rotation.set(swingL, 0, armLz * 0.5);
  ch.armR.rotation.set(swingR, 0, armRz * 0.5);
  ch.group.position.y = bob - crouchDrop;
  ch.head.rotation.set(Math.max(-0.8, Math.min(0.8, s.pitch || 0)), 0, headZ);
  if (ch.cape) ch.cape.rotation.x = 0.08 + (s.speed || 0) * 0.9 + Math.sin(t * 6) * 0.05 * (s.speed || 0);
  if (ch.wings) {
    const flap = Math.sin(t * (s.flying ? 14 : 2)) * (s.flying ? 0.5 : 0.1);
    ch.wings[0].rotation.y = -0.5 - flap;
    ch.wings[1].rotation.y = 0.5 + flap;
  }
}

// ---------- Pets ----------

function petFace(kind, color) {
  return canvas(32, 32, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    const px = (x, y, c, pw = 1, ph = 1) => {
      ctx.fillStyle = c;
      ctx.fillRect(x * 4, y * 4, pw * 4, ph * 4);
    };
    if (kind === 'dragon') {
      px(1, 2, '#fff59d', 2, 2); px(5, 2, '#fff59d', 2, 2);
      px(2, 2, '#111', 1, 2); px(5, 2, '#111', 1, 2);
      px(2, 6, '#3a0d0d'); px(5, 6, '#3a0d0d');
      return;
    }
    px(1, 2, '#111', 2, 2); px(5, 2, '#111', 2, 2);
    px(1, 2, '#fff'); px(5, 2, '#fff');
    px(3, 4, kind === 'pig' ? '#e57373' : kind === 'bunny' || kind === 'cat' ? '#ff8fab' : '#222', 2, 1);
    px(3, 6, '#5d2a2a', 2, 1);
    px(0, 5, 'rgba(255,120,150,0.5)'); px(7, 5, 'rgba(255,120,150,0.5)');
  });
}

// A small blocky pet. Its front faces -z, like the characters.
export function buildPet(kind, color) {
  const group = new THREE.Group();
  const body = new THREE.Group(); // bobs up and down while hopping
  group.add(body);
  const m = material(color);
  const dark = material(shadeHex(color, 0.7));
  const light = material(shadeHex(color, 1.25));
  const pet = { group, body, kind, legs: [], wings: [] };

  const sizes = {
    dog: { w: 0.3, h: 0.26, d: 0.5, head: 0.3, leg: 0.2 },
    cat: { w: 0.24, h: 0.22, d: 0.44, head: 0.26, leg: 0.18 },
    bunny: { w: 0.28, h: 0.26, d: 0.34, head: 0.26, leg: 0.1 },
    pig: { w: 0.36, h: 0.3, d: 0.5, head: 0.3, leg: 0.14 },
    dragon: { w: 0.3, h: 0.28, d: 0.5, head: 0.3, leg: 0.16 },
  }[kind];
  const by = sizes.leg + sizes.h / 2;
  body.add(box(sizes.w, sizes.h, sizes.d, m, 0, by, 0));

  // Head with a face on the front.
  const faceMat = material(petFace(kind, color));
  const head = new THREE.Group();
  head.position.set(0, by + sizes.h * 0.45, -sizes.d / 2 - sizes.head * 0.3);
  head.add(box(sizes.head, sizes.head, sizes.head, [m, m, m, m, m, faceMat]));
  body.add(head);
  pet.head = head;

  for (const x of [-1, 1])
    for (const z of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(x * (sizes.w / 2 - 0.05), sizes.leg, z * (sizes.d / 2 - 0.07));
      pivot.add(box(0.08, sizes.leg, 0.08, dark, 0, -sizes.leg / 2, 0));
      body.add(pivot);
      pet.legs.push(pivot);
    }

  const tail = new THREE.Group();
  tail.position.set(0, by + sizes.h * 0.2, sizes.d / 2);
  body.add(tail);
  pet.tail = tail;
  const hs = sizes.head / 2;
  switch (kind) {
    case 'dog':
      tail.add(box(0.06, 0.06, 0.24, m, 0, 0.06, 0.1)).rotation.x = 0.6;
      for (const x of [-1, 1]) head.add(box(0.07, 0.16, 0.12, dark, x * (hs + 0.03), 0.02, 0));
      head.add(box(0.14, 0.1, 0.1, light, 0, -0.07, -hs - 0.04));
      break;
    case 'cat':
      tail.add(box(0.05, 0.3, 0.05, m, 0, 0.15, 0.02));
      for (const x of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.11, 4), m);
        ear.position.set(x * 0.08, hs + 0.04, 0);
        ear.rotation.y = Math.PI / 4;
        head.add(ear);
      }
      break;
    case 'bunny':
      tail.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), material('#ffffff')));
      for (const x of [-1, 1]) head.add(box(0.06, 0.26, 0.04, m, x * 0.07, hs + 0.12, 0.02));
      break;
    case 'pig':
      head.add(box(0.14, 0.1, 0.06, material(shadeHex(color, 0.85)), 0, -0.04, -hs - 0.03));
      tail.add(box(0.04, 0.04, 0.1, m, 0, 0.04, 0.04)).rotation.x = -0.8;
      for (const x of [-1, 1]) head.add(box(0.07, 0.06, 0.04, dark, x * 0.09, hs + 0.02, 0));
      break;
    case 'dragon': {
      tail.add(box(0.1, 0.08, 0.34, m, 0, 0, 0.16));
      for (let i = 0; i < 3; i++) body.add(box(0.05, 0.08, 0.06, material('#ffd84a'), 0, by + sizes.h / 2 + 0.04, -0.12 + i * 0.12));
      for (const x of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 6), material('#fff3c4'));
        horn.position.set(x * 0.08, hs + 0.05, 0.03);
        head.add(horn);
        const pivot = new THREE.Group();
        pivot.position.set(x * sizes.w / 2, by + sizes.h / 2, 0);
        const wing = box(0.36, 0.03, 0.26, material(shadeHex(color, 1.3), { side: THREE.DoubleSide }), x * 0.18, 0, 0);
        pivot.add(wing);
        body.add(pivot);
        pet.wings.push(pivot);
      }
      break;
    }
  }
  group.traverse(o => o.isMesh && (o.castShadow = true));
  pet.dispose = () => group.traverse(o => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const mat of [].concat(o.material)) {
      mat.map?.dispose();
      mat.dispose();
    }
  });
  return pet;
}

// moving: 0..1, time in seconds
export function animatePet(pet, moving, time) {
  const hop = pet.kind === 'bunny' ? 14 : 12;
  const swing = Math.sin(time * hop) * 0.7 * moving;
  pet.legs.forEach((l, i) => (l.rotation.x = i % 3 === 0 ? swing : -swing));
  pet.body.position.y = pet.kind === 'bunny' ? Math.abs(Math.sin(time * 7)) * 0.18 * moving : Math.abs(Math.sin(time * hop)) * 0.03 * moving;
  pet.tail.rotation.y = Math.sin(time * (pet.kind === 'dog' ? 14 : 3)) * (pet.kind === 'dog' ? 0.6 : 0.3);
  pet.head.rotation.x = Math.sin(time * 2) * 0.08;
  if (pet.kind === 'dragon') {
    // Dragons fly beside you.
    pet.body.position.y = 0.9 + Math.sin(time * 3) * 0.12;
    pet.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * Math.sin(time * 10) * 0.6));
  }
}
