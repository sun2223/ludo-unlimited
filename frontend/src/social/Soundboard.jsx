import React from 'react';
import { SOUNDBOARD, EMOJIS } from '../../../shared/social.js';
export function Soundboard({ social, connected }) {
  return (
    <section className="panel social-panel" aria-label="Hinglish soundboard">
      <div className="panel-heading">
        <h3>
          Taang khinchai <span className="tiny-pill">LIVE</span>
        </h3>
        <span aria-hidden="true">♫</span>
      </div>
      <p className="social-intro">Same table wali feeling. Tap, tease, repeat.</p>
      <div className="soundboard-buttons">
        {SOUNDBOARD.map((item) => (
          <button
            key={item.key}
            type="button"
            disabled={!connected || social.sending || social.blocked}
            onClick={() => social.send('sound', item.key)}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
      <div className="emoji-buttons" aria-label="Emoji reactions">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={`Send ${emoji} reaction`}
            disabled={!connected || social.sending || social.blocked}
            onClick={() => social.send('emoji', emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
      <p className="social-status" role="status">
        {social.hint ||
          (social.blocked
            ? 'Banter bhej diya. Ab doston ki baari!'
            : 'Original sound effects · shared with your room')}
      </p>
    </section>
  );
}
