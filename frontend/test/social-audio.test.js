import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundManager } from '../src/audio/SoundManager.js';
test('event audio is consumed once, including muted and autoplay-blocked arrivals', () => {
  const manager = new SoundManager({ createContext: () => null });
  let played = 0;
  manager.play = () => {
    played++;
    return false;
  };
  assert.equal(manager.playEvent('reaction_dhoka', 'event-a'), false);
  manager.playEvent('reaction_dhoka', 'event-a');
  assert.equal(played, 1);
  manager.playEvent('reaction_wah', 'event-b');
  assert.equal(played, 2);
});
test('auto-banter preference is saved independently of global mute and volume', () => {
  const memory = new Map(),
    storage = { getItem: (k) => memory.get(k), setItem: (k, v) => memory.set(k, v) };
  const manager = new SoundManager({ storage });
  manager.setAutoBanter(false);
  manager.setVolume(0.24);
  const restored = new SoundManager({ storage });
  assert.equal(restored.settings.autoBanter, false);
  assert.equal(restored.settings.muted, false);
  assert.equal(restored.settings.volume, 0.24);
});
