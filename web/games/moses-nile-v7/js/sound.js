/*
  Моисей: Путь по Нилу — звук.

  Всё синтезируется в WebAudio, ни одного загружаемого файла: шум реки,
  ветер, процедурная музыка в ладу хиджаз и набор эффектов. Публичные имена
  playCollect / playPowerup / playSplash / playHit сохранены — на них
  завязаны внешние проверки и старые вызовы.
*/
class GameAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.ambienceBus = null;
    this.riverGain = null;
    this.windGain = null;
    this.intensity = 0;
    this.musicTimer = 0;
    this.nextNoteTime = 0;
    this.step = 0;
    this.tempo = 96;
    this.musicEnabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      try {
        this.ctx = new AudioContext();
      } catch {
        this.ctx = null;
        return;
      }
      this._buildBuses();
      this._startAmbience();
      this._startMusic();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _buildBuses() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? .85 : 0;
    this.master.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBus.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = .0;
    const musicShelf = ctx.createBiquadFilter();
    musicShelf.type = 'lowpass';
    musicShelf.frequency.value = 3200;
    this.musicBus.connect(musicShelf);
    musicShelf.connect(this.master);

    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = .0;
    this.ambienceBus.connect(this.master);
  }

  _noiseBuffer(seconds = 2) {
    const ctx = this.ctx;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + .022 * white) / 1.022;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  _startAmbience() {
    const ctx = this.ctx;
    const buffer = this._noiseBuffer(3);

    const river = ctx.createBufferSource();
    river.buffer = buffer;
    river.loop = true;
    const riverFilter = ctx.createBiquadFilter();
    riverFilter.type = 'bandpass';
    riverFilter.frequency.value = 620;
    riverFilter.Q.value = .55;
    this.riverGain = ctx.createGain();
    this.riverGain.gain.value = .22;
    river.connect(riverFilter);
    riverFilter.connect(this.riverGain);
    this.riverGain.connect(this.ambienceBus);
    river.start();
    this.riverFilter = riverFilter;

    const wind = ctx.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 340;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = .12;
    wind.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.ambienceBus);
    wind.start();

    // Медленное «дыхание» реки, чтобы шум не был статичным.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = .07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 170;
    lfo.connect(lfoGain);
    lfoGain.connect(riverFilter.frequency);
    lfo.start();

    this.ambienceBus.gain.setTargetAtTime(.6, ctx.currentTime, 1.4);
  }

  /* Лад хиджаз: даёт узнаваемое ближневосточное звучание. */
  _scale() {
    return [0, 1, 4, 5, 7, 8, 11];
  }

  _startMusic() {
    if (this.musicTimer) return;
    this.nextNoteTime = this.ctx.currentTime + .12;
    this.step = 0;
    this.musicTimer = setInterval(() => this._scheduleMusic(), 60);
  }

  _scheduleMusic() {
    if (!this.ctx || !this.musicEnabled) return;
    const ctx = this.ctx;
    const secondsPerStep = 60 / this.tempo / 2;
    while (this.nextNoteTime < ctx.currentTime + .35) {
      this._playStep(this.step, this.nextNoteTime);
      this.nextNoteTime += secondsPerStep;
      this.step += 1;
    }
  }

  _playStep(step, time) {
    const scale = this._scale();
    const root = 146.83; // Re
    const bar = Math.floor(step / 16);
    const beat = step % 16;
    const intensity = this.intensity;

    if (beat === 0) {
      this._drone(root / 2, time, 16 * (60 / this.tempo / 2), .10 + intensity * .05);
    }
    if (beat % 2 === 0) {
      const pattern = [0, 4, 2, 6, 3, 5, 2, 1];
      const degree = pattern[(beat / 2 + bar) % pattern.length];
      const octave = degree > 4 ? 2 : 1;
      const semitone = scale[degree % scale.length];
      const freq = root * octave * Math.pow(2, semitone / 12);
      this._pluck(freq, time, .17 + intensity * .10);
    }
    if (intensity > .28 && (beat === 0 || beat === 6 || beat === 10)) {
      this._frameDrum(time, beat === 0 ? .9 : .5, intensity);
    }
    if (intensity > .58 && beat === 12) {
      this._frameDrum(time + .06, .35, intensity);
    }
  }

  _drone(freq, time, duration, gainValue) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(gainValue, time + .8);
    gain.gain.linearRampToValueAtTime(0, time + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);
    osc.start(time);
    osc.stop(time + duration + .05);
  }

  _pluck(freq, time, gainValue) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    const body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(freq * 2, time);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(gainValue, time + .012);
    gain.gain.exponentialRampToValueAtTime(.0008, time + .62);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(gainValue * .22, time);
    bodyGain.gain.exponentialRampToValueAtTime(.0006, time + .28);
    osc.connect(gain);
    body.connect(bodyGain);
    gain.connect(this.musicBus);
    bodyGain.connect(this.musicBus);
    osc.start(time);
    body.start(time);
    osc.stop(time + .66);
    body.stop(time + .32);
  }

  _frameDrum(time, strength, intensity) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(168, time);
    osc.frequency.exponentialRampToValueAtTime(52, time + .16);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(.30 * strength * (.6 + intensity * .6), time);
    gain.gain.exponentialRampToValueAtTime(.001, time + .22);
    osc.connect(gain);
    gain.connect(this.musicBus);
    osc.start(time);
    osc.stop(time + .24);
  }

  /* Игра сообщает, насколько «горячо» сейчас: скорость, биом, комбо. */
  setIntensity(value) {
    if (!this.ctx) return;
    this.intensity = Math.max(0, Math.min(1, value));
    this.musicBus.gain.setTargetAtTime(.16 + this.intensity * .22, this.ctx.currentTime, .8);
    this.tempo = 90 + this.intensity * 34;
    if (this.riverFilter) {
      this.riverFilter.frequency.setTargetAtTime(560 + this.intensity * 520, this.ctx.currentTime, .9);
    }
    if (this.riverGain) {
      this.riverGain.gain.setTargetAtTime(.18 + this.intensity * .20, this.ctx.currentTime, .7);
    }
    if (this.windGain) {
      this.windGain.gain.setTargetAtTime(.09 + this.intensity * .14, this.ctx.currentTime, 1.1);
    }
  }

  setMenuMode(isMenu) {
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(isMenu ? .10 : .22, this.ctx.currentTime, .9);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(enabled ? .85 : 0, this.ctx.currentTime, .12);
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _tone({ type = 'sine', from, to, time, duration, gain = .2, target = null, curve = 'exp' }) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, time);
    if (to && to !== from) {
      if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), time + duration);
      else osc.frequency.linearRampToValueAtTime(to, time + duration);
    }
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, time);
    amp.gain.linearRampToValueAtTime(gain, time + .012);
    amp.gain.exponentialRampToValueAtTime(.0008, time + duration);
    osc.connect(amp);
    amp.connect(target || this.sfxBus);
    osc.start(time);
    osc.stop(time + duration + .02);
    return osc;
  }

  _noiseHit({ time, duration = .18, gain = .18, type = 'lowpass', frequency = 900, sweepTo = null }) {
    const ctx = this.ctx;
    const size = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, time);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), time + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, time);
    amp.gain.exponentialRampToValueAtTime(.0006, time + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.sfxBus);
    source.start(time);
  }

  /* Подбор лотоса: чем длиннее комбо, тем выше нота. */
  playCollect(step = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19];
    const semitone = scale[Math.min(step, scale.length - 1)];
    const base = 523.25 * Math.pow(2, semitone / 12);
    this._tone({ type: 'triangle', from: base, to: base * 1.5, time: now, duration: .18, gain: .16 });
    this._tone({ type: 'sine', from: base * 2, to: base * 2.6, time: now + .02, duration: .14, gain: .07 });
  }

  playPowerup() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [440, 554.37, 659.25, 880, 1108.7].forEach((freq, i) => {
      this._tone({ type: 'sine', from: freq, to: freq * 1.02, time: now + i * .055, duration: .22, gain: .13 });
    });
  }

  playSplash() {
    if (!this.ctx) return;
    this._noiseHit({ time: this.ctx.currentTime, duration: .16, gain: .13, type: 'lowpass', frequency: 1400, sweepTo: 260 });
  }

  playHit() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._tone({ type: 'sawtooth', from: 165, to: 32, time: now, duration: .42, gain: .30 });
    this._noiseHit({ time: now, duration: .34, gain: .24, type: 'lowpass', frequency: 900, sweepTo: 120 });
  }

  playShieldBreak() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._tone({ type: 'square', from: 880, to: 220, time: now, duration: .3, gain: .14 });
    this._noiseHit({ time: now, duration: .28, gain: .16, type: 'highpass', frequency: 1800 });
  }

  playJump() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._tone({ type: 'sine', from: 300, to: 620, time: now, duration: .2, gain: .12 });
    this._noiseHit({ time: now, duration: .2, gain: .10, type: 'bandpass', frequency: 900, sweepTo: 2200 });
  }

  playDive() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._tone({ type: 'sine', from: 520, to: 180, time: now, duration: .26, gain: .12 });
    this._noiseHit({ time: now, duration: .3, gain: .14, type: 'lowpass', frequency: 700, sweepTo: 160 });
  }

  playNearMiss() {
    if (!this.ctx) return;
    this._noiseHit({ time: this.ctx.currentTime, duration: .24, gain: .09, type: 'bandpass', frequency: 2600, sweepTo: 420 });
  }

  playGrowl() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this._tone({ type: 'sawtooth', from: 92, to: 58, time: now, duration: .5, gain: .10 });
  }

  playMilestone() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      this._tone({ type: 'triangle', from: freq, to: freq, time: now + i * .085, duration: .45, gain: .12 });
    });
  }

  playGameOver() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [392, 349.23, 311.13, 261.63].forEach((freq, i) => {
      this._tone({ type: 'triangle', from: freq, to: freq * .995, time: now + i * .19, duration: .7, gain: .13 });
    });
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(.05, now, .5);
  }

  playStart() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [261.63, 349.23, 523.25].forEach((freq, i) => {
      this._tone({ type: 'triangle', from: freq, to: freq * 1.01, time: now + i * .09, duration: .5, gain: .13 });
    });
  }
}
window.gameAudio = new GameAudio();
