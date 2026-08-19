import * as THREE from 'three';
import { WakeTrail } from './WakeTrail.js';
import { BoatWake } from './BoatWake.js';

/**
 * Unified object/water interaction manager.
 * register(object,{radius,mass,wakeType,splash,flowSpeed,sampleObject})
 * LOD distances and wake interval are configurable in the constructor.
 */
export class WaterInteractionSystem {
  constructor({ scene, camera = null, waterLevel = 0, rippleSystem, splashSystem, foamSystem, wakeInterval = 0.075, lodNear = 30, lodMid = 80, maxRegistered = 48 } = {}) {
    this.scene = scene;
    this.camera = camera;
    this.waterLevel = waterLevel; // Change global WATER_Y here.
    this.ripples = rippleSystem;
    this.splashes = splashSystem;
    this.foam = foamSystem;
    this.wakeInterval = wakeInterval; // 0.05-0.1 s is the intended range.
    this.lodNear = lodNear;           // Change LOD thresholds here.
    this.lodMid = lodMid;
    this.maxRegistered = maxRegistered;
    this.entries = new Map();
    this._p = new THREE.Vector3();
    this._cam = new THREE.Vector3();
    this._delta = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  register(object, options = {}) {
    if (!object || this.entries.has(object) || this.entries.size >= this.maxRegistered) return this.entries.get(object) || null;
    const sampleObject = options.sampleObject || object;
    sampleObject.getWorldPosition(this._p);
    const radius = options.radius ?? 0.6;
    const wakeType = options.wakeType ?? 'object';
    const wake = wakeType === 'none' ? null : wakeType === 'boat'
      ? new BoatWake({ scene: this.scene, waterLevel: this.waterLevel, maxPoints: options.maxWakePoints ?? 34, lifetime: options.wakeLifetime ?? 3.0 })
      : new WakeTrail({ scene: this.scene, waterLevel: this.waterLevel, maxPoints: options.maxWakePoints ?? 38, lifetime: options.wakeLifetime ?? 2.35, baseWidth: 0.14, expansion: 0.30 });
    const entry = {
      object,
      sampleObject,
      radius,
      mass: options.mass ?? radius * radius * 10,
      wakeType,
      wake,
      splash: options.splash !== false,
      flowSpeed: options.flowSpeed ?? 0,
      flowDirection: (options.flowDirection || new THREE.Vector3(0, 0, -1)).clone().normalize(),
      previous: this._p.clone(),
      previousY: this._p.y,
      wakeTimer: 0,
      foamTimer: 0,
      wasInWater: this._p.y <= this.waterLevel,
      idle: 0,
    };
    this.entries.set(object, entry);
    return entry;
  }

  unregister(object) {
    const e = this.entries.get(object);
    if (!e) return;
    e.wake?.clear?.();
    this.entries.delete(object);
  }

  _quality(position) {
    if (!this.camera) return 1;
    this.camera.getWorldPosition(this._cam);
    const d = this._cam.distanceTo(position);
    if (d <= this.lodNear) return 1;
    if (d <= this.lodMid) return 0.5;
    return 0;
  }

  _surfaceCrossing(entry, position, verticalVelocity, quality) {
    if (!entry.splash || quality <= 0) return;
    const entered = entry.previousY > this.waterLevel && position.y <= this.waterLevel;
    const surfaced = entry.previousY < this.waterLevel && position.y >= this.waterLevel;
    if (!entered && !surfaced) return;
    const power = THREE.MathUtils.clamp(Math.abs(verticalVelocity) * entry.radius * 0.22 + entry.radius * 0.65, 0.5, 4);
    const hit = this._p.set(position.x, this.waterLevel, position.z);
    const ringCount = quality >= 1 ? (power > 2.2 ? 3 : 2) : 1;
    this.ripples?.spawn(hit, power, ringCount);
    this.splashes?.spawn(hit, power, quality);
    this.foam?.spawn(hit, power, entry.flowDirection);
  }

  update(dt) {
    for (const [key, e] of this.entries) {
      if (!key.parent || !e.sampleObject.parent) { this.unregister(key); continue; }
      e.sampleObject.getWorldPosition(this._p);
      const quality = this._quality(this._p);
      this._delta.copy(this._p).sub(e.previous);
      const verticalVelocity = this._delta.y / Math.max(dt, 0.001);
      let speed = this._delta.length() / Math.max(dt, 0.001);
      if (speed > 0.03) this._dir.copy(this._delta).setY(0).normalize();
      else this._dir.copy(e.flowDirection);
      if (e.flowSpeed > speed) speed = e.flowSpeed;

      this._surfaceCrossing(e, this._p, verticalVelocity, quality);

      e.wakeTimer += dt;
      e.foamTimer += dt;
      const nearSurface = Math.abs(this._p.y - this.waterLevel) <= Math.max(0.35, e.radius * 0.55);
      if (quality > 0 && nearSurface && e.wake && e.wakeTimer >= this.wakeInterval && speed > 0.3) {
        // Medium LOD emits half as often without changing trail architecture.
        if (quality >= 1 || e.wakeTimer >= this.wakeInterval * 2) {
          e.wake.addPoint(this._p, this._dir, speed, e.radius);
          if (speed > 3.0 && e.foamTimer > 0.22 / Math.max(quality, 0.5)) {
            this.foam?.spawn(this._p, THREE.MathUtils.clamp(speed * e.radius * 0.10, 0.4, 2.2), this._dir);
            e.foamTimer = 0;
          }
          e.wakeTimer = 0;
        }
      }
      e.wake?.update(dt);
      e.previous.copy(this._p);
      e.previousY = this._p.y;
    }
  }
}
