import * as THREE from 'three';
import { STATION } from '../sim/config.js';
import { glowTexture } from './textures.js';

export class StationView {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.position.set(STATION.x, 0, STATION.z);
    scene.add(this.root);

    const metal = new THREE.MeshStandardMaterial({ color: 0xb8c4d6, metalness: 0.6, roughness: 0.35, flatShading: true });
    const glow = new THREE.MeshStandardMaterial({ color: 0x1f7a44, emissive: 0x19c552, emissiveIntensity: 0.9 });
    this.glowMat = glow;

    this.ring = new THREE.Group();
    const torus = new THREE.Mesh(new THREE.TorusGeometry(STATION.dockRadius - 2, 0.8, 8, 48), metal);
    torus.rotation.x = Math.PI / 2;
    torus.position.y = -1.5;
    this.ring.add(torus);
    const lights = new THREE.Mesh(new THREE.TorusGeometry(STATION.dockRadius - 2, 0.25, 6, 48), glow);
    lights.rotation.x = Math.PI / 2;
    lights.position.y = -0.8;
    this.ring.add(lights);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, STATION.dockRadius - 4), metal);
      spoke.position.set(Math.cos(a) * (STATION.dockRadius / 2 - 1), -2.5, Math.sin(a) * (STATION.dockRadius / 2 - 1));
      spoke.rotation.y = -a + Math.PI / 2;
      this.ring.add(spoke);
    }
    this.root.add(this.ring);

    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(2.4, 0), glow);
    this.core.position.y = STATION.coreHeight;
    this.root.add(this.core);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 6, 8), metal);
    pillar.position.y = -2;
    this.root.add(pillar);

    // Beacon beam, visible from far away.
    const beamGeo = new THREE.CylinderGeometry(1.2, 2.5, 60, 16, 1, true);
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0x46ff8a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(beamGeo, this.beamMat);
    beam.position.y = 30;
    this.root.add(beam);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x46ff8a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(12, 12, 1);
    halo.position.y = STATION.coreHeight;
    this.root.add(halo);

    const padGeo = new THREE.CircleGeometry(STATION.dockRadius, 64);
    padGeo.rotateX(-Math.PI / 2);
    this.padMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x2bff6a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });
    const pad = new THREE.Mesh(padGeo, this.padMat);
    pad.position.y = -3;
    this.root.add(pad);

    // Solar arrays on four arms.
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x1a3b8a, emissive: 0x0a1a50, metalness: 0.8, roughness: 0.25, flatShading: true });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const arm = new THREE.Group();
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 7), metal);
      strut.position.z = STATION.dockRadius + 2;
      arm.add(strut);
      for (const side of [-1, 1]) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 5.5), panelMat);
        panel.position.set(side * 2, 0, STATION.dockRadius + 4);
        arm.add(panel);
      }
      arm.rotation.y = a;
      arm.position.y = -1.5;
      this.ring.add(arm);
    }
    // Blinking navigation lights around the ring.
    this.navMats = [new THREE.MeshBasicMaterial({ color: 0xff3355 }), new THREE.MeshBasicMaterial({ color: 0xffffff })];
    const navGeo = new THREE.SphereGeometry(0.35, 8, 6);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const n = new THREE.Mesh(navGeo, this.navMats[i % 2]);
      n.position.set(Math.cos(a) * (STATION.dockRadius - 2), -0.4, Math.sin(a) * (STATION.dockRadius - 2));
      this.ring.add(n);
    }
    // Landing chevrons on the pad.
    const chevMat = new THREE.MeshBasicMaterial({ color: 0x2bff6a, transparent: true, opacity: 0.35, depthWrite: false });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const chev = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3), chevMat);
      chev.rotation.set(-Math.PI / 2, 0, -a);
      chev.position.set(Math.cos(a) * 9, -2.9, Math.sin(a) * 9);
      this.root.add(chev);
    }

    this.light = new THREE.PointLight(0x5dff9a, 25, 50, 1.6);
    this.light.position.y = 6;
    this.root.add(this.light);
    this.pulse = 0;
  }

  bump() { this.pulse = 1; }

  update(world, time, dt) {
    this.pulse = Math.max(0, this.pulse - dt * 4);
    this.ring.rotation.y = time * 0.15;
    const blink = Math.floor(time * 2) % 2 === 0;
    this.navMats[0].color.setHex(blink ? 0xff3355 : 0x330810);
    this.navMats[1].color.setHex(blink ? 0x333333 : 0xffffff);
    this.core.rotation.y = time * 0.8;
    const s = 1 + this.pulse * 0.35;
    this.core.scale.setScalar(s);
    this.glowMat.emissiveIntensity = 0.9 + this.pulse * 1.5;
    this.padMat.opacity = world.docked ? 0.35 + Math.sin(time * 6) * 0.08 : 0.18;
    this.beamMat.opacity = 0.1 + (world.cargoCount >= world.stats.capacity ? 0.12 + Math.sin(time * 6) * 0.06 : 0);
  }
}
