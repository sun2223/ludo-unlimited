import React from 'react';
import { SoundControls } from '../audio/SoundControls.jsx';
import { Icon, Die } from './Icons.jsx';
export function Header({ connected, showRules }) {
  return (
    <header className="header">
      <a className="brand" href="/" aria-label="Ludo Unlimited home">
        <span className="brand-mark">
          <Die value={4} small />
        </span>
        <span>
          LUDO
          <span className="brand-second">
            UNLIMITED <span>∞</span>
          </span>
        </span>
      </a>
      <nav>
        <SoundControls />
        <button className="text-button" onClick={showRules}>
          How to play <span className="question-mark">?</span>
        </button>
        <span className={`connection ${connected ? 'is-online' : ''}`} role="status">
          <i />
          {connected ? 'Ready to connect' : 'Connecting…'}
        </span>
      </nav>
    </header>
  );
}
