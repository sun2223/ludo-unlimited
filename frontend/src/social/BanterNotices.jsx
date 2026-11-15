import React from 'react';
const labels = {
  no_six: 'Sabr ka test 🎲',
  six: 'Chhe aa gaya 🦁',
  capture: 'Goti express 🎯',
  loss: 'Comeback loading 💪',
  revenge: 'Badla delivered 🔥',
  near_win: 'Final lap 👀',
  win: 'Champion scene 🏆',
  slow: 'Captain, hello? ☕',
};
export function BanterNotices({ events, players }) {
  return (
    <section className="banter-notices" aria-label="Table banter">
      <div className="banter-label">
        TABLE KI BAATEIN <span>✦</span>
      </div>
      <div role="status" aria-live="polite" aria-relevant="additions" className="banter-feed">
        {events.length ? (
          events.slice(-2).map((event) => (
            <div className="banter-line" key={event.id} data-event-id={event.id}>
              <span>{labels[event.category] ?? 'Dost ka reaction 🎭'}</span>
              <p>
                <b>{players.find((p) => p.id === event.playerId)?.name}</b> · {event.text}
              </p>
            </div>
          ))
        ) : (
          <p className="banter-idle">Goti chalegi. Dosti rahegi. Thodi taang khinchai bhi hogi.</p>
        )}
      </div>
    </section>
  );
}
