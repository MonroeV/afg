// Fancy lighting: live reflections of the world around you, and a soft glow (bloom)
// around bright things like lamps, fireworks, headlights and the sun.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Every so often a little 6-sided camera takes a picture of everything around you.
// Shiny things (cars, glass, metal, water, mirrors) then reflect that picture, so they
// show the real buildings, sky, sunset and street lamps instead of a plain sky.
export class Reflections {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.size = 0;
    this.interval = 1.5;
    this.timer = 0;
    this.lastPos = new THREE.Vector3(1e9, 0, 0);
    this.staticEnv = scene.environment;
    this.envTarget = null;
    // Shiny materials get the reflection picture directly, at full strength, while
    // everything else only gets a gentle amount of it as soft light.
    this.shiny = new Set();
  }

  addShiny(material, strength) {
    material.userData.envStrength = strength;
    this.shiny.add(material);
  }

  removeShiny(material) {
    this.shiny.delete(material);
  }

  // Called every frame. With the plain sky picture (no live reflections), shiny
  // things are dimmed at night so they don't reflect a daytime sky.
  refresh(dayK) {
    const tex = this.scene.environment;
    for (const m of this.shiny) {
      if (m.envMap !== tex) {
        if (!m.envMap) m.needsUpdate = true;
        m.envMap = tex;
      }
      m.envMapIntensity = m.userData.envStrength * (this.live ? 1 : 0.1 + 0.9 * dayK);
    }
  }

  // size 0 turns live reflections off (and goes back to the plain sky).
  configure(size, interval) {
    this.interval = interval;
    if (size === this.size) return;
    this.size = size;
    this.cubeTarget?.dispose();
    this.cubeTarget = null;
    if (!size) {
      this.scene.environment = this.staticEnv;
      this.envTarget?.dispose();
      this.envTarget = null;
      return;
    }
    this.cubeTarget = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType });
    this.cubeCamera = new THREE.CubeCamera(0.3, 500, this.cubeTarget);
    this.timer = 0;
  }

  get live() {
    return this.size > 0;
  }

  update(dt, camera, hide = []) {
    if (!this.size) return;
    this.timer -= dt;
    const moved = camera.position.distanceTo(this.lastPos) > 8;
    if (this.timer > 0 && !moved) return;
    this.timer = this.interval;
    this.lastPos.copy(camera.position);

    const r = this.renderer;
    const { autoClear } = r;
    const shadows = r.shadowMap.autoUpdate;
    r.autoClear = true;
    r.shadowMap.autoUpdate = false; // reuse this frame's shadows
    const wasVisible = hide.map(o => o.visible);
    for (const o of hide) o.visible = false;
    // Take the picture without any reflections in it. Otherwise mirrors would reflect
    // the last picture, which showed the mirrors... and it gets brighter every time.
    const ambient = this.scene.environmentIntensity;
    this.scene.environmentIntensity = 0;
    for (const m of this.shiny) m.envMapIntensity = 0;
    this.cubeCamera.position.copy(camera.position);
    this.cubeCamera.update(r, this.scene);
    this.scene.environmentIntensity = ambient;
    hide.forEach((o, i) => (o.visible = wasVisible[i]));
    r.autoClear = autoClear;
    r.shadowMap.autoUpdate = shadows;

    // Blur it for rough surfaces (that's what PMREM does), then use it everywhere.
    const env = this.pmrem.fromCubemap(this.cubeTarget.texture);
    this.scene.environment = env.texture;
    this.envTarget?.dispose();
    this.envTarget = env;
  }
}

// Bloom: bright things get a soft glow. Stronger at night, when lamps and fireworks pop.
export class Glow {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.4, 0.25, 2.5);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.enabled = false;
  }

  setSize(w, h, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
  }

  // dayK: 1 in the day, 0 at night.
  render(dayK) {
    // In daylight only really bright things (like the sun) glow; at night lamps,
    // headlights, TVs and fireworks do too.
    this.bloom.threshold = 3.2 + 7 * dayK; // only really bright things glow, and gently
    this.bloom.strength = 0.22 - 0.12 * dayK;
    this.composer.render();
  }
}
