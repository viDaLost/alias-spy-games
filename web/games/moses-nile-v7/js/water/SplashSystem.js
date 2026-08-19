import * as THREE from 'three';

/** Global Points-based droplet pool. MAX_PARTICLES is fixed at construction. */
export class SplashSystem {
  constructor({ scene, waterLevel = 0, maxParticles = 420, color = 0xdcebe8, pointSize = 0.085 } = {}) {
    this.scene = scene;
    this.waterLevel = waterLevel;
    this.maxParticles = maxParticles; // Change particle budget here.
    this.positions = new Float32Array(maxParticles * 3);
    this.velocities = Array.from({ length: maxParticles }, () => new THREE.Vector3());
    this.life = new Float32Array(maxParticles);
    this.maxLife = new Float32Array(maxParticles);
    this.cursor = 0;
    for (let i = 0; i < maxParticles; i++) this.positions[i * 3 + 1] = -9999;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const material = new THREE.PointsMaterial({ color, size: pointSize, transparent: true, opacity: 0.78, depthWrite: false, depthTest: true, sizeAttenuation: true });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 7;
    scene.add(this.points);
  }

  spawn(position, power = 1, particleScale = 1) {
    // Splash intensity and particle count tuning lives here.
    const count = Math.round(THREE.MathUtils.clamp((10 + power * 11) * particleScale, 8, 58));
    for (let n = 0; n < count; n++) {
      const i = this.cursor++ % this.maxParticles;
      const o = i * 3;
      this.positions[o] = position.x;
      this.positions[o + 1] = this.waterLevel + 0.045;
      this.positions[o + 2] = position.z;
      const angle = Math.random() * Math.PI * 2;
      const horizontal = (0.45 + Math.random() * 1.25) * THREE.MathUtils.clamp(power * 0.55, 0.45, 2.1);
      this.velocities[i].set(Math.cos(angle) * horizontal, (1.7 + Math.random() * 2.5) * THREE.MathUtils.clamp(power * 0.55, 0.55, 1.85), Math.sin(angle) * horizontal);
      this.life[i] = 0;
      this.maxLife[i] = 0.55 + Math.random() * 0.75;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  update(dt) {
    let dirty = false;
    for (let i = 0; i < this.maxParticles; i++) {
      if (this.maxLife[i] <= 0) continue;
      this.life[i] += dt;
      const o = i * 3;
      if (this.life[i] >= this.maxLife[i]) {
        this.maxLife[i] = 0;
        this.positions[o + 1] = -9999;
        dirty = true;
        continue;
      }
      const v = this.velocities[i];
      v.y -= 9.81 * dt;
      this.positions[o] += v.x * dt;
      this.positions[o + 1] += v.y * dt;
      this.positions[o + 2] += v.z * dt;
      if (this.positions[o + 1] <= this.waterLevel) {
        this.maxLife[i] = 0;
        this.positions[o + 1] = -9999;
      }
      dirty = true;
    }
    if (dirty) this.points.geometry.attributes.position.needsUpdate = true;
  }
}
