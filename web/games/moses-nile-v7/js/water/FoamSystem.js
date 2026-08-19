import * as THREE from 'three';

/** Short-lived pooled foam patches sharing one geometry. */
export class FoamSystem {
  constructor({ scene, waterLevel = 0, maxFoam = 48, color = 0xd8dfd6 } = {}) {
    this.scene = scene;
    this.waterLevel = waterLevel;
    this.pool = [];
    this.cursor = 0;
    this.geometry = new THREE.CircleGeometry(0.5, 16);
    for (let i = 0; i < maxFoam; i++) {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, depthTest: true, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 6;
      scene.add(mesh);
      this.pool.push({ mesh, active: false, age: 0, duration: 1.8, drift: new THREE.Vector3(), power: 1 });
    }
  }

  spawn(position, power = 1, direction = null) {
    const f = this.pool[this.cursor++ % this.pool.length];
    f.active = true; f.age = 0; f.power = power;
    f.duration = THREE.MathUtils.clamp(1.0 + power * 0.45, 1.0, 2.8);
    f.mesh.position.set(position.x, this.waterLevel + 0.031, position.z);
    f.mesh.scale.setScalar(0.35 + power * 0.22);
    f.mesh.material.opacity = THREE.MathUtils.clamp(0.12 + power * 0.07, 0.12, 0.34);
    f.mesh.visible = true;
    f.drift.set(direction?.x || 0, 0, direction?.z || -0.1).multiplyScalar(0.08 + power * 0.025);
    return f;
  }

  update(dt) {
    for (const f of this.pool) {
      if (!f.active) continue;
      f.age += dt;
      const t = f.age / f.duration;
      if (t >= 1) { f.active = false; f.mesh.visible = false; continue; }
      f.mesh.position.addScaledVector(f.drift, dt);
      f.mesh.scale.multiplyScalar(1 + dt * (0.13 + f.power * 0.025));
      f.mesh.material.opacity = (1 - t) * THREE.MathUtils.clamp(0.11 + f.power * 0.055, 0.11, 0.30);
    }
  }
}
