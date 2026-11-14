import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundManager, SOUNDS } from '../src/audio/SoundManager.js';
function audio() {
  const calls = [],
    store = new Map();
  let resumed = 0;
  const param = {
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
  };
  const context = {
    state: 'suspended',
    currentTime: 1,
    destination: {},
    resume: async () => {
      resumed++;
      context.state = 'running';
    },
    createGain: () => ({ gain: { ...param }, connect() {}, disconnect() {} }),
    createOscillator: () => ({
      frequency: { ...param, setValueAtTime: (...args) => calls.push(args) },
      connect() {},
      disconnect() {},
      start() {},
      stop() {},
    }),
  };
  const storage = {
    getItem: (key) => store.get(key),
    setItem: (key, value) => store.set(key, value),
  };
  return {
    calls,
    context,
    storage,
    manager: new SoundManager({ storage, createContext: () => context }),
    resumed: () => resumed,
  };
}
test('autoplay is silent until a gesture unlocks audio; original cues schedule the expected notes', async () => {
  const h = audio();
  assert.equal(h.manager.play('step'), false);
  assert.equal(h.resumed(), 0);
  assert.equal(await h.manager.unlock(), true);
  assert.equal(h.resumed(), 1);
  for (const name of Object.keys(SOUNDS)) {
    const before = h.calls.length;
    assert.equal(h.manager.play(name), true);
    assert.deepEqual(
      h.calls.slice(before).map((c) => c[0]),
      SOUNDS[name].map((note) => note[0]),
    );
  }
});
test('mute/volume persist, clamp values and silence scheduled voices', async () => {
  const h = audio();
  await h.manager.unlock();
  h.manager.play('win');
  assert.ok(h.manager.voices.size);
  h.manager.setMuted(true);
  assert.equal(h.manager.voices.size, 0);
  assert.equal(h.manager.play('chat'), false);
  h.manager.setVolume(9);
  assert.equal(h.manager.settings.volume, 1);
  h.manager.setVolume(-1);
  assert.equal(h.manager.settings.volume, 0);
  h.manager.setVolume(0.22);
  const restored = new SoundManager({ storage: h.storage });
  assert.equal(restored.settings.muted, true);
  assert.equal(restored.settings.volume, 0.22);
  h.manager.setMuted(false);
  assert.equal(h.manager.play('chat'), true);
});
test('unsupported or blocked audio never throws or queues stale effects', async () => {
  const unsupported = new SoundManager({ createContext: () => null });
  assert.equal(await unsupported.unlock(), false);
  assert.equal(unsupported.play('win'), false);
  const h = audio();
  h.context.resume = async () => {
    throw new Error('autoplay denied');
  };
  assert.equal(await h.manager.unlock(), false);
  assert.equal(h.manager.play('step'), false);
  assert.equal(h.calls.length, 0);
});
