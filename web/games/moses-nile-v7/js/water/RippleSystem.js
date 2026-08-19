import * as THREE from 'three';

/** Fixed-size ring pool; no geometry allocation during gameplay. */
export class RippleSystem {
  constructor({ scene, waterLevel = 0, maxRipples = 72, color = 0x8fa9a0 } = {}) {
    this.scene = scene;
    this.waterLevel = waterLevel;
    this.maxRipples = maxRipples; // Global ripple budget.
    this.geometry = new THREE.RingGeometry(0.8, 1.0, 28);
    this.pool = [];
    this.cursor = 0;
    for (let i = 0; i < maxRipples; i++) {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, depthTest: true, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 5;
      scene.add(mesh);
      this.pool.push({ mesh, active: false, age: 0, delay: 0, duration: 1, power: 1 });
    }
  }

  spawn(position, power = 1, count = 1) {
    const rings = Math.min(3, Math.max(1, count));
    for (let i = 0; i < rings; i++) {
      const slot = this.pool[this.cursor++ % this.pool.length];
      slot.active = true;
      slot.age = 0;
      slot.delay = i * 0.15;
      slot.duration = THREE.MathUtils.clamp(0.75 + power * 0.18 + i * 0.12, 0.7, 1.55);
      slot.power = power * (1 - i * 0.16);
      slot.mesh.position.set(position.x, this.waterLevel + 0.026 + i * 0.001, position.z);
      slot.mesh.scale.setScalar(0.3 + power * 0.16);
      slot.mesh.material.opacity = 0;
      slot.mesh.visible = true;
    }
  }

  update(dt) {
    for (const r of this.pool) {
      if (!r.active) continue;
      r.age += dt;
      if (r.age < r.delay) continue;
      const t = (r.age - r.delay) / r.duration;
      if (t >= 1) { r.active = false; r.mesh.visible = false; continue; }
      const eased = 1 - Math.pow(1 - t, 2);
      const scale = 0.45 + eased * (2.6 + r.power * 1.3);
      r.mesh.scale.setScalar(scale);
      r.mesh.material.opacity = (1 - t) * THREE.MathUtils.clamp(0.16 + r.power * 0.09, 0.16, 0.48);
    }
  }
}
