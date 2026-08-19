import * as THREE from 'three';
import { WakeTrail } from './WakeTrail.js';

/** Two divergent ribbons + central turbulence for boat/raft wakes. */
export class BoatWake {
  constructor({ scene, waterLevel = 0, maxPoints = 36, lifetime = 3.1 } = {}) {
    this.waterLevel = waterLevel;
    this.left = new WakeTrail({ scene, waterLevel, maxPoints, lifetime, baseWidth: 0.12, expansion: 0.42, color: 0xaabbb4 });
    this.right = new WakeTrail({ scene, waterLevel, maxPoints, lifetime, baseWidth: 0.12, expansion: 0.42, color: 0xaabbb4 });
    this.center = new WakeTrail({ scene, waterLevel, maxPoints: Math.max(18, Math.floor(maxPoints * 0.7)), lifetime: 1.8, baseWidth: 0.10, expansion: 0.22, color: 0xd8dfd6 });
  }

  addPoint(position, direction, speed, size = 1) {
    if (speed < 0.35) return;
    const dir = direction.clone().normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    // Visual Kelvin-like angle; faster boats get a slightly narrower, longer V.
    const angle = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(32 - speed * 0.35, 15, 32));
    const spread = Math.tan(angle) * Math.max(0.55, size * 0.45);
    const behind = position.clone().addScaledVector(dir, -Math.max(0.35, size * 0.45));
    const leftPos = behind.clone().addScaledVector(perp, spread);
    const rightPos = behind.clone().addScaledVector(perp, -spread);
    const leftDir = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    const rightDir = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -angle);
    this.left.addPoint(leftPos, leftDir, speed, size * 0.9);
    this.right.addPoint(rightPos, rightDir, speed, size * 0.9);
    this.center.addPoint(behind, dir, speed * 0.7, size * 0.55);
  }

  update(dt) { this.left.update(dt); this.right.update(dt); this.center.update(dt); }
  clear() { this.left.clear(); this.right.clear(); this.center.clear(); }
}
