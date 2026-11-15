import React, { useSyncExternalStore } from 'react';
import { soundManager } from './SoundManager.js';
export function SoundControls() {
  const settings = useSyncExternalStore(soundManager.subscribe, soundManager.getSnapshot);
  return (
    <details className="sound-controls">
      <summary aria-label="Sound settings" title="Sound settings">
        <span aria-hidden="true">{settings.muted ? '♩' : '♫'}</span>
        <span className="sound-summary">{settings.muted ? 'Muted' : 'Sound'}</span>
      </summary>
      <div className="sound-popover">
        <div>
          <b>Game sounds</b>
          <button
            type="button"
            aria-label={settings.muted ? 'Unmute sound' : 'Mute sound'}
            aria-pressed={settings.muted}
            onClick={() => {
              void soundManager.unlock();
              soundManager.setMuted(!settings.muted);
            }}
          >
            {settings.muted ? 'Unmute' : 'Mute'}
          </button>
        </div>
        <label className="banter-toggle">
          <span>Automatic banter</span>
          <input
            type="checkbox"
            aria-label="Automatic banter"
            checked={settings.autoBanter}
            onChange={(event) => soundManager.setAutoBanter(event.target.checked)}
          />
        </label>
        <label htmlFor="game-volume">
          Volume <output>{Math.round(settings.volume * 100)}%</output>
        </label>
        <input
          id="game-volume"
          aria-label="Sound volume"
          type="range"
          min="0"
          max="100"
          value={Math.round(settings.volume * 100)}
          onChange={(event) => soundManager.setVolume(Number(event.target.value) / 100)}
        />
        <p>
          {settings.unavailable
            ? 'Audio is unavailable in this browser.'
            : 'Soft chimes. A little extra good luck.'}
        </p>
      </div>
    </details>
  );
}
