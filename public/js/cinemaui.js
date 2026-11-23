// The Starlight Cinema, as everyone sees it (see shared/cinema.js): the giant screen in the
// theater, showing the shows on the game's clock (previews, a title card, then the feature: the
// TV's own channels, drawn big: see tv.js), and the glowing marquee out front saying what's on.
import * as THREE from 'three';
import { CHANNELS } from './tv.js';
import { showAt } from './shared/cinema.js';
import { drawSitcom, SitcomSound } from './sitcom.js';

const SEE = 120; // (farther than this, it's not drawn)

export class CinemaUI {
  constructor({ scene, sounds }) {
    this.scene = scene;
    this.sitcomSound = sounds ? new SitcomSound(sounds) : null;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.place = null;
    this.timer = 0;
  }

  setPlace(place) {
    this.group.clear();
    this.place = place?.screen ? place : null;
    if (!this.place) return;
    const panel = (spec, w, h) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      // (bright, and not lit by the scene: it glows in the dark)
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(spec.w, spec.h), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
      mesh.position.set(spec.x, spec.y, spec.z);
      mesh.rotation.y = spec.face;
      this.group.add(mesh);
      return { canvas, ctx: canvas.getContext('2d'), texture };
    };
    this.screen = panel(this.place.screen, 640, 252);
    this.marquee = panel(this.place.marquee, 512, 184);
    this.lastMarquee = null;
  }

  // Every frame: redraw the screen (a dozen times a second, when you're near), and the marquee
  // when what's on changes.
  update(dt, t, eye) {
    if (!this.place) return;
    const near = Math.hypot(eye.x - this.place.x, eye.z - this.place.z) < SEE;
    this.group.visible = near;
    const show = showAt(t);
    // The Blocksons' sound: for whoever's in the theater.
    const h = this.place.hall, inside = !!h && eye.x >= h[0] && eye.x <= h[2] && eye.z >= h[1] && eye.z <= h[3] && eye.y < 16;
    this.sitcomSound?.update(dt, show.part === 'feature' && show.feature.sitcom ? show.since : null, inside);
    if (!near) return;
    const key = show.feature.title;
    if (key !== this.lastMarquee) {
      this.lastMarquee = key;
      this.drawMarquee(show);
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1 / 12;
    const { ctx, canvas, texture } = this.screen, W = canvas.width, H = canvas.height;
    if (show.part === 'title') {
      // The title card: gold letters on deep red curtains.
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#4a0d12');
      g.addColorStop(1, '#8e1b24');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffd54f';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText('🎬 NOW SHOWING 🎬', W / 2, H * 0.3);
      ctx.font = 'bold 34px system-ui, sans-serif';
      ctx.fillText(show.feature.title, W / 2, H * 0.62, W - 30);
    } else if (show.part === 'feature' && show.feature.sitcom) {
      drawSitcom(ctx, W, H, show.since);
    } else {
      const channel = CHANNELS.find(c => c.name === (show.part === 'previews' ? 'Commercials' : show.feature.channel)) || CHANNELS[0];
      channel.draw(ctx, W, H, t, { players: 0, clock: '', night: false, dayPhase: 0.5 });
      if (show.part === 'previews') {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, 150, 26);
        ctx.fillStyle = '#ffd54f';
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('🍿 Coming soon…', 8, 13);
      }
    }
    texture.needsUpdate = true;
  }

  drawMarquee(show) {
    const { ctx, canvas, texture } = this.marquee, W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, W, H);
    // A row of bulbs round the edge.
    ctx.fillStyle = '#ffe082';
    for (let x = 10; x < W; x += 22) for (const y of [8, H - 8]) {
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff5252';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText('★ STARLIGHT CINEMA ★', W / 2, 44);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('NOW SHOWING', W / 2, 90);
    ctx.fillStyle = '#ffd54f';
    ctx.font = 'bold 32px system-ui, sans-serif';
    ctx.fillText(show.feature.title, W / 2, 134, W - 30);
    texture.needsUpdate = true;
  }
}
