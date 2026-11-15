// Original synthesized chimes: no downloaded recordings or third-party sound assets.
export const SOUNDS = Object.freeze({
  reaction_dhoka: [
    [196, 0, 0.1],
    [196, 0.14, 0.15],
  ],
  reaction_ruk_ja: [
    [440, 0, 0.08],
    [370, 0.09, 0.08],
    [294, 0.18, 0.16],
  ],
  reaction_aayega: [
    [330, 0, 0.08],
    [392, 0.11, 0.08],
    [440, 0.22, 0.14],
  ],
  reaction_wah: [
    [587, 0, 0.08],
    [784, 0.1, 0.09],
    [988, 0.2, 0.14],
  ],
  reaction_sher: [
    [220, 0, 0.08],
    [330, 0.08, 0.08],
    [494, 0.16, 0.08],
    [660, 0.24, 0.16],
  ],
  reaction_game_over: [
    [392, 0, 0.1],
    [294, 0.12, 0.1],
    [196, 0.24, 0.2],
  ],
  dice: [
    [240, 0, 0.045],
    [330, 0.06, 0.045],
    [280, 0.12, 0.045],
    [400, 0.18, 0.06],
  ],
  step: [[640, 0, 0.045]],
  capture: [
    [740, 0, 0.09],
    [440, 0.08, 0.12],
    [260, 0.18, 0.13],
  ],
  six: [
    [523, 0, 0.1],
    [659, 0.09, 0.1],
    [784, 0.18, 0.16],
  ],
  turn: [
    [392, 0, 0.075],
    [523, 0.08, 0.1],
  ],
  win: [
    [523, 0, 0.13],
    [659, 0.13, 0.13],
    [784, 0.26, 0.13],
    [1047, 0.4, 0.35],
  ],
  chat: [
    [880, 0, 0.06],
    [1175, 0.08, 0.1],
  ],
});
export class SoundManager {
  constructor({ storage, createContext } = {}) {
    this.storage = storage;
    this.createContext =
      createContext ??
      (() => {
        const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
        return Context ? new Context() : null;
      });
    this.settings = {
      autoBanter: true,
      muted: false,
      volume: 0.35,
      ready: false,
      unavailable: false,
    };
    try {
      const stored = JSON.parse(this.getStorage()?.getItem('ludo-unlimited-audio') ?? 'null');
      if (stored) {
        this.settings.muted = stored.muted === true;
        this.settings.autoBanter = stored.autoBanter !== false;
        this.settings.volume = Number.isFinite(stored.volume)
          ? Math.min(1, Math.max(0, stored.volume))
          : 0.35;
      }
    } catch {
      /* Audio preferences are optional. */
    }
    this.eventIDs = new Set();
    this.listeners = new Set();
    this.voices = new Set();
  }
  getStorage() {
    return this.storage ?? globalThis.localStorage;
  }
  getSnapshot = () => this.settings;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  update(values) {
    this.settings = { ...this.settings, ...values };
    try {
      this.getStorage()?.setItem(
        'ludo-unlimited-audio',
        JSON.stringify({
          muted: this.settings.muted,
          volume: this.settings.volume,
          autoBanter: this.settings.autoBanter,
        }),
      );
    } catch {}
    if (this.master)
      this.master.gain.setTargetAtTime(
        this.settings.muted ? 0 : this.settings.volume,
        this.context.currentTime,
        0.015,
      );
    this.listeners.forEach((fn) => fn());
  }
  setAutoBanter(enabled) {
    this.update({ autoBanter: Boolean(enabled) });
  }
  playEvent(name, id) {
    if (typeof id !== 'string' || this.eventIDs.has(id)) return false;
    this.eventIDs.add(id);
    if (this.eventIDs.size > 1024) this.eventIDs.delete(this.eventIDs.values().next().value);
    return this.play(name);
  }
  setMuted(muted) {
    this.update({ muted: Boolean(muted) });
    if (muted) this.stopVoices();
  }
  setVolume(volume) {
    if (Number.isFinite(volume)) this.update({ volume: Math.min(1, Math.max(0, volume)) });
  }
  async unlock() {
    try {
      if (!this.context) {
        this.context = this.createContext();
        if (!this.context) {
          this.update({ unavailable: true });
          return false;
        }
        this.master = this.context.createGain();
        this.master.connect(this.context.destination);
        this.master.gain.value = this.settings.muted ? 0 : this.settings.volume;
      }
      if (this.context.state === 'suspended') await this.context.resume();
      const ready = this.context.state === 'running';
      if (this.settings.ready !== ready) this.update({ ready });
      return ready;
    } catch {
      return false;
    } // Autoplay denial must never affect the game.
  }
  bindGestures(target = document) {
    const unlock = () => {
      void this.unlock();
    };
    target.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    target.addEventListener('keydown', unlock, { capture: true });
    return () => {
      target.removeEventListener('pointerdown', unlock, true);
      target.removeEventListener('keydown', unlock, true);
      this.stopVoices();
    };
  }
  stopVoices() {
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {}
    }
    this.voices.clear();
  }
  play(name) {
    const notes = SOUNDS[name];
    if (
      !notes ||
      this.settings.muted ||
      this.settings.volume === 0 ||
      this.context?.state !== 'running' ||
      globalThis.document?.hidden
    )
      return false;
    try {
      const start = this.context.currentTime;
      for (const [frequency, delay, duration] of notes) {
        const oscillator = this.context.createOscillator(),
          envelope = this.context.createGain();
        oscillator.type = name === 'dice' ? 'triangle' : 'sine';
        oscillator.frequency.setValueAtTime(frequency, start + delay);
        envelope.gain.setValueAtTime(0, start + delay);
        envelope.gain.linearRampToValueAtTime(name === 'step' ? 0.12 : 0.18, start + delay + 0.008);
        envelope.gain.exponentialRampToValueAtTime(0.0001, start + delay + duration);
        oscillator.connect(envelope);
        envelope.connect(this.master);
        this.voices.add(oscillator);
        oscillator.onended = () => {
          this.voices.delete(oscillator);
          oscillator.disconnect();
          envelope.disconnect();
        };
        oscillator.start(start + delay);
        oscillator.stop(start + delay + duration + 0.015);
      }
      return true;
    } catch {
      return false;
    }
  }
}
export const soundManager = new SoundManager();
