// Residents' quests on your screen (the server keeps track of them: shared/quests.js). Hardly any
// words: a card in the corner with who it's for and what to do (pictures), an arrow pointing the
// way, and markers floating over people's heads (and over places), visible through walls:
//   💬 over a resident who has a job for you, 📦 / 🎁 / 📍 over wherever you're going next.
import * as THREE from 'three';

const $ = id => document.getElementById(id);

function emojiSprite(text, size = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(48, 44, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(36, 74);
  ctx.lineTo(60, 74);
  ctx.lineTo(48, 92);
  ctx.fill();
  ctx.font = '46px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 48, 46);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false }));
  s.scale.setScalar(size);
  s.renderOrder = 10;
  return s;
}

export class QuestHud {
  constructor(scene) {
    this.scene = scene;
    this.info = { quest: null, available: [] };
    this.markers = new Map(); // what -> sprite
  }

  set(info) {
    this.info = info;
    const q = info.quest, card = $('quest-card');
    card.classList.toggle('hidden', !q);
    if (!q) return;
    // Who it's for, and what to do: "📦 → 👵 Grandma Rose", "🎁 🌻 Sunflower → 👴", "📍 the Toy Box".
    let text;
    if (q.type === 'deliver') text = `📦 → ${q.toEmoji} ${q.toName}`;
    else if (q.type === 'fetch') text = `🎁 ${q.itemName} → ${q.fromEmoji} ${q.fromName}`;
    else text = q.visited ? `📍 ✓ → ${q.fromEmoji} ${q.fromName}` : `📍 ${q.placeName}`;
    card.querySelector('.quest-what').textContent = text;
    card.querySelector('.quest-pay').textContent = `🪙 ${q.reward}`;
    card.title = q.type === 'fetch' ? `Hold a ${q.itemName} and talk to ${q.fromName}` : '';
  }

  // Where the quest takes you next: a person (npc id) or a place.
  goal() {
    const q = this.info.quest;
    if (!q) return null;
    if (q.type === 'deliver') return { npc: q.to, icon: '📦' };
    if (q.type === 'fetch') return { npc: q.from, icon: '🎁' };
    return q.visited ? { npc: q.from, icon: '💬' } : { place: q.place, icon: '📍' };
  }

  marker(key, text, size) {
    let m = this.markers.get(key);
    if (!m) {
      m = emojiSprite(text, size);
      this.markers.set(key, m);
      this.scene.add(m);
    }
    m.visible = true;
    return m;
  }

  update(time, player, camera, npcs) {
    for (const m of this.markers.values()) m.visible = false;
    const bob = Math.sin(time * 3) * 0.12;
    // Residents with a job for you.
    for (const id of this.info.available || []) {
      const a = npcs.get(id);
      if (a) this.marker(`ask:${id}`, '💬', 0.9).position.set(a.pos.x, a.pos.y + 2.75 + bob, a.pos.z);
    }
    const g = this.goal();
    let target = null;
    if (g?.npc !== undefined) {
      const a = npcs.get(g.npc);
      if (a) {
        target = a.pos;
        this.marker(`goal:${g.icon}`, g.icon, 1.2).position.set(a.pos.x, a.pos.y + 2.9 + bob, a.pos.z);
      }
    } else if (g?.place) {
      target = new THREE.Vector3(g.place[0], 0, g.place[1]);
      this.marker('goal:place', '📍', 3).position.set(g.place[0], 9 + bob * 3, g.place[1]);
    }
    // The arrow on the card points the way (relative to where you're looking), and how far.
    const arrow = $('quest-arrow');
    if (!target) {
      arrow.style.visibility = 'hidden';
      return;
    }
    const dx = target.x - player.pos.x, dz = target.z - player.pos.z, d = Math.hypot(dx, dz);
    const view = new THREE.Vector3();
    camera.getWorldDirection(view);
    const angle = Math.atan2(dx, -dz) - Math.atan2(view.x, -view.z);
    arrow.style.visibility = d < 4 ? 'hidden' : 'visible';
    arrow.style.transform = `rotate(${angle}rad)`;
    $('quest-far').textContent = d < 4 ? '' : `${Math.round(d)}`;
  }
}
