// Sunny Acres Farm's animals (see shared/farm.js for their pastures): cows, horses, sheep, pigs
// and hens, wandering about their fields just like the zoo's animals do (zooanimals.js: worked out
// from the game's clock, so everyone sees the same thing). Right-click one to pet it. And the
// windmill's sails, turning slowly in the breeze.
import * as THREE from 'three';
import { ZooAnimals } from './zooanimals.js';
import { FARM_ANIMALS } from './shared/farm.js';

export class FarmAnimals extends ZooAnimals {
  constructor({ scene, effects, sounds }) {
    super({ scene, effects, sounds, table: FARM_ANIMALS, floor: 0 }); // (they walk on the ground itself)
    this.sails = null;
  }

  setPlace(place) {
    super.setPlace(place);
    if (this.sails) this.scene.remove(this.sails);
    this.sails = null;
    const mill = place?.mill;
    if (!mill) return;
    // Four sails: a wooden frame with white cloth, on a hub at the front of the tower.
    const g = new THREE.Group(), hub = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.8 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0xfaf3e0, roughness: 0.9, side: THREE.DoubleSide });
    hub.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 10).rotateX(Math.PI / 2), wood));
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i * Math.PI) / 2;
      const spar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.2, 0.12), wood);
      spar.position.y = 2.2;
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 3.4), cloth);
      sail.position.set(0.58, 2.5, 0.02);
      for (let k = 0; k < 4; k++) {
        const rung = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.06), wood);
        rung.position.set(0.58, 1.0 + k * 1.0, 0.05);
        arm.add(rung);
      }
      arm.add(spar, sail);
      hub.add(arm);
    }
    g.add(hub);
    g.position.set(mill.x, mill.y, mill.z);
    g.rotation.y = mill.face;
    g.traverse(o => (o.castShadow = !!o.isMesh));
    this.scene.add(g);
    this.sails = g;
    this.hub = hub;
  }

  update(dt, t, viewer) {
    super.update(dt, t, viewer);
    if (this.hub) this.hub.rotation.z = -t * 0.6; // (the same for everyone: it's the game's clock)
  }
}
