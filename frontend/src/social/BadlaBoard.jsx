import React from 'react';
export function BadlaBoard({ room }) {
  const captures = room.social?.captures ?? {},
    revenges = room.social?.revengeCounts ?? {};
  const pairs = room.players.flatMap((hunter) =>
    room.players
      .filter((victim) => (captures[hunter.id]?.[victim.id] ?? 0) > 0)
      .map((victim) => ({ hunter, victim, count: captures[hunter.id][victim.id] })),
  );
  return (
    <section className="panel badla-panel" aria-label="Badla Board">
      <div className="panel-heading">
        <h3>
          Badla Board <span aria-hidden="true">🔥</span>
        </h3>
        <span className="muted">Round {room.matchNumber || '—'}</span>
      </div>
      <div className="badla-table">
        <table>
          <caption className="sr-only">Captures and revenge in this match</caption>
          <thead>
            <tr>
              <th scope="col">Dost</th>
              <th scope="col">Kaati</th>
              <th scope="col">Kati</th>
              <th scope="col">Badle</th>
            </tr>
          </thead>
          <tbody>
            {room.players.map((player) => {
              const won = Object.values(captures[player.id] ?? {}).reduce((sum, n) => sum + n, 0),
                lost = room.players.reduce((sum, p) => sum + (captures[p.id]?.[player.id] ?? 0), 0);
              return (
                <tr key={player.id}>
                  <th scope="row">
                    <i style={{ background: `var(--${player.color})` }} />
                    {player.name}
                  </th>
                  <td>{won}</td>
                  <td>{lost}</td>
                  <td>{revenges[player.id] ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="badla-pairs">
        {pairs.length ? (
          pairs.map(({ hunter, victim, count }) => (
            <p key={hunter.id + victim.id}>
              {hunter.name} <span>→</span> {victim.name}
              <b>×{count}</b>
            </p>
          ))
        ) : (
          <p>Abhi sab dost hain. Pehli capture ka intezaar hai.</p>
        )}
      </div>
      <p className="badla-caption">Kaati: captured · Kati: lost · Badle: paid back</p>
    </section>
  );
}
