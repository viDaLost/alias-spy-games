/*
  Моисей: Путь по Нилу — система эффектов.

  Один пул частиц на весь кадр (THREE.Points с шейдером из shaders.js),
  пул колец ряби и генератор тряски камеры. Ничего не аллоцируется во время
  игры: все буферы выделяются один раз при создании.
*/
(() => {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  class NileEffects {
    constructor(THREE, scene, options = {}) {
      this.THREE = THREE;
      this.scene = scene;
      this.capacity = options.capacity || 640;
      this.rippleCapacity = options.ripples || 16;
      this.enabled = true;
      this.time = 0;
      this.shakeAmount = 0;
      this.shakeDecay = 3.4;
      this.shakeOffset = new THREE.Vector3();
      this.shakeRoll = 0;
      this._buildParticles();
      this._buildRipples();
    }

    _buildParticles() {
      const { THREE } = this;
      const n = this.capacity;
      this.positions = new Float32Array(n * 3);
      this.colors = new Float32Array(n * 3);
      this.sizes = new Float32Array(n);
      this.alphas = new Float32Array(n);
      this.velocity = new Float32Array(n * 3);
      this.life = new Float32Array(n);
      this.maxLife = new Float32Array(n);
      this.gravity = new Float32Array(n);
      this.drag = new Float32Array(n);
      this.baseSize = new Float32Array(n);
      this.cursor = 0;
      this.liveCount = 0;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
      geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
      geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
      geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
      geometry.setDrawRange(0, n);
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);

      const material = window.NileShaders?.createParticleMaterial?.(THREE, { soft: 1 })
        || new THREE.PointsMaterial({ size: .3, transparent: true, depthWrite: false });
      this.particleMaterial = material;
      this.points = new THREE.Points(geometry, material);
      this.points.name = 'NileParticleField';
      this.points.frustumCulled = false;
      this.points.renderOrder = 8;
      this.scene.add(this.points);
      this.geometry = geometry;
    }

    _buildRipples() {
      const { THREE } = this;
      this.ripples = [];
      const material = window.NileShaders?.createRippleMaterial?.(THREE)
        || new THREE.MeshBasicMaterial({ color: 0xf1e7cb, transparent: true, opacity: .3, depthWrite: false });
      this.rippleMaterialTemplate = material;
      const geometry = new THREE.PlaneGeometry(1, 1);
      for (let i = 0; i < this.rippleCapacity; i += 1) {
        const mesh = new THREE.Mesh(geometry, material.clone());
        mesh.rotation.x = -Math.PI / 2;
        mesh.visible = false;
        mesh.renderOrder = 6;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        this.ripples.push({ mesh, life: 0, maxLife: 1, from: .5, to: 3, alpha: .5 });
      }
      this.rippleCursor = 0;
    }

    setQuality(scale) {
      const clamped = clamp(scale, .25, 1);
      this.qualityScale = clamped;
      this.geometry.setDrawRange(0, Math.max(48, Math.floor(this.capacity * clamped)));
    }

    /* Общий низкоуровневый спавн одной частицы. */
    spawn(x, y, z, vx, vy, vz, size, life, color, alpha = 1, gravity = -6, drag = 1.6) {
      if (!this.enabled) return;
      const limit = this.geometry.drawRange.count || this.capacity;
      const index = this.cursor % limit;
      this.cursor = (this.cursor + 1) % limit;
      const p3 = index * 3;
      this.positions[p3] = x;
      this.positions[p3 + 1] = y;
      this.positions[p3 + 2] = z;
      this.velocity[p3] = vx;
      this.velocity[p3 + 1] = vy;
      this.velocity[p3 + 2] = vz;
      this.colors[p3] = color[0];
      this.colors[p3 + 1] = color[1];
      this.colors[p3 + 2] = color[2];
      this.baseSize[index] = size;
      this.sizes[index] = size;
      this.alphas[index] = alpha;
      this.life[index] = life;
      this.maxLife[index] = life;
      this.gravity[index] = gravity;
      this.drag[index] = drag;
    }

    /* Брызги от корзинки и ударов по воде. */
    splash(x, y, z, strength = 1, tint = [.96, .93, .82]) {
      const count = Math.round(clamp(9 * strength, 3, 26));
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (.9 + Math.random() * 2.1) * strength;
        this.spawn(
          x + Math.cos(angle) * .22,
          y + .05 + Math.random() * .12,
          z + Math.sin(angle) * .22,
          Math.cos(angle) * speed,
          1.4 + Math.random() * 2.4 * strength,
          Math.sin(angle) * speed * .7 + 1.6,
          .10 + Math.random() * .13,
          .42 + Math.random() * .40,
          tint,
          .85,
          -7.5,
          1.5,
        );
      }
    }

    /* Направленный шлейф брызг из-под днища. */
    spray(x, y, z, speed = 1) {
      if (Math.random() > clamp(speed * .55, .1, .95)) return;
      const side = Math.random() < .5 ? -1 : 1;
      this.spawn(
        x + side * (.32 + Math.random() * .2),
        y + .02,
        z - .35 - Math.random() * .5,
        side * (.5 + Math.random() * .8),
        .8 + Math.random() * 1.1,
        1.6 + Math.random() * 2.2,
        .07 + Math.random() * .08,
        .3 + Math.random() * .28,
        [.98, .96, .88],
        .55,
        -6.2,
        2.1,
      );
    }

    /* Звёздочка при подборе: цветной взрыв с подъёмом. */
    burst(x, y, z, color, count = 16, power = 1) {
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * .4;
        const radial = (.9 + Math.random() * 1.6) * power;
        this.spawn(
          x, y, z,
          Math.cos(angle) * radial,
          1.2 + Math.random() * 2.6 * power,
          Math.sin(angle) * radial,
          .11 + Math.random() * .13,
          .45 + Math.random() * .45,
          color,
          .95,
          -3.2,
          1.25,
        );
      }
    }

    /* Медленные висящие частицы: пыльца днём, светляки ночью. */
    mote(x, y, z, color, size = .09, life = 3.4) {
      this.spawn(
        x, y, z,
        (Math.random() - .5) * .35,
        (Math.random() - .5) * .22,
        1.2 + Math.random() * .9,
        size,
        life,
        color,
        .55,
        .18,
        .35,
      );
    }

    ripple(x, y, z, from = .6, to = 3.4, life = .9, alpha = .45) {
      const slot = this.ripples[this.rippleCursor % this.ripples.length];
      this.rippleCursor += 1;
      slot.life = life;
      slot.maxLife = life;
      slot.from = from;
      slot.to = to;
      slot.alpha = alpha;
      slot.mesh.position.set(x, y, z);
      slot.mesh.scale.setScalar(from);
      slot.mesh.visible = true;
      this._setRippleAlpha(slot, alpha);
    }

    _setRippleAlpha(slot, alpha) {
      const material = slot.mesh.material;
      if (material.uniforms?.uAlpha) material.uniforms.uAlpha.value = alpha;
      else material.opacity = alpha;
    }

    shake(amount, decay = 3.4) {
      this.shakeAmount = Math.max(this.shakeAmount, amount);
      this.shakeDecay = decay;
    }

    reset() {
      this.life.fill(0);
      this.alphas.fill(0);
      this.shakeAmount = 0;
      this.shakeOffset.set(0, 0, 0);
      this.shakeRoll = 0;
      for (const slot of this.ripples) {
        slot.life = 0;
        slot.mesh.visible = false;
      }
      this.geometry.attributes.aAlpha.needsUpdate = true;
    }

    update(dt, elapsed) {
      this.time = elapsed;
      const limit = this.geometry.drawRange.count || this.capacity;
      let live = 0;
      for (let i = 0; i < limit; i += 1) {
        if (this.life[i] <= 0) {
          if (this.alphas[i] !== 0) this.alphas[i] = 0;
          continue;
        }
        live += 1;
        this.life[i] -= dt;
        const p3 = i * 3;
        const damping = Math.exp(-this.drag[i] * dt);
        this.velocity[p3] *= damping;
        this.velocity[p3 + 1] = (this.velocity[p3 + 1] + this.gravity[i] * dt) * damping;
        this.velocity[p3 + 2] *= damping;
        this.positions[p3] += this.velocity[p3] * dt;
        this.positions[p3 + 1] += this.velocity[p3 + 1] * dt;
        this.positions[p3 + 2] += this.velocity[p3 + 2] * dt;
        const t = clamp(this.life[i] / this.maxLife[i], 0, 1);
        this.alphas[i] = t * t * .95;
        this.sizes[i] = this.baseSize[i] * (.55 + t * .65);
        if (this.positions[p3 + 1] < -.35) this.life[i] = 0;
      }
      this.liveCount = live;
      const attributes = this.geometry.attributes;
      attributes.position.needsUpdate = true;
      attributes.aAlpha.needsUpdate = true;
      attributes.aSize.needsUpdate = true;
      attributes.aColor.needsUpdate = true;
      if (this.particleMaterial.uniforms) this.particleMaterial.uniforms.uTime.value = elapsed;

      for (const slot of this.ripples) {
        if (slot.life <= 0) {
          if (slot.mesh.visible) slot.mesh.visible = false;
          continue;
        }
        slot.life -= dt;
        const t = 1 - clamp(slot.life / slot.maxLife, 0, 1);
        const scale = slot.from + (slot.to - slot.from) * t;
        slot.mesh.scale.set(scale, scale, scale);
        this._setRippleAlpha(slot, slot.alpha * (1 - t));
        if (slot.life <= 0) slot.mesh.visible = false;
      }

      if (this.shakeAmount > .0005) {
        this.shakeAmount = Math.max(0, this.shakeAmount - this.shakeDecay * dt * this.shakeAmount - dt * .04);
        const a = this.shakeAmount;
        this.shakeOffset.set(
          Math.sin(elapsed * 47.3) * a,
          Math.sin(elapsed * 61.7 + 1.3) * a * .7,
          Math.sin(elapsed * 39.1 + 2.6) * a * .35,
        );
        this.shakeRoll = Math.sin(elapsed * 53.9) * a * .06;
      } else if (this.shakeOffset.lengthSq() > 0) {
        this.shakeAmount = 0;
        this.shakeOffset.set(0, 0, 0);
        this.shakeRoll = 0;
      }
    }

    setParticleScale(pixelRatio) {
      if (this.particleMaterial.uniforms?.uPixelRatio) {
        this.particleMaterial.uniforms.uPixelRatio.value = pixelRatio;
      }
    }

    dispose() {
      this.scene.remove(this.points);
      this.geometry.dispose();
      this.particleMaterial.dispose?.();
      for (const slot of this.ripples) this.scene.remove(slot.mesh);
    }
  }

  window.NileFX = {
    create(THREE, scene, options) {
      return new NileEffects(THREE, scene, options);
    },
  };
})();
