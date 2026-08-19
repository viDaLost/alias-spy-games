(() => {
  'use strict';
  if (window.__mosesV734Installed || !window.THREE) return;
  window.__mosesV734Installed = true;

  const personState = new WeakMap();
  const crocState = new WeakMap();
  let lastNow = performance.now();
  let lastDistance = Number(document.getElementById('dist-txt')?.textContent || 0);

  function expLerp(current, target, speed, dt) {
    const k = 1 - Math.exp(-speed * Math.max(0, dt));
    return current + (target - current) * k;
  }

  function ensurePerson(person, index) {
    if (personState.has(person)) return personState.get(person);
    const state = {
      homeX: Number(person.userData?.v733HomeX ?? person.position.x),
      homeY: Number(person.userData?.v733HomeY ?? person.position.y),
      facing: Number(person.userData?.v733BaseRotationY ?? person.rotation.y),
      displayZ: person.position.z,
      targetZ: person.position.z,
      lastOutputZ: person.position.z,
      phase: Number(person.userData?.v733Phase ?? index * .79),
      behavior: person.userData?.v733Behavior || ['wave','point','walk','cheer','carry','bow'][index % 6],
      nextGesture: performance.now() + 650 + (index % 4) * 480 + Math.random() * 900,
      gestureStart: 0,
      gestureDuration: 2200 + (index % 3) * 250,
    };
    person.userData.v734Managed = true;
    personState.set(person, state);
    return state;
  }

  function syncPersonZ(person, state, dt, extraAdvance = 0) {
    const observed = Number(person.position.z);
    const delta = observed - state.lastOutputZ;
    if (Number.isFinite(delta) && Math.abs(delta) > .0001) {
      if (Math.abs(delta) > 80) {
        state.targetZ += delta;
        state.displayZ += delta;
      } else {
        state.targetZ += delta;
      }
    }
    if (extraAdvance > 0) state.targetZ += extraAdvance;
    if (state.targetZ > 30) {
      state.targetZ -= 260;
      state.displayZ -= 260;
    }
    state.displayZ = expLerp(state.displayZ, state.targetZ, 8.5, dt);
    person.position.z = state.displayZ;
    state.lastOutputZ = state.displayZ;
  }

  function gestureEnvelope(state, now) {
    if (!state.gestureStart && now >= state.nextGesture) state.gestureStart = now;
    if (!state.gestureStart) return 0;
    const elapsed = now - state.gestureStart;
    if (elapsed >= state.gestureDuration) {
      state.gestureStart = 0;
      state.nextGesture = now + 1800 + Math.random() * 4300;
      return 0;
    }
    const p = elapsed / state.gestureDuration;
    return Math.min(1, p * 5, (1 - p) * 5);
  }

  function animateVisibleArm(person, state, now, amount) {
    const inward = state.homeX < 0 ? 1 : -1;
    const t = now * .001 + state.phase;
    const behavior = state.behavior;
    const arm = person.userData?.v731WaveArm;
    const elbow = person.userData?.v731WaveElbow;
    const bone = person.userData?.waveBone;
    const base = person.userData?.waveBase;
    let lift = 0, sweep = 0, elbowBend = .32;

    if (behavior === 'wave') {
      lift = amount * 1.05;
      sweep = Math.sin(t * 7.2) * .32 * amount;
      elbowBend = .45 + Math.sin(t * 7.2 + .8) * .18;
    } else if (behavior === 'point') {
      lift = .72 + amount * .12;
      sweep = Math.sin(t * 1.1) * .06;
      elbowBend = .10;
    } else if (behavior === 'cheer') {
      lift = .92 + amount * .18;
      sweep = Math.sin(t * 4.5) * .12;
      elbowBend = .22;
    } else if (behavior === 'carry') {
      lift = .18;
      elbowBend = .62;
    } else {
      lift = .08 + amount * .10;
      sweep = Math.sin(t * 1.5) * .04;
    }

    if (arm && elbow) {
      arm.rotation.x = -.08 - lift * .22;
      arm.rotation.y = 0;
      arm.rotation.z = inward * (-.62 - lift * .74 + sweep);
      elbow.rotation.x = 0;
      elbow.rotation.y = 0;
      elbow.rotation.z = inward * elbowBend;
    } else if (bone && base) {
      bone.rotation.copy(base);
      bone.rotation.x = base.x - lift * .88;
      bone.rotation.z = base.z + (person.userData.waveSide || inward) * (.18 + lift * .58 + sweep);
    }
  }

  function animatePerson(person, state, now, dt, extraAdvance) {
    syncPersonZ(person, state, dt, extraAdvance);
    const t = now * .001 + state.phase;
    const amount = gestureEnvelope(state, now);
    const behavior = state.behavior;
    let x = state.homeX, y = state.homeY, rx = 0, ry = state.facing, rz = 0;

    if (behavior === 'walk') {
      x += Math.sin(t * .68) * .48;
      y += Math.abs(Math.sin(t * 2.7)) * .025;
      ry += Math.sin(t * .68) * .10;
      rz = Math.sin(t * 2.7) * .009;
    } else if (behavior === 'cheer') {
      y += Math.abs(Math.sin(t * 2.8)) * .038;
      rz = Math.sin(t * 2.8) * .012;
    } else if (behavior === 'point') {
      ry += (state.homeX < 0 ? -.10 : .10) + Math.sin(t * .65) * .015;
    } else if (behavior === 'bow') {
      const cycle = .5 + .5 * Math.sin(t * .58);
      rx = cycle > .76 ? -.18 * ((cycle - .76) / .24) : 0;
    } else if (behavior === 'carry') {
      x += Math.sin(t * .38) * .16;
      rz = Math.sin(t * 1.9) * .008;
    } else {
      y += Math.sin(t * 1.1) * .006;
    }

    person.position.x = expLerp(person.position.x, x, 10, dt);
    person.position.y = expLerp(person.position.y, y, 10, dt);
    person.rotation.x = expLerp(person.rotation.x, rx, 9, dt);
    person.rotation.y = expLerp(person.rotation.y, ry, 9, dt);
    person.rotation.z = expLerp(person.rotation.z, rz, 9, dt);
    animateVisibleArm(person, state, now, amount);
  }

  function ensureCroc(item) {
    if (crocState.has(item)) return crocState.get(item);
    const model = item.userData?.v733Model || item.children?.find?.((child) => child && !child.userData?.v733Wake) || item.children?.[0];
    const state = {
      model,
      baseX: Number(item.userData?.v733BaseX ?? item.position.x),
      phase: Number(item.userData?.v733Phase ?? Math.random() * Math.PI * 2),
    };
    item.userData.v734FacingPlayer = true;
    crocState.set(item, state);
    return state;
  }

  function animateCroc(item, state, now, dt) {
    const t = now * .001 + state.phase;
    const lateral = Math.sin(t * 1.05) * .38;
    const yaw = Math.sin(t * 1.05) * .075;
    item.position.x = expLerp(item.position.x, state.baseX + lateral, 8, dt);
    item.rotation.x = expLerp(item.rotation.x, 0, 8, dt);
    item.rotation.y = expLerp(item.rotation.y, 0, 8, dt);
    item.rotation.z = expLerp(item.rotation.z, Math.sin(t * 2.1) * .012, 8, dt);

    const model = state.model;
    if (model) {
      // Source GLB faces away at PI. Zero faces the basket/player.
      model.rotation.y = yaw;
      model.rotation.x = Math.sin(t * 2.7) * .018;
      model.rotation.z = Math.sin(t * 2.25 + .7) * .018;
      model.position.y = -.18 + Math.sin(t * 3.0) * .035;
    }

    const wake = item.userData?.v733Wake;
    if (wake?.children) {
      wake.position.z = -.18;
      wake.children.forEach((streak, index) => {
        const pulse = .5 + .5 * Math.sin(t * 4.7 + index * 2.1);
        streak.material.opacity = .10 + pulse * .16;
        streak.scale.x = .95 + pulse * .48;
        streak.position.z = -1.18 - pulse * .28;
      });
    }
  }

  function updateBadge(scene) {
    const badge = document.getElementById('version-badge');
    if (!badge) return;
    const count = scene.children.filter((node) => node?.userData?.v73Person).length;
    badge.dataset.state = 'ready';
    badge.textContent = `V7.3.4 · PEOPLE SMOOTH · CROCS FACE YOU · ${count}`;
  }

  function frame(now) {
    const scene = window.__mosesV73Scene;
    const dt = Math.min(.05, Math.max(.001, (now - lastNow) / 1000));
    lastNow = now;
    const distance = Number(document.getElementById('dist-txt')?.textContent || 0);
    const advance = Math.max(0, Math.min(3, distance - lastDistance));
    lastDistance = distance;

    if (scene) {
      scene.children.filter((node) => node?.userData?.v73Person).forEach((person, index) => {
        const extraAdvance = person.userData?.v733Extra ? advance : 0;
        animatePerson(person, ensurePerson(person, index), now, dt, extraAdvance);
      });
      scene.children.forEach((node) => {
        if (node?.userData?.v73Croc) animateCroc(node, ensureCroc(node), now, dt);
      });
      updateBadge(scene);
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();