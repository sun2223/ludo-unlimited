import React, { useEffect, useState } from 'react';
import { Icon } from './Icons.jsx';
export function WinCelebration({ winner, completedId, matchNumber }) {
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    // Celebrate only a move completed live, never an old win loaded on reconnect.
    if (!completedId || !winner || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setBurst(true);
    const timer = setTimeout(() => setBurst(false), 2600);
    return () => clearTimeout(timer);
  }, [winner?.id, completedId, matchNumber]);
  if (!winner) return null;
  return (
    <div className="win-banner" role="status">
      <span className="win-medal">
        <Icon name="trophy" size={28} />
      </span>
      <div>
        <span className="eyebrow">ROUND {matchNumber} · BEAUTIFULLY PLAYED</span>
        <strong>{winner.name} wins the table!</strong>
        <p>Four tokens home. One more story to tell.</p>
      </div>
      {burst && (
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 36 }, (_, i) => (
            <i
              key={i}
              style={{
                '--x': `${(i * 37) % 100}%`,
                '--delay': `${(i % 7) * 0.065}s`,
                '--spin': `${i % 2 ? 500 : -420}deg`,
                '--hue': [12, 153, 42, 268][i % 4],
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
