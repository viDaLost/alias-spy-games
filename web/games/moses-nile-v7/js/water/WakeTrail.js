import * as THREE from 'three';

const VS = `
attribute float alpha;
varying float vAlpha;
void main(){vAlpha=alpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
`;
const FS = `
uniform vec3 color;
varying float vAlpha;
void main(){gl_FragColor=vec4(color,vAlpha);}
`;

/** Dynamic pooled wake ribbon built from one BufferGeometry. */
export class WakeTrail {
  constructor({ scene, waterLevel = 0, maxPoints = 42, lifetime = 2.4, baseWidth = 0.18, expansion = 0.34, color = 0x8fa9a0 } = {}) {
    this.scene = scene;
    this.waterLevel = waterLevel;
    this.maxPoints = maxPoints; // Change wake memory/length here.
    this.lifetime = lifetime;   // Change wake duration here.
    this.baseWidth = baseWidth;
    this.expansion = expansion;
    this.points = [];

    const vertexCount = maxPoints * 2;
    this.positions = new Float32Array(vertexCount * 3);
    this.alphas = new Float32Array(vertexCount);
    this.indices = new Uint16Array(Math.max(0, (maxPoints - 1) * 6));
    for (let i = 0; i < maxPoints - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3, o = i * 6;
      this.indices.set([a, c, b, b, c, d], o);
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setIndex(new THREE.BufferAttribute(this.indices, 1));
    this.geometry.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) } },
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.scene.add(this.mesh);
  }

  addPoint(position, direction, speed, size = 1) {
    if (!position || !direction || speed < 0.3) return;
    if (this.points.length >= this.maxPoints) this.points.shift();
    this.points.push({
      position: position.clone(),
      direction: direction.clone().normalize(),
      speed,
      size,
      age: 0,
    });
  }

  clear() { this.points.length = 0; this.geometry.setDrawRange(0, 0); }

  update(dt) {
    for (let i = this.points.length - 1; i >= 0; i--) {
      this.points[i].age += dt;
      if (this.points[i].age > this.lifetime) this.points.splice(i, 1);
    }
    const n = this.points.length;
    for (let i = 0; i < n; i++) {
      const p = this.points[i];
      const life = Math.max(0, 1 - p.age / this.lifetime);
      const perp = new THREE.Vector3(-p.direction.z, 0, p.direction.x).normalize();
      const speedWidth = THREE.MathUtils.clamp(p.speed * 0.045, 0.12, 0.95);
      const width = (this.baseWidth + speedWidth * p.size + p.age * this.expansion) * 0.5;
      const left = p.position.clone().addScaledVector(perp, width);
      const right = p.position.clone().addScaledVector(perp, -width);
      const y = this.waterLevel + 0.018;
      const o = i * 6;
      this.positions[o] = left.x; this.positions[o + 1] = y; this.positions[o + 2] = left.z;
      this.positions[o + 3] = right.x; this.positions[o + 4] = y; this.positions[o + 5] = right.z;
      const a = life * THREE.MathUtils.clamp(0.08 + p.speed * 0.012, 0.08, 0.42);
      this.alphas[i * 2] = a; this.alphas[i * 2 + 1] = a;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
    this.geometry.setDrawRange(0, Math.max(0, (n - 1) * 6));
  }
}
