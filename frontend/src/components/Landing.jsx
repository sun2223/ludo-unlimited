import React, { useState } from 'react';
import { Board } from './Board.jsx';
import { Icon, Die } from './Icons.jsx';
export function Landing({ api }) {
  const [tab, setTab] = useState(
      new URLSearchParams(location.search).has('room') ? 'join' : 'create',
    ),
    [name, setName] = useState(''),
    [code, setCode] = useState(new URLSearchParams(location.search).get('room')?.slice(0, 6) ?? '');
  function enter(event) {
    event.preventDefault();
    api.run(tab === 'create' ? 'room:create' : 'room:join', { name, code });
  }
  return (
    <main className="landing">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="short-line" /> FAR APART. SAME TABLE.
          </p>
          <h1>
            Good friends.
            <br />
            Great rivalries.
            <br />
            <em>One more game.</em>
          </h1>
          <p className="hero-description">
            Your favorite game night, without the distance.
            <br className="desktop-break" /> A private table for your people. As many rounds as you
            like.
          </p>
          <div className="entry-card">
            <div className="tabs" role="tablist" aria-label="Room options">
              <button role="tab" aria-selected={tab === 'create'} onClick={() => setTab('create')}>
                Create a room <span>↗</span>
              </button>
              <button role="tab" aria-selected={tab === 'join'} onClick={() => setTab('join')}>
                Join friends <Icon name="people" size={15} />
              </button>
            </div>
            <form onSubmit={enter}>
              <label htmlFor="nickname">WHAT SHOULD WE CALL YOU?</label>
              <input
                id="nickname"
                autoComplete="nickname"
                placeholder="Your nickname"
                minLength={2}
                maxLength={20}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {tab === 'join' && (
                <>
                  <label htmlFor="room-code-input">YOUR INVITE CODE</label>
                  <input
                    id="room-code-input"
                    className="code-input"
                    placeholder="ABC234"
                    minLength={6}
                    maxLength={6}
                    autoCapitalize="characters"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                  />
                </>
              )}
              <button className="primary full" disabled={!api.connected || api.busy}>
                {api.busy
                  ? 'Pulling up a chair…'
                  : tab === 'create'
                    ? 'Let’s set the table'
                    : 'Take your seat'}
                <Icon name="arrow" />
              </button>
              <p className="entry-caption">
                <Icon name="lock" size={12} />
                {tab === 'create'
                  ? 'Private by default. Just share your room code.'
                  : 'No account needed. Just your name and an invite.'}
              </p>
            </form>
          </div>
          <div className="guest-note">
            <span className="avatar-stack">
              <i>A</i>
              <i>B</i>
              <i>C</i>
            </span>
            <span>
              2–4 friends <span className="dot-separator">·</span> No sign-up{' '}
              <span className="dot-separator">·</span> Always free to rematch
            </span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="floating-note">
            <span className="small-spark">✦</span> A little luck. A lot of laughter.
          </div>
          <div className="preview-table">
            <div className="preview-toolbar">
              <span>
                <i className="live-dot" /> THE TABLE IS ALWAYS OPEN
              </span>
              <Icon name="infinity" size={21} />
            </div>
            <Board preview />
            <div className="preview-footer">
              <span>
                <i className="seat-dot coral-bg" /> YOU
              </span>
              <span className="ready-text">Good company. Endless possibilities.</span>
              <span className="decor-dice">
                <Die value={6} small />
              </span>
            </div>
          </div>
          <div className="visual-caption">
            <span className="handwritten-arrow">↳</span> Same classic game. A whole new place to
            hang out.
          </div>
        </div>
      </section>
      <section className="features" aria-label="Why Ludo Unlimited">
        {[
          {
            icon: 'infinity',
            title: 'No last round.',
            text: 'No daily limits. No waiting for tomorrow.',
          },
          {
            icon: 'globe',
            title: 'Distance is just a number.',
            text: 'Different cities. One very competitive table.',
          },
          {
            icon: 'people',
            title: 'Your friends. Your room.',
            text: 'An invite code is all it takes to get together.',
          },
        ].map((feature) => (
          <div className="feature" key={feature.icon}>
            <span className="feature-icon">
              <Icon name={feature.icon} size={25} />
            </span>
            <div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
