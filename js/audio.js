/**
 * Аудио — атмосферная музыка и звуковые эффекты (Web Audio API)
 */

const Audio = {
  ctx: null,
  masterGain: null,
  musicGain: null,
  sfxGain: null,
  muted: false,
  musicPlaying: false,
  musicNodes: [],
  musicInterval: null,
  initialized: false,

  init() {
    if (this.initialized) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.6;
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.25;
    this.musicGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.sfxGain.connect(this.masterGain);

    this.initialized = true;
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.6, this.ctx.currentTime, 0.1);
    }
    return this.muted;
  },

  // --- Фоновая музыка ---

  startMusic() {
    if (!this.initialized || this.musicPlaying) return;
    this.musicPlaying = true;
    this._startDrone();
    this._startMelodyLoop();
  },

  stopMusic() {
    this.musicPlaying = false;
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
    this.musicNodes.forEach(n => {
      try { n.stop(); } catch (_) {}
      try { n.disconnect(); } catch (_) {}
    });
    this.musicNodes = [];
  },

  _startDrone() {
    const freqs = [55, 82.5, 110];
    freqs.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      gain.gain.value = 0.04 / (i + 1);
      filter.type = 'lowpass';
      filter.frequency.value = 300;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);
      osc.start();

      this.musicNodes.push(osc);

      // Медленное покачивание
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 0.05 + i * 0.02;
      lfoGain.gain.value = 2;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();
      this.musicNodes.push(lfo);
    });
  },

  _startMelodyLoop() {
    const pentatonic = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];

    const playNote = () => {
      if (!this.musicPlaying || this.muted) return;
      const freq = pentatonic[Math.floor(Math.random() * pentatonic.length)];
      this._playTone(freq, 0.06, 1.2 + Math.random() * 2, 'sine', this.musicGain);
    };

    this.musicInterval = setInterval(playNote, 3000 + Math.random() * 4000);
    setTimeout(playNote, 1500);
  },

  setMusicIntensity(intensity) {
    if (this.musicGain) {
      const vol = 0.15 + intensity * 0.15;
      this.musicGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.5);
    }
  },

  // --- Звуковые эффекты ---

  play(name) {
    if (!this.initialized || this.muted) return;
    this.resume();

    switch (name) {
      case 'step': this._sfxStep(); break;
      case 'key': this._sfxKey(); break;
      case 'crystal': this._sfxCrystal(); break;
      case 'door': this._sfxDoor(); break;
      case 'trap': this._sfxTrap(); break;
      case 'level': this._sfxLevel(); break;
      case 'victory': this._sfxVictory(); break;
      case 'defeat': this._sfxDefeat(); break;
      case 'ui': this._sfxUI(); break;
      case 'chest': this._sfxChest(); break;
      case 'powerup': this._sfxPowerup(); break;
      case 'secret': this._sfxSecret(); break;
      case 'guard': this._sfxGuard(); break;
      case 'life': this._sfxLife(); break;
    }
  },

  _playTone(freq, volume, duration, type, destination) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(destination || this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  },

  _sfxStep() {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.05, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.3));
    }
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    src.buffer = buf;
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    gain.gain.value = 0.08;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start();
  },

  _sfxKey() {
    [523, 659, 784].forEach((f, i) => {
      setTimeout(() => this._playTone(f, 0.12, 0.4, 'sine'), i * 80);
    });
  },

  _sfxCrystal() {
    [880, 1108, 1318, 1568].forEach((f, i) => {
      setTimeout(() => this._playTone(f, 0.08, 0.25, 'triangle'), i * 50);
    });
  },

  _sfxDoor() {
    // Скрип
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(80, this.ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.5);

    setTimeout(() => this._playTone(392, 0.1, 0.5, 'sine'), 200);
  },

  _sfxTrap() {
    this._playTone(80, 0.2, 0.4, 'square');
    setTimeout(() => this._playTone(60, 0.15, 0.3, 'sawtooth'), 100);
  },

  _sfxLevel() {
    [392, 523, 659, 784].forEach((f, i) => {
      setTimeout(() => this._playTone(f, 0.1, 0.35, 'sine'), i * 120);
    });
  },

  _sfxVictory() {
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((f, i) => {
      setTimeout(() => this._playTone(f, 0.12, 0.5, 'sine'), i * 150);
    });
  },

  _sfxDefeat() {
    [392, 330, 262, 196].forEach((f, i) => {
      setTimeout(() => this._playTone(f, 0.12, 0.6, 'triangle'), i * 200);
    });
  },

  _sfxUI() {
    this._playTone(440, 0.08, 0.15, 'sine');
  },

  _sfxChest() {
    [330, 440, 554].forEach((f, i) => {
      setTimeout(() => this._playTone(f, 0.1, 0.3, 'square'), i * 60);
    });
  },

  _sfxPowerup() {
    [440, 554, 659, 880].forEach((f, i) => {
      setTimeout(() => this._playTone(f, 0.07, 0.2, 'triangle'), i * 40);
    });
  },

  _sfxSecret() {
    [523, 659, 784, 988].forEach((f, i) => {
      setTimeout(() => this._playTone(f, 0.08, 0.35, 'sine'), i * 100);
    });
  },

  _sfxLife() {
    [392, 494, 587, 784].forEach((f, i) => {
      setTimeout(() => this._playTone(f, 0.1, 0.4, 'sine'), i * 80);
    });
  },

  _sfxGuard() {
    this._playTone(90, 0.18, 0.35, 'sawtooth');
    setTimeout(() => this._playTone(70, 0.15, 0.4, 'square'), 120);
    setTimeout(() => this._playTone(110, 0.1, 0.25, 'triangle'), 250);
  },
};
