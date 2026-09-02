/*
  Моисей: Путь по Нилу — библиотека шейдеров.

  Файл не трогает THREE на этапе загрузки: все фабрики принимают ссылку на
  библиотеку аргументом. Это нужно потому, что index.html подключает скрипты
  до того, как становится ясно, доступен ли WebGL и загрузился ли three.js.
*/
(() => {
  'use strict';

  const NOISE = `
    float nhash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
    float nnoise(vec2 p){
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(nhash(i), nhash(i + vec2(1.0, 0.0)), u.x),
                 mix(nhash(i + vec2(0.0, 1.0)), nhash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p){
      float total = 0.0;
      float amp = 0.5;
      for (int i = 0; i < 4; i++) {
        total += nnoise(p) * amp;
        p *= 2.03;
        amp *= 0.5;
      }
      return total;
    }
  `;

  const WAVES = `
    // Четыре направленные волны. Возвращает смещение по Y,
    // производные складываются вызывающей стороной в нормаль.
    vec3 nileWave(vec2 pos, float t, float chop){
      vec4 dirX = vec4(0.92, -0.44, 0.18, -0.76);
      vec4 dirZ = vec4(0.39, 0.89, 0.98, 0.64);
      vec4 freq = vec4(0.42, 0.71, 1.63, 2.71);
      vec4 speed = vec4(1.05, 1.42, 2.15, 2.85);
      vec4 amp = vec4(0.085, 0.052, 0.022, 0.012) * chop;
      float height = 0.0;
      float ddx = 0.0;
      float ddz = 0.0;
      for (int i = 0; i < 4; i++) {
        float dx = dirX[i];
        float dz = dirZ[i];
        float f = freq[i];
        float phase = (pos.x * dx + pos.y * dz) * f + t * speed[i];
        float s = sin(phase);
        float c = cos(phase);
        height += s * amp[i];
        ddx += c * amp[i] * f * dx;
        ddz += c * amp[i] * f * dz;
      }
      return vec3(height, ddx, ddz);
    }
  `;

  const RIVER_VERT = `
    uniform float uTime;
    uniform float uChop;
    uniform float uFlow;
    varying vec2 vUv;
    varying vec3 vWorld;
    varying vec3 vWaveNormal;
    varying float vCrest;
    varying float vShore;
    #include <fog_pars_vertex>
    ${WAVES}
    void main(){
      vUv = uv;
      vShore = abs(uv.x - 0.5) * 2.0;
      vec3 transformed = position;
      vec4 worldBase = modelMatrix * vec4(transformed, 1.0);
      float t = uTime * uFlow;
      vec3 w = nileWave(worldBase.xz, t, uChop);
      transformed.y += w.x;
      vCrest = clamp(w.x / max(0.0001, 0.14 * uChop) * 0.5 + 0.5, 0.0, 1.0);
      vWaveNormal = normalize(vec3(-w.y, 1.0, -w.z));
      vec4 world = modelMatrix * vec4(transformed, 1.0);
      vWorld = world.xyz;
      vec4 mv = viewMatrix * world;
      gl_Position = projectionMatrix * mv;
      #ifdef USE_FOG
        fogDepth = -mv.z;
      #endif
    }
  `;

  const RIVER_FRAG = `
    uniform float uTime;
    uniform float uOpacity;
    uniform float uGlitter;
    uniform float uFoam;
    uniform float uHasNormals;
    uniform float uWakeStrength;
    uniform vec2 uOffsetA;
    uniform vec2 uOffsetB;
    uniform vec2 uRepeatA;
    uniform vec2 uRepeatB;
    uniform vec3 uDeep;
    uniform vec3 uShallow;
    uniform vec3 uSky;
    uniform vec3 uSunColor;
    uniform vec3 uSunDir;
    uniform vec3 uFoamColor;
    uniform vec3 uPlayer;
    uniform sampler2D uNormalA;
    uniform sampler2D uNormalB;
    varying vec2 vUv;
    varying vec3 vWorld;
    varying vec3 vWaveNormal;
    varying float vCrest;
    varying float vShore;
    #include <fog_pars_fragment>
    ${NOISE}
    void main(){
      vec3 viewDir = normalize(cameraPosition - vWorld);
      vec3 normal = vWaveNormal;

      // Две независимо ползущие карты нормалей дают мелкую рябь.
      vec2 uvA = vUv * uRepeatA + uOffsetA;
      vec2 uvB = vUv * uRepeatB + uOffsetB;
      vec3 rippleA = texture2D(uNormalA, uvA).xyz * 2.0 - 1.0;
      vec3 rippleB = texture2D(uNormalB, uvB).xyz * 2.0 - 1.0;
      vec3 packed = normalize(rippleA * 0.62 + rippleB * 0.38);
      // Если пакет текстур не приехал, рябь считается процедурно.
      float pn = fbm(vUv * vec2(9.0, 120.0) + vec2(uTime * 0.05, uTime * -0.62));
      float pe = fbm(vUv * vec2(9.0, 120.0) + vec2(0.07, 0.0) + vec2(uTime * 0.05, uTime * -0.62));
      float ps = fbm(vUv * vec2(9.0, 120.0) + vec2(0.0, 0.07) + vec2(uTime * 0.05, uTime * -0.62));
      vec3 procedural = normalize(vec3((pn - pe) * 3.4, 1.0, (pn - ps) * 3.4));
      vec3 detail = mix(procedural, vec3(packed.x, packed.z, packed.y), uHasNormals);
      normal = normalize(normal + vec3(detail.x, 0.0, detail.z) * 0.85);

      float fresnel = pow(clamp(1.0 - dot(normal, viewDir), 0.0, 1.0), 3.0);
      float depthMix = smoothstep(0.15, 0.95, vShore);
      float horizon = smoothstep(0.25, 0.98, vUv.y);

      vec3 base = mix(uDeep, uShallow, depthMix * 0.62 + vCrest * 0.10);
      base = mix(base, uSky, fresnel * 0.42 + horizon * 0.45);

      // Солнечный блик: узкий Блинн-Фонг плюс мерцающая крошка.
      vec3 halfDir = normalize(uSunDir + viewDir);
      float spec = pow(max(dot(normal, halfDir), 0.0), 128.0);
      float sparkle = pow(max(dot(normal, halfDir), 0.0), 900.0);
      float glint = nnoise(vUv * vec2(60.0, 420.0) + vec2(uTime * 0.4, uTime * -3.1));
      vec3 color = base + uSunColor * (spec * 0.34 + sparkle * glint * 1.5) * uGlitter;

      // Рельеф ряби читается не только бликом: слегка притеняем склоны волн.
      float lambert = clamp(dot(normal, normalize(uSunDir)) * 0.5 + 0.5, 0.0, 1.0);
      color *= 0.86 + lambert * 0.28;

      // Каустика на мелководье.
      float caustic = fbm(vUv * vec2(14.0, 90.0) + vec2(uTime * 0.11, uTime * -0.45));
      caustic = pow(clamp(caustic, 0.0, 1.0), 3.0);
      color += uSunColor * caustic * depthMix * 0.16;

      // Пена: у берега, на гребнях и вокруг корзинки.
      float bankFoam = smoothstep(0.90, 1.0, vShore);
      float crestFoam = smoothstep(0.72, 0.98, vCrest) * uFoam;
      float wakeDist = length(vWorld.xz - uPlayer.xz);
      float wake = smoothstep(3.2, 0.55, wakeDist) * uWakeStrength;
      float foamNoise = fbm(vUv * vec2(22.0, 190.0) + vec2(uTime * 0.2, uTime * -1.5));
      float foam = clamp((bankFoam * 0.62 + crestFoam * 0.55 + wake) * (0.34 + foamNoise * 0.72), 0.0, 1.0);
      color = mix(color, uFoamColor, foam * 0.72);

      float alpha = clamp(uOpacity + fresnel * 0.20 + foam * 0.42 + spec * 0.16 - horizon * 0.10, 0.0, 0.92);
      gl_FragColor = vec4(color, alpha);
      #include <fog_fragment>
    }
  `;

  function fogUniforms(THREE) {
    return THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  }

  const api = {
    /* Поверхность Нила: волны в вершинном шейдере, рябь/пена/блики — во фрагментном. */
    createRiverMaterial(THREE, options = {}) {
      const empty = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, THREE.RGBAFormat);
      empty.needsUpdate = true;
      const uniforms = Object.assign(fogUniforms(THREE), {
        uTime: { value: 0 },
        uFlow: { value: 1 },
        uChop: { value: 1 },
        uOpacity: { value: options.opacity ?? .30 },
        uGlitter: { value: options.glitter ?? 1 },
        uFoam: { value: options.foam ?? .6 },
        uHasNormals: { value: 0 },
        uWakeStrength: { value: 0 },
        uOffsetA: { value: new THREE.Vector2() },
        uOffsetB: { value: new THREE.Vector2() },
        uRepeatA: { value: new THREE.Vector2(3.2, 46) },
        uRepeatB: { value: new THREE.Vector2(6.4, 78) },
        uDeep: { value: new THREE.Color(options.deep ?? 0x53592c) },
        uShallow: { value: new THREE.Color(options.shallow ?? 0xa8975a) },
        uSky: { value: new THREE.Color(options.sky ?? 0xe6d3a2) },
        uSunColor: { value: new THREE.Color(options.sun ?? 0xffe2ac) },
        uFoamColor: { value: new THREE.Color(options.foamColor ?? 0xf4ecd6) },
        uSunDir: { value: new THREE.Vector3(-.42, .78, .46).normalize() },
        uPlayer: { value: new THREE.Vector3() },
        uNormalA: { value: empty },
        uNormalB: { value: empty },
      });
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: RIVER_VERT,
        fragmentShader: RIVER_FRAG,
        transparent: true,
        depthWrite: false,
        fog: true,
        side: THREE.DoubleSide,
      });
      material.name = 'NileRiverSurfaceShader';
      return material;
    },

    /* Тонкая плёнка бликов поверх основной воды — второй слой рельефа. */
    createSheenMaterial(THREE, options = {}) {
      const uniforms = Object.assign(fogUniforms(THREE), {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(options.color ?? 0xfff0c8) },
        uStrength: { value: options.strength ?? .18 },
        uOffset: { value: new THREE.Vector2() },
      });
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
          varying vec2 vUv;
          varying float vShore;
          #include <fog_pars_vertex>
          void main(){
            vUv = uv;
            vShore = abs(uv.x - 0.5) * 2.0;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            #ifdef USE_FOG
              fogDepth = -mv.z;
            #endif
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uStrength;
          uniform vec3 uColor;
          uniform vec2 uOffset;
          varying vec2 vUv;
          varying float vShore;
          #include <fog_pars_fragment>
          ${NOISE}
          void main(){
            vec2 p = vUv * vec2(7.0, 90.0) + uOffset;
            float streak = fbm(p + vec2(0.0, uTime * -1.1));
            streak = pow(clamp(streak, 0.0, 1.0), 4.0);
            float band = smoothstep(0.98, 0.25, vShore);
            float alpha = streak * band * uStrength;
            if (alpha < 0.004) discard;
            gl_FragColor = vec4(uColor, alpha);
            #include <fog_fragment>
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: true,
        side: THREE.DoubleSide,
      });
      material.name = 'NileWaterSheenShader';
      return material;
    },

    /* Небесная дымка: широкая полоса за сценой, подкрашивает эталонный фон. */
    createAtmosphereMaterial(THREE, options = {}) {
      const uniforms = {
        uTop: { value: new THREE.Color(options.top ?? 0xe9d6a6) },
        uBottom: { value: new THREE.Color(options.bottom ?? 0xf6e6bd) },
        uSunColor: { value: new THREE.Color(options.sun ?? 0xffe6b0) },
        uSunPos: { value: new THREE.Vector2(.5, .62) },
        uStrength: { value: options.strength ?? .3 },
        uTime: { value: 0 },
        uStars: { value: 0 },
      };
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
          varying vec2 vUv;
          void main(){
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uTop;
          uniform vec3 uBottom;
          uniform vec3 uSunColor;
          uniform vec2 uSunPos;
          uniform float uStrength;
          uniform float uStars;
          uniform float uTime;
          varying vec2 vUv;
          ${NOISE}
          void main(){
            vec3 sky = mix(uBottom, uTop, smoothstep(0.0, 1.0, vUv.y));
            float halo = 1.0 - smoothstep(0.0, 0.42, distance(vUv, uSunPos));
            sky += uSunColor * pow(halo, 2.2) * 0.85;
            float star = 0.0;
            if (uStars > 0.01) {
              vec2 grid = floor(vUv * vec2(260.0, 190.0));
              float seed = nhash(grid);
              float twinkle = 0.55 + 0.45 * sin(uTime * 2.2 + seed * 40.0);
              star = step(0.9955, seed) * twinkle * uStars * smoothstep(0.25, 1.0, vUv.y);
            }
            float alpha = uStrength * smoothstep(0.0, 0.35, vUv.y);
            gl_FragColor = vec4(sky + vec3(star), clamp(alpha + star, 0.0, 1.0));
          }
        `,
        transparent: true,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
      });
      material.name = 'NileAtmosphereShader';
      return material;
    },

    /* Столбы света от солнца — аддитивные мягкие клинья. */
    createGodrayMaterial(THREE, color = 0xffe9bb) {
      const uniforms = {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uStrength: { value: .22 },
      };
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
          varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uStrength;
          uniform vec3 uColor;
          varying vec2 vUv;
          void main(){
            float band = sin(vUv.x * 18.0 + uTime * 0.35) * 0.5 + 0.5;
            band = pow(band, 3.0);
            float fade = smoothstep(0.0, 0.45, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
            float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
            float alpha = band * fade * edge * uStrength;
            if (alpha < 0.003) discard;
            gl_FragColor = vec4(uColor, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        side: THREE.DoubleSide,
      });
      material.name = 'NileGodrayShader';
      return material;
    },

    /* Купол «Щита веры»: Френель, гранёная сетка и волна по поверхности. */
    createShieldMaterial(THREE, color = 0x8fe3d6) {
      const uniforms = {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uPulse: { value: 1 },
      };
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
          varying vec3 vNormalW;
          varying vec3 vWorld;
          varying vec2 vUv;
          void main(){
            vUv = uv;
            vNormalW = normalize(mat3(modelMatrix) * normal);
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorld = world.xyz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uPulse;
          uniform vec3 uColor;
          varying vec3 vNormalW;
          varying vec3 vWorld;
          varying vec2 vUv;
          void main(){
            vec3 viewDir = normalize(cameraPosition - vWorld);
            float fres = pow(clamp(1.0 - dot(normalize(vNormalW), viewDir), 0.0, 1.0), 2.4);
            vec2 cell = fract(vUv * vec2(16.0, 9.0)) - 0.5;
            float grid = smoothstep(0.46, 0.5, max(abs(cell.x), abs(cell.y)));
            float sweep = sin(vUv.y * 12.0 - uTime * 3.4) * 0.5 + 0.5;
            // Аддитивное смешивание быстро уходит в белое, поэтому купол
            // держим тонким: светится только кромка, центр почти прозрачен.
            float alpha = (fres * 0.40 + grid * 0.09 + sweep * 0.05) * uPulse;
            gl_FragColor = vec4(uColor * (0.32 + fres * 0.62), clamp(alpha, 0.0, 0.46));
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        side: THREE.FrontSide,
      });
      material.name = 'NileShieldShader';
      return material;
    },

    /* Материал частиц: круглые мягкие точки без текстуры. */
    createParticleMaterial(THREE, options = {}) {
      const uniforms = {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
        uSoft: { value: options.soft ?? 1 },
      };
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
          attribute float aSize;
          attribute float aAlpha;
          attribute vec3 aColor;
          uniform float uPixelRatio;
          varying float vAlpha;
          varying vec3 vColor;
          void main(){
            vAlpha = aAlpha;
            vColor = aColor;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * uPixelRatio * (260.0 / max(1.0, -mv.z));
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          uniform float uSoft;
          varying float vAlpha;
          varying vec3 vColor;
          void main(){
            vec2 d = gl_PointCoord - vec2(0.5);
            float r = length(d) * 2.0;
            if (r > 1.0) discard;
            float falloff = pow(1.0 - r, mix(1.0, 2.6, uSoft));
            gl_FragColor = vec4(vColor, vAlpha * falloff);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: options.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
        fog: false,
      });
      material.name = 'NileParticleShader';
      return material;
    },

    /* След корзинки: лента с бегущей пеной. */
    createWakeMaterial(THREE, color = 0xf6efd8) {
      const uniforms = {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uSpeed: { value: 1 },
        uStrength: { value: .55 },
      };
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
          varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uSpeed;
          uniform float uStrength;
          uniform vec3 uColor;
          varying vec2 vUv;
          ${NOISE}
          void main(){
            float along = vUv.y;
            float across = abs(vUv.x - 0.5) * 2.0;
            float bubbles = fbm(vec2(vUv.x * 8.0, vUv.y * 26.0 - uTime * uSpeed * 3.2));
            float edge = smoothstep(1.0, 0.35, across);
            float tail = smoothstep(0.0, 0.28, along) * smoothstep(1.0, 0.32, along);
            float alpha = bubbles * edge * tail * uStrength;
            if (alpha < 0.004) discard;
            gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 0.75));
          }
        `,
        transparent: true,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
      });
      material.name = 'NileWakeShader';
      return material;
    },

    /* Кольцо ряби на воде. */
    createRippleMaterial(THREE, color = 0xf1e7cb) {
      const uniforms = {
        uColor: { value: new THREE.Color(color) },
        uAlpha: { value: .5 },
      };
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
          varying vec2 vUv;
          void main(){
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          uniform float uAlpha;
          varying vec2 vUv;
          void main(){
            float r = length(vUv - vec2(0.5)) * 2.0;
            float ring = smoothstep(0.70, 0.90, r) * smoothstep(1.0, 0.90, r);
            float alpha = ring * uAlpha;
            if (alpha < 0.006) discard;
            gl_FragColor = vec4(uColor, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
      });
      material.name = 'NileRippleShader';
      return material;
    },

    /*
      Ветер для растительности. Вешается на MeshStandardMaterial через
      onBeforeCompile, работает и для InstancedMesh: смещение считается
      от мировой позиции экземпляра, поэтому кусты качаются вразнобой.
    */
    applyWind(THREE, material, timeUniform, windUniform, scale = 1) {
      const amount = { value: scale };
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uNileTime = timeUniform;
        shader.uniforms.uNileWind = windUniform;
        shader.uniforms.uNileWindScale = amount;
        shader.vertexShader = `uniform float uNileTime;\nuniform float uNileWind;\nuniform float uNileWindScale;\n${shader.vertexShader}`;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vec3 nileInstance = vec3(0.0);
           #ifdef USE_INSTANCING
             nileInstance = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
           #endif
           float nileHeight = max(transformed.y, 0.0);
           float nilePhase = uNileTime * 1.55 + nileInstance.x * 0.42 + nileInstance.z * 0.27;
           float nileGust = sin(nilePhase) * 0.62 + sin(nilePhase * 2.17 + 1.31) * 0.38;
           float nileWind = uNileWind * uNileWindScale;
           transformed.x += nileGust * nileWind * nileHeight * nileHeight * 0.052;
           transformed.z += cos(nilePhase * 0.83) * nileWind * nileHeight * nileHeight * 0.028;`,
        );
      };
      material.customProgramCacheKey = () => `nile-wind-${scale.toFixed(2)}`;
      material.userData.windScale = amount;
      return material;
    },

    /* Кромка прибоя вдоль берега: бегущая пена на узкой ленте. */
    createShorelineMaterial(THREE, color = 0xf6efdc) {
      const uniforms = Object.assign(fogUniforms(THREE), {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uStrength: { value: .5 },
      });
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
          varying vec2 vUv;
          #include <fog_pars_vertex>
          void main(){
            vUv = uv;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            #ifdef USE_FOG
              fogDepth = -mv.z;
            #endif
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uStrength;
          uniform vec3 uColor;
          varying vec2 vUv;
          #include <fog_pars_fragment>
          ${NOISE}
          void main(){
            float across = abs(vUv.x - 0.5) * 2.0;
            float surf = fbm(vec2(vUv.x * 3.0, vUv.y * 34.0 - uTime * 0.9));
            float tide = 0.5 + 0.5 * sin(uTime * 0.7 + vUv.y * 5.0);
            float band = smoothstep(1.0, 0.15, across);
            float alpha = pow(clamp(surf, 0.0, 1.0), 2.2) * band * uStrength * (0.65 + tide * 0.6);
            if (alpha < 0.006) discard;
            gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 0.7));
            #include <fog_fragment>
          }
        `,
        transparent: true,
        depthWrite: false,
        fog: true,
        side: THREE.DoubleSide,
      });
      material.name = 'NileShorelineShader';
      return material;
    },

    /* Свечение подбираемых предметов — мягкий ореол вокруг спрайта. */
    createHaloMaterial(THREE, color = 0xffe6a8) {
      const uniforms = {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uStrength: { value: .5 },
      };
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
          varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uStrength;
          uniform vec3 uColor;
          varying vec2 vUv;
          void main(){
            float r = length(vUv - vec2(0.5)) * 2.0;
            if (r > 1.0) discard;
            float core = pow(1.0 - r, 2.6);
            float pulse = 0.78 + 0.22 * sin(uTime * 3.1);
            gl_FragColor = vec4(uColor, core * uStrength * pulse);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        side: THREE.DoubleSide,
      });
      material.name = 'NileHaloShader';
      return material;
    },
  };

  window.NileShaders = api;
})();
