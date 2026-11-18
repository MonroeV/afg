// Other players: a customizable character with a floating name tag.
import * as THREE from 'three';
import { buildCharacter, animateCharacter, buildPet, animatePet, setPetHat } from './character.js';
import { TRICK_TIME } from './shared/tricks.js';
import { SEAT_SCALE } from './cars.js';
import { PET_HAPPY, PET_CARRYING, PET_BOW, PET_POUNCE } from './pets.js';
import { PetMover } from './petmove.js';
import { PlayClock, Track } from './smooth.js';
import { balloonModel } from './contraptions.js';

// Extra bits in a pet's action number (sent to other players): jumping or falling, climbing.
const PET_AIR = 8, PET_CLIMB = 16, PET_TRICK = 5; // (and the trick it's doing, in bits 5-7)
const PET_RANGE = 30; // farther from you than this (in blocks), and your pet pops back in beside you

function nameTag(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 30px system-ui, sans-serif';
  const w = Math.min(248, ctx.measureText(name).width + 34);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect((256 - w) / 2, 10, w, 44, 12);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect((256 - w) / 2 + 10, 27, 10, 10);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 128 + 7, 33, 220);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// What a player is doing, sent with their position: bits of `flags`. The top 24 bits are
// the color of the balloon they're holding.
export const FLAG = { sleeping: 1, sitting: 2, crouching: 4, balloon: 8, jet: 16, trail: 32, pizza: 64, hotair: 128, sled: 256, parachute: 512 }; // (sled and parachute: only without a balloon, whose color takes those bits)

// A speech bubble: rounded and white, with up to two lines of text and a little tail.
function speechBubble(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 30px system-ui, sans-serif';
  // Wrap onto two lines if it's long.
  const words = text.split(' '), lines = [''];
  for (const w of words) {
    const tryLine = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${w}` : w;
    if (ctx.measureText(tryLine).width > 460 && lines[lines.length - 1] && lines.length < 2) lines.push(w);
    else lines[lines.length - 1] = tryLine;
  }
  const width = Math.min(500, Math.max(...lines.map(l => ctx.measureText(l).width)) + 40), height = lines.length * 38 + 26;
  const x0 = (512 - width) / 2, y0 = 120 - height;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x0, y0, width, height, 22);
  ctx.moveTo(240, 120); ctx.lineTo(256, 146); ctx.lineTo(272, 120);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#222';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, 256, y0 + 32 + i * 38, 480));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(2.4, 0.75, 1);
  sprite.renderOrder = 11;
  return sprite;
}

// A character in the world that can walk, dance, wave and sit in cars.
const SLED_DROP = 0.5; // (how much lower you sit on a sled than you stand)

export class Avatar {
  constructor(scene, info, { tag = true } = {}) {
    this.scene = scene;
    this.id = info.id;
    this.name = info.name;
    this.root = new THREE.Group();
    this.pos = new THREE.Vector3().fromArray(info.pos || [0, 0, 0]);
    this.target = this.pos.clone();
    this.yaw = this.targetYaw = info.rot?.[0] || 0;
    this.pitch = this.targetPitch = info.rot?.[1] || 0;
    // Their movements, replayed smoothly a moment behind (see smooth.js).
    this.clock = new PlayClock();
    this.track = new Track(5, { angles: [3], jump: 10 });
    this.petTrack = new Track(4, { angles: [3], jump: 14 });
    this.walk = 0;
    this.speed = 0;
    this.dance = 0;
    this.wave = 0;
    this.swing = 1;
    this.seat = null; // { position, yaw } while sitting in a car
    this.sitting = false; // on a chair or couch
    this.crouching = false;
    this.balloon = null; // the color of the balloon they're holding, if they are
    if (tag) {
      this.tag = nameTag(info.name, info.look?.shirtColor || '#fff');
      this.tag.position.y = 2.35;
      this.root.add(this.tag);
    }
    this.setLook(info.look);
    this.root.position.copy(this.pos);
    scene.add(this.root);
  }

  // In a game on the town square: 'it' (tag: a glowing red ring round their feet and 👉 over
  // their head), 'seeker' (hide-and-seek: 👀), or null.
  setGameMark(mark) {
    if (mark === (this.gameMark?.kind ?? null)) return;
    if (this.gameMark) {
      this.root.remove(this.gameMark.group);
      this.gameMark.group.traverse(o => {
        o.geometry?.dispose();
        o.material?.map?.dispose();
        o.material?.dispose();
      });
      this.gameMark = null;
    }
    if (!mark) return;
    const group = new THREE.Group();
    if (mark === 'it') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.06, 8, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.9 }));
      ring.position.y = 0.06;
      group.add(ring);
    }
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = '50px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mark === 'it' ? '👉' : '👀', 32, 36);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    icon.scale.set(0.6, 0.6, 1);
    icon.position.y = 2.95;
    icon.renderOrder = 11;
    group.add(icon);
    this.root.add(group);
    this.gameMark = { kind: mark, group, icon };
  }

  get color() {
    return this.character.look.shirtColor;
  }

  setLook(look) {
    if (this.character) {
      this.root.remove(this.character.group);
      this.character.dispose();
    }
    this.character = buildCharacter(look);
    this.root.add(this.character.group);
    // The pet lives in the world (not attached to us) so it can follow along behind.
    const { pet, petColor } = this.character.look;
    if (this.pet && (this.pet.kind !== pet || this.petColor !== petColor)) {
      this.scene.remove(this.pet.group);
      this.pet.dispose();
      this.pet = null;
    }
    if (!this.pet && pet !== 'none') {
      this.pet = buildPet(pet, petColor);
      this.petColor = petColor;
      this.pet.pos = this.pos.clone();
      this.pet.target = this.pos.clone();
      this.pet.yaw = this.pet.targetYaw = this.yaw;
      this.pet.action = 0;
      // A ball the pet can carry in its mouth.
      this.pet.ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe53935 }));
      this.pet.ball.position.set(0, -0.08, -0.2);
      this.pet.ball.visible = false;
      this.pet.head.add(this.pet.ball);
      this.scene.add(this.pet.group);
    }
    if (this.pet) setPetHat(this.pet, this.character.look.petHat || 'none');
  }

  // Our pet does a trick (1-6, from shared/tricks.js): ok, it gets it right; otherwise it tries
  // (and doesn't quite manage it yet).
  doTrick(id, ok) {
    if (this.pet) this.pet.trick = { id, t: 0, ok };
  }

  // A ball this (other) player threw, as their game reports it.
  updateRemoteBall(dt) {
    const b = this.remoteBall;
    if (!Array.isArray(b)) {
      if (this.ballMesh) this.ballMesh.visible = false;
      return;
    }
    if (!this.ballMesh) {
      this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshStandardMaterial({ color: 0xe53935, emissive: 0x3a0000, roughness: 0.4 }));
      this.ballMesh.castShadow = true;
      this.scene.add(this.ballMesh);
      this.ballMesh.position.fromArray(b);
    }
    this.ballMesh.visible = true;
    this.ballMesh.position.lerp(new THREE.Vector3().fromArray(b), Math.min(1, dt * 12));
  }

  // Where our pet is, for sending to other players: [x, y, z, yaw, action].
  petState() {
    const p = this.pet;
    if (!p) return 0;
    const r = v => Math.round(v * 100) / 100;
    return [r(p.pos.x), r(p.pos.y), r(p.pos.z), r(p.yaw), p.action | (p.air ? PET_AIR : 0) | (p.climb ? PET_CLIMB : 0) | ((p.trick?.id || 0) << PET_TRICK)];
  }

  // Another player's pet, as they sent it (ts: when, on their clock).
  setPetState(state, ts = null) {
    if (!this.pet || !Array.isArray(state)) return;
    this.pet.target.set(state[0], state[1], state[2]);
    this.pet.targetYaw = state[3];
    if (ts !== null) this.petTrack.push(ts, state, state[4]);
    else this.setPetAction(state[4]);
  }

  setPetAction(bits) {
    this.pet.action = bits & 7;
    this.pet.air = !!(bits & PET_AIR);
    this.pet.climb = !!(bits & PET_CLIMB);
    const trick = (bits >> PET_TRICK) & 7;
    if (trick !== (this.pet.trick?.id || 0)) this.pet.trick = trick ? { id: trick, t: 0, ok: true } : null;
  }

  setName(name) {
    if (!this.tag || name === this.name) return;
    this.name = name;
    this.root.remove(this.tag);
    this.tag.material.map.dispose();
    this.tag = nameTag(name, this.character.look.shirtColor);
    this.tag.position.y = 2.35;
    this.root.add(this.tag);
  }

  updatePet(dt, time) {
    const pet = this.pet;
    if (!pet) return;
    pet.group.visible = !this.seat && !this.petAboard;
    if (this.seat || this.petAboard) {
      pet.pos.copy(this.pos);
      pet.mover?.place(this.pos);
      this.petRode = true; // (it comes along for the ride)
      return;
    }
    let moving = 0;
    if (pet.trick) {
      pet.trick.t += dt;
      if (this.brain && pet.trick.t > TRICK_TIME) pet.trick = null; // (others' pets: until their owner's game says it's done)
    }
    if (this.brain && pet.trick) {
      // Doing a trick: it stays put, facing us.
      const m = pet.mover;
      if (m) {
        let dy = Math.atan2(-(this.pos.x - m.pos.x), -(this.pos.z - m.pos.z)) - m.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        m.yaw += dy * Math.min(1, dt * 6);
        pet.yaw = m.yaw;
      }
      pet.action = 0;
    } else if (this.brain) {
      // Our own pet thinks for itself, and moves for real: it finds a way round walls, hops
      // up steps, jumps down (not too far), climbs ladders and bumps into cars.
      if (!pet.mover) {
        pet.mover = new PetMover(this.petNav, pet.kind === 'dragon');
        pet.mover.place(pet.pos);
        pet.mover.yaw = pet.yaw;
      }
      const m = pet.mover;
      // It pops back in beside us when it can't get to us otherwise: just out of a vehicle
      // (it rode along with us), more than 30 blocks away (we flew, or went through a
      // teleporter), or stuck (in a block, underground, or shut in somewhere with no way out).
      const far = Math.hypot(m.pos.x - this.pos.x, m.pos.z - this.pos.z) > PET_RANGE;
      const stuck = this.petNav.inSolid(m.pos) || m.trapped || m.nowhere;
      this.petStuck = stuck ? (this.petStuck || 0) + dt : 0;
      this.petRespawnWait = Math.max(0, (this.petRespawnWait || 0) - dt);
      if ((this.petRode || far || this.petStuck > 1) && this.petRespawnWait <= 0) {
        const why = this.petRode ? 'ride' : far ? 'far' : 'stuck';
        this.petRode = false;
        this.petStuck = 0;
        this.petRespawnWait = 1.5;
        const spot = this.petNav.spotNear(this.pos, (this.petBoxes || (() => []))());
        const landing = !spot && this.petNav.landing(this.pos);
        const to = spot || (landing ? new THREE.Vector3(landing[0] + 0.5, landing[1], landing[2] + 0.5) : this.pos.clone());
        const from = m.pos.clone();
        m.place(to);
        m.onGround = true;
        pet.pos.copy(to);
        if (why !== 'ride') this.onPetEvent?.('respawn', from);
      }
      // (Other players' pets nearby, to play with.)
      const plan = this.brain.think(dt, { pos: this.pos, yaw: this.yaw, speed: this.speed }, m.pos, this.ball, m.reachable,
        this.petFriends?.() || [], this.playClock?.() ?? performance.now() / 1000, this.petId?.() ?? 0);
      pet.action = plan.action;
      if (plan.play) this.onPetEvent?.('play', plan.pal);
      if (plan.tagged) this.onPetEvent?.('tag', plan.pal);
      if (plan.dropped) this.onPetEvent?.('dropped');
      if (plan.giveUp) this.onPetEvent?.('giveup', plan.giveUp);
      if (plan.whine) this.onPetEvent?.('whine');
      const dist = plan.goal ? Math.hypot(plan.goal.x - m.pos.x, plan.goal.z - m.pos.z) : 0;
      moving = m.update(dt, plan.goal, {
        speed: plan.speed ?? Math.max(3, Math.min(7.5, dist * 2.5)),
        turnRate: plan.turnRate || 0,
        fallback: this.pos,
        boxes: this.petBoxes || (() => []),
        level: !!plan.level,
      });
      const arrived = !plan.goal || (!m.path.length && dist < 0.5);
      if (plan.look && (!plan.goal || (!m.reachable && !m.path.length))) {
        // Watching something (the ball flying off, or us up where it can't get to).
        let dy = Math.atan2(-(plan.look.x - m.pos.x), -(plan.look.z - m.pos.z)) - m.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        m.yaw += dy * Math.min(1, dt * 8);
      } else if (arrived && !plan.sniff && moving < 0.1) {
        let dy = this.yaw - m.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        m.yaw += dy * Math.min(1, dt * 3);
      }
      pet.pos.copy(m.pos);
      pet.yaw = m.yaw;
      pet.air = !m.onGround && !m.holding && pet.kind !== 'dragon';
      pet.climb = m.climbing;
      pet.vy = m.vel.y;
      pet.landed = m.landed;
      pet.windup = m.windup > 0 ? 1 - m.windup / 0.1 : 0;
      pet.sniff = plan.sniff;
    } else {
      // Someone else's pet: replay where their game says it was, in step with its owner.
      const before = pet.pos.clone();
      const s = this.petTrack.sample(this.clock.play);
      if (s) {
        pet.pos.set(s[0], s[1], s[2]);
        pet.yaw = s[3];
        this.setPetAction(this.petTrack.extra);
      } else {
        if (pet.pos.distanceTo(pet.target) > 14) pet.pos.copy(pet.target);
        pet.pos.lerp(pet.target, Math.min(1, dt * 10));
        let dy = pet.targetYaw - pet.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        pet.yaw += dy * Math.min(1, dt * 10);
      }
      moving = Math.min(1, Math.hypot(pet.pos.x - before.x, pet.pos.z - before.z) / Math.max(dt, 1e-3) / 3);
      pet.vy = (pet.pos.y - before.y) / Math.max(dt, 1e-3);
    }
    pet.group.position.copy(pet.pos);
    pet.group.rotation.y = pet.yaw;
    pet.ball.visible = pet.action === PET_CARRYING;
    animatePet(pet, moving, time);
    this.poseJump(pet, dt, time);
    if (pet.action === PET_HAPPY) {
      // Jump for joy and spin around.
      pet.body.position.y += Math.abs(Math.sin(time * 9)) * 0.35;
      pet.group.rotation.y = pet.yaw + time * 6;
    } else if (pet.action === PET_BOW || pet.action === PET_POUNCE) {
      // Playing: a play bow (front end down, bottom and tail up), or bouncy little pounces,
      // with the tail wagging like mad.
      pet.tail.rotation.y = Math.sin(time * 22) * 0.75;
      if (pet.action === PET_POUNCE) pet.body.position.y += Math.abs(Math.sin(time * 8)) * 0.32;
      else pet.head.rotation.x = 0.25 + Math.sin(time * 6) * 0.1;
    } else if (pet.sniff) {
      pet.head.rotation.x = -0.5 + Math.sin(time * 12) * 0.08;
    }
    pet.body.rotation.z = 0;
    pet.body.position.x = 0;
    pet.legs.forEach(l => (l.rotation.z = 0));
    if (pet.trick) this.poseTrick(pet, pet.trick, time);
  }

  // The tricks. t: seconds into it. A try that doesn't work out goes half way, then flops.
  poseTrick(pet, { id, t, ok }, time) {
    const k = Math.min(1, t / 0.35) * Math.min(1, Math.max(0, (TRICK_TIME - t) / 0.35)); // (eases in and out)
    const amt = ok ? 1 : t < 1.1 ? 0.55 : 0.15; // (a try: half way, then it gives up)
    const w = k * amt;
    const lift = pet.bodyY || 0.3;
    const roll = a => {
      // Turn the body round its middle (not its feet).
      pet.body.rotation.z = a;
      pet.body.position.x = lift * Math.sin(a);
      pet.body.position.y += lift * (1 - Math.cos(a)) - Math.abs(Math.sin(a)) * (pet.size?.w || 0.3) * 0.5;
    };
    switch (id) {
      case 1: // sit: front up, bottom down, a wag
        pet.body.rotation.x = 0.55 * w;
        pet.body.position.y -= 0.06 * w;
        pet.legs.forEach((l, i) => (l.rotation.x = i % 2 ? -1.2 * w : 0.5 * w));
        pet.tail.rotation.y = Math.sin(time * 16) * 0.6;
        break;
      case 2: // spin round twice
        pet.group.rotation.y = pet.yaw + (ok ? 1 : 0.4) * Math.min(1, t / (TRICK_TIME - 0.4)) * Math.PI * 4;
        break;
      case 3: // jump: two big hops
        pet.body.position.y += Math.abs(Math.sin(Math.min(t, TRICK_TIME - 0.3) * Math.PI / 1.1)) * 0.75 * w;
        pet.legs.forEach((l, i) => (l.rotation.x = (i % 2 ? -0.7 : 0.7) * w));
        break;
      case 4: // roll over
        roll(Math.min(1, t / (TRICK_TIME - 0.5)) * Math.PI * 2 * (ok ? 1 : 0.3));
        break;
      case 5: // play dead: flop over, paws up, then pop back up
        roll((Math.PI / 2) * w);
        pet.legs.forEach(l => (l.rotation.z = 0.4 * w));
        pet.head.rotation.x = 0.3 * w;
        break;
      case 6: // dance: up on its back legs, swaying, front paws waving
        pet.body.rotation.x = 1.1 * w;
        pet.body.position.y += 0.08 * w;
        pet.body.rotation.z = Math.sin(time * 9) * 0.35 * w;
        pet.legs.forEach((l, i) => (l.rotation.x = i % 2 ? -1.1 * w : 0.6 * w + Math.sin(time * 14 + i) * 0.7 * w));
        pet.tail.rotation.y = Math.sin(time * 22) * 0.8;
        break;
    }
  }

  // Leaping, landing and climbing, blended in smoothly over the walk.
  poseJump(pet, dt, time) {
    if (pet.kind === 'dragon') return;
    const k = Math.min(1, dt * 14);
    pet.airK = (pet.airK || 0) + ((pet.air ? 1 : 0) - (pet.airK || 0)) * k;
    pet.climbK = (pet.climbK || 0) + ((pet.climb ? 1 : 0) - (pet.climbK || 0)) * k;
    // Nose up going up, nose down coming down; nose right up on a ladder.
    const lean = pet.climb ? 1.05 : pet.air ? Math.max(-0.5, Math.min(0.5, (pet.vy || 0) * 0.07)) : pet.action === PET_BOW ? -0.42 : 0;
    pet.pitch = (pet.pitch || 0) + (lean - (pet.pitch || 0)) * Math.min(1, dt * 10);
    // Tilt around the middle of the body, not the feet.
    const c = 0.3;
    pet.body.rotation.x = pet.pitch;
    pet.body.position.y += c - c * Math.cos(pet.pitch) + (pet.climb ? 0.08 : 0);
    pet.body.position.z = -c * Math.sin(pet.pitch) * 0.5;
    pet.legs.forEach((l, i) => {
      const front = i % 2 === 0;
      // In the air: front legs reach forward, back legs push out behind (a proper leap).
      const leap = front ? 0.85 : -0.85;
      // On a ladder: paw over paw.
      const paw = Math.sin(time * 12 + (front ? 0 : Math.PI) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 + (front ? 0.4 : -0.2);
      l.rotation.x = l.rotation.x * (1 - pet.airK - pet.climbK * (1 - pet.airK)) + leap * pet.airK + paw * pet.climbK * (1 - pet.airK);
    });
    // A little crouch before jumping, and a squash when it lands.
    const sq = Math.max(pet.landed || 0, (pet.windup || 0) * 0.8);
    pet.body.scale.set(1 + 0.12 * sq, 1 - 0.22 * sq, 1 + 0.12 * sq);
  }

  // Where they are now (ts: when, on their clock; flags: what they're doing then).
  setState(x, y, z, yaw, pitch, ts = null, flags = null) {
    this.target.set(x, y, z);
    this.targetYaw = yaw;
    this.targetPitch = pitch;
    if (ts === null) return;
    this.clock.heard(ts);
    this.track.push(ts, [x, y, z, yaw, pitch], flags);
  }

  // Asleep, sitting, crouching, holding a balloon, jetpack, rainbow trail.
  applyFlags(flags) {
    this.lying = !!(flags & FLAG.sleeping);
    this.sitting = !!(flags & FLAG.sitting);
    this.crouching = !!(flags & FLAG.crouching);
    this.balloon = flags & FLAG.balloon ? `#${((flags >>> 8) & 0xffffff).toString(16).padStart(6, '0')}` : null;
    this.jet = !!(flags & FLAG.jet);
    this.trail = !!(flags & FLAG.trail);
    this.pizza = !!(flags & FLAG.pizza);
    this.hotair = !!(flags & FLAG.hotair);
    this.parachute = !(flags & FLAG.balloon) && !!(flags & FLAG.parachute);
    this.sledding = !(flags & FLAG.balloon) && !!(flags & FLAG.sled);
  }

  emote(kind) {
    if (kind === 'dance') this.dance = 4;
    if (kind === 'wave') this.wave = 2;
  }

  update(dt, time) {
    if (this.gameMark) this.gameMark.icon.position.y = 2.95 + Math.sin(time * 5) * 0.08; // (a little bob)
    const k = 1 - Math.exp(-12 * dt);
    const before = this.pos.clone();
    const s = this.snap ? null : this.track.sample(this.clock.tick(dt));
    if (s) {
      // Replay what they did, at the pace they did it.
      this.pitch = s[4];
      if (this.track.extra !== null) this.applyFlags(this.track.extra);
    } else this.pitch += (this.targetPitch - this.pitch) * k;
    if (this.seat) {
      this.pos.copy(this.seat.position);
      this.yaw = this.seat.yaw;
    } else if (this.snap) {
      // Our own body follows the camera exactly.
      this.pos.copy(this.target);
      this.yaw = this.targetYaw;
    } else if (s) {
      this.pos.set(s[0], s[1], s[2]);
      this.yaw = s[3];
    } else {
      // Glide to where they are, but jump straight there after a teleport.
      if (this.pos.distanceToSquared(this.target) > 100) this.pos.copy(this.target);
      this.pos.lerp(this.target, k);
      let dy = this.targetYaw - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * k;
    }

    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / Math.max(dt, 1e-4);
    this.speed += (Math.min(moved / 6, 1) - this.speed) * Math.min(1, dt * 10);
    this.walk += dt * Math.min(moved, 10) * 1.6;
    this.dance = Math.max(0, this.dance - dt);
    this.wave = Math.max(0, this.wave - dt);
    if (this.speed > 0.3 && !this.seat) this.dance = 0;

    this.root.position.copy(this.pos);
    if (this.sledding) this.root.position.y -= SLED_DROP; // (sitting down low, on the sled)
    this.updateSled();
    this.updateParachute(time);
    this.root.rotation.order = 'YXZ';
    this.root.rotation.y = this.yaw;
    // Lying back into bed (or sitting up out of it), and sitting down, happen smoothly.
    this.lieK = (this.lieK ?? 0) + ((this.lying ? 1 : 0) - (this.lieK ?? 0)) * Math.min(1, dt * 3.2);
    this.sitK = (this.sitK ?? 0) + ((this.sitting || this.sledding ? 1 : 0) - (this.sitK ?? 0)) * Math.min(1, dt * 7);
    this.root.rotation.x = this.lieK * Math.PI / 2; // asleep in bed, on our back
    this.root.scale.setScalar(this.seat ? SEAT_SCALE : 1);
    if (this.tag) {
      this.tag.visible = this.lieK < 0.5;
      this.tag.position.y = this.crouching ? 2.05 : 2.35;
    }
    this.updateRemoteBall(dt);
    this.updatePizzaBox();
    if (this.hotair && !this.hotairModel) {
      this.hotairModel = balloonModel(this.id, true);
      this.root.add(this.hotairModel);
    }
    if (this.hotairModel) this.hotairModel.visible = !!this.hotair && !this.snap;
    this.updateBalloon(time);
    if (this.bubble) {
      this.bubbleT -= dt;
      this.bubble.material.opacity = Math.min(1, this.bubbleT * 2);
      if (this.bubbleT <= 0) this.unsay();
    }
    const sitting = !!this.seat || this.sitting || this.sledding;
    // Climbing into bed (or out) your knees bend as you sit on the edge, then straighten as you
    // lie back (or stand up).
    // (Asleep in a camper van: lying in its bed, not sitting.)
    const sit = this.seat && !this.lying ? 1 : Math.max(this.sitK, Math.sin(Math.PI * Math.min(1, this.lieK)) * 0.9);
    animateCharacter(this.character, {
      walk: this.walk, speed: sitting || this.lying ? 0 : this.speed, pitch: this.lieK > 0.5 ? 0 : this.pitch, time,
      dance: this.dance, wave: this.wave, swing: this.swing, sit,
      flying: this.flying, crouch: this.crouching && !sitting,
    });
    if (this.holdMic) this.updateMic();
    if (this.reading || this.book) this.updateBook();
    if (this.fishing || this.rod) this.updateRod(time);
    this.updatePet(dt, time);
  }

  // A fishing rod held out over the water (sitting on a fishing stool). `fishing` is set by the
  // game each frame.
  updateRod(time) {
    const arm = this.character.armR;
    if (!arm) return;
    if (!this.rod) {
      const rod = new THREE.Group();
      rod.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.024, 1.5, 6).translate(0, 0.75, 0), new THREE.MeshStandardMaterial({ color: 0x2f3237, roughness: 0.5 })));
      const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: 0.6, roughness: 0.4 }));
      reel.position.set(0.05, 0.12, 0);
      rod.add(reel);
      this.rodTip = new THREE.Object3D();
      this.rodTip.position.y = 1.5;
      rod.add(this.rodTip);
      rod.position.set(0, -0.6, -0.02);
      this.rod = rod;
    }
    this.rod.visible = !!this.fishing;
    if (!this.fishing) return;
    // The arm held out in front, the rod pointing up and out over the water (bobbing a little).
    arm.rotation.set(1.05 + Math.sin(time * 1.3) * 0.03, 0, 0.08);
    this.rod.rotation.x = -2.0;
    if (this.rod.parent !== arm) arm.add(this.rod);
  }

  // A reporter's microphone, held up in the right hand (pointing up, toward her chin).
  updateMic() {
    const arm = this.character.armR;
    if (!arm) return;
    const lift = this.wave > 0 ? arm.rotation.x : 1.5;
    arm.rotation.set(lift, 0, 0.12);
    if (!this.mic) {
      const mic = new THREE.Group();
      mic.add(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.5 })));
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshStandardMaterial({ color: 0x5f666e, roughness: 0.7 }));
      head.position.y = 0.13;
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.05, 0.075), new THREE.MeshStandardMaterial({ color: 0xc62828 }));
      flag.position.y = 0.05;
      mic.add(head, flag);
      mic.position.set(0, -0.6, -0.02);
      mic.rotation.x = -1.5; // (so it points up while the arm is held out in front)
      this.mic = mic;
    }
    if (this.mic.parent !== arm) arm.add(this.mic);
  }

  // A book held open in both hands, in front of them (someone at home, reading).
  updateBook() {
    if (!this.book) {
      const book = new THREE.Group();
      const cover = new THREE.MeshStandardMaterial({ color: [0xc62828, 0x1565c0, 0x2e7d32, 0x6a1b9a][Math.abs(this.id) % 4], roughness: 0.7 });
      const pages = new THREE.MeshStandardMaterial({ color: 0xf5f0e1, roughness: 0.9 });
      for (const s of [-1, 1]) {
        // Each half: a cover with its pages on top, opening up like a V.
        const half = new THREE.Group();
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.012, 0.24), cover);
        c.position.x = s * 0.085;
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.02, 0.225), pages);
        p.position.set(s * 0.085, 0.014, 0);
        half.add(c, p);
        half.rotation.z = -s * 0.28;
        book.add(half);
      }
      book.position.set(0, 1.22, -0.34);
      book.rotation.x = 1.15; // (tipped up toward their face)
      this.root.add(book);
      this.book = book;
    }
    this.book.visible = !!this.reading && this.lieK < 0.3;
    if (!this.book.visible) return;
    // Both arms out in front, holding it.
    const { armL, armR } = this.character;
    if (armL) armL.rotation.set(1.2, 0, 0.3);
    if (armR) armR.rotation.set(1.2, 0, -0.3);
  }

  // A parachute over them (jumped out of an airplane): a striped canopy on its lines, swaying.
  updateParachute(time) {
    if (!this.parachute && !this.chute) return;
    if (!this.chute) {
      const g = new THREE.Group();
      const colors = [0xe53935, 0xffffff, 0x1e88e5, 0xffeb3b, 0xe53935, 0xffffff, 0x1e88e5, 0xffeb3b];
      colors.forEach((c, i) => {
        const panel = new THREE.Mesh(new THREE.SphereGeometry(2.1, 6, 6, (i / 8) * Math.PI * 2, Math.PI / 4, 0, Math.PI * 0.32), new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, side: THREE.DoubleSide }));
        panel.scale.y = 0.55;
        g.add(panel);
      });
      const line = new THREE.MeshBasicMaterial({ color: 0x333333 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, top = new THREE.Vector3(Math.cos(a) * 1.75, 0.6, Math.sin(a) * 1.75), bottom = new THREE.Vector3(Math.cos(a) * 0.2, -2.6, Math.sin(a) * 0.2);
        const geo = new THREE.CylinderGeometry(0.012, 0.012, top.distanceTo(bottom), 3);
        geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bottom).normalize()));
        const m = new THREE.Mesh(geo, line);
        m.position.copy(top).add(bottom).multiplyScalar(0.5);
        g.add(m);
      }
      g.position.y = 4.4;
      g.traverse(o => o.isMesh && (o.castShadow = true));
      this.root.add(g);
      this.chute = g;
    }
    this.chute.visible = !!this.parachute;
    this.chute.rotation.z = Math.sin(time * 1.3) * 0.06;
    this.chute.rotation.x = Math.sin(time * 0.9 + 1) * 0.05;
  }

  // A red sled under them (sledding).
  updateSled() {
    if (!this.sledding && !this.sled) return;
    if (!this.sled) {
      const g = new THREE.Group();
      const red = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.5 });
      const metal = new THREE.MeshStandardMaterial({ color: 0x424242, roughness: 0.4, metalness: 0.6 });
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 1.15), red);
      seat.position.y = 0.16;
      g.add(seat);
      for (const x of [-0.22, 0.22]) {
        const runner = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 1.25), metal);
        runner.position.set(x, 0.03, 0);
        const curl = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 10, Math.PI), metal);
        curl.rotation.y = Math.PI / 2;
        curl.position.set(x, 0.15, -0.62);
        g.add(runner, curl);
        for (const z of [-0.35, 0.35]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), metal);
          leg.position.set(x, 0.09, z);
          g.add(leg);
        }
      }
      g.position.set(0, SLED_DROP - 0.02, -0.15);
      g.traverse(o => o.isMesh && (o.castShadow = true));
      this.root.add(g);
      this.sled = g;
    }
    this.sled.visible = !!this.sledding;
  }

  // A pizza box carried in front (out on a delivery).
  updatePizzaBox() {
    if (!this.pizza && !this.pizzaBox) return;
    if (!this.pizzaBox) {
      const box = new THREE.Group();
      box.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.5), new THREE.MeshStandardMaterial({ color: 0xe9d3a7, roughness: 0.8 })));
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.005, 0.3), new THREE.MeshStandardMaterial({ color: 0xe53935 }));
      top.position.y = 0.04;
      box.add(top);
      box.position.set(0, 1.0, -0.36);
      this.root.add(box);
      this.pizzaBox = box;
    }
    this.pizzaBox.visible = this.pizza && !this.seat && !this.lying;
  }

  // Says something (in a speech bubble over their head, for a few seconds).
  say(text, seconds = 4.5) {
    this.unsay();
    this.bubble = speechBubble(text);
    this.bubble.position.y = 2.95;
    this.bubbleT = seconds;
    this.root.add(this.bubble);
  }

  unsay() {
    if (!this.bubble) return;
    this.root.remove(this.bubble);
    this.bubble.material.map.dispose();
    this.bubble.material.dispose();
    this.bubble = null;
  }

  // A balloon on a string, held up in the right hand.
  updateBalloon(time) {
    if (!this.balloon) {
      if (this.balloonGroup) this.balloonGroup.visible = false;
      return;
    }
    if (!this.balloonGroup) {
      const g = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12).scale(1, 1.2, 1), new THREE.MeshStandardMaterial({ roughness: 0.25 }));
      ball.position.y = 1.7;
      ball.castShadow = true;
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.4, 4).translate(0, 0.7, 0), new THREE.MeshBasicMaterial({ color: 0xeeeeee }));
      g.add(ball, string);
      g.position.set(0.38, 1.05, -0.1);
      this.root.add(g);
      this.balloonGroup = g;
      this.balloonBall = ball;
    }
    this.balloonGroup.visible = true;
    this.balloonBall.material.color.set(this.balloon);
    this.balloonGroup.rotation.z = Math.sin(time * 1.3 + this.id) * 0.08;
    this.balloonGroup.rotation.x = Math.sin(time * 0.9 + this.id * 2) * 0.06 + this.speed * 0.25;
  }

  dispose() {
    this.unsay();
    this.scene.remove(this.root);
    this.character.dispose();
    if (this.pet) {
      this.scene.remove(this.pet.group);
      this.pet.dispose();
    }
    if (this.ballMesh) this.scene.remove(this.ballMesh);
    this.tag?.material.map.dispose();
  }
}

export class Avatars {
  constructor(scene) {
    this.scene = scene;
    this.list = new Map();
  }

  add(info) {
    this.remove(info.id);
    this.list.set(info.id, new Avatar(this.scene, info));
  }

  remove(id) {
    this.list.get(id)?.dispose();
    this.list.delete(id);
  }

  clear() {
    for (const id of [...this.list.keys()]) this.remove(id);
  }

  applyStates(list, myId) {
    for (const [id, x, y, z, yaw, pitch, pet, ball, flags, ts, drone] of list) {
      const a = this.list.get(id);
      if (id === myId || !a) continue;
      a.drone = Array.isArray(drone) ? drone : 0; // a Secret Agency drone they're flying
      const when = Number.isFinite(ts) ? ts : null;
      a.setState(x, y, z, yaw, pitch, when, flags);
      a.setPetState(pet, when);
      a.remoteBall = ball;
      if (when === null) a.applyFlags(flags);
    }
  }

  update(dt, time) {
    for (const a of this.list.values()) a.update(dt, time);
  }
}
