import React, { useEffect, useState } from 'react';
import { legalMoves, FINISH } from '@ludo/shared';
import { Board } from './Board.jsx';
import { Icon } from './Icons.jsx';
import { useGamePresentation } from '../animation/useGamePresentation.js';
import { soundManager } from '../audio/SoundManager.js';
import { RollingDie } from './RollingDie.jsx';
import { WinCelebration } from './WinCelebration.jsx';
import { useSocial } from '../social/useSocial.js';
import { EmojiReactions } from '../social/EmojiReactions.jsx';
import { BadlaBoard } from '../social/BadlaBoard.jsx';
import { Soundboard } from '../social/Soundboard.jsx';
import { BanterNotices } from '../social/BanterNotices.jsx';
import '../social/social.css';
import { Chat } from '../chat/Chat.jsx';
export function GameRoom({ api }) {
  const { room, session, connected, busy, run } = api,
    me = session?.playerId;
  const presentation = useGamePresentation(room, connected, (cue) => soundManager.play(cue));
  const social = useSocial(room, connected);
  const game = presentation.game;
  const locked = presentation.locked;
  const [selected, setSelected] = useState(null);
  const [copied, setCopied] = useState(''),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const current = game && room.players.find((p) => p.id === game.players[game.turn].id),
    mine = current?.id === me,
    host = room.hostId === me,
    finished = game?.status === 'finished';
  const winner = finished && room.players.find((p) => p.id === game.winnerId),
    moves = mine && connected ? legalMoves(game) : [];
  const canStart = room.players.length >= 2 && room.players.every((p) => p.connected),
    offlineSeconds = current?.disconnectedAt
      ? Math.max(0, Math.floor((now - current.disconnectedAt) / 1000))
      : 0;
  function play(action, data = {}) {
    if (locked || presentation.controller.locked || busy) return;
    if (action === 'move') setSelected(data.tokenIndex);
    run('game:' + action, { version: game?.version, matchNumber: room.matchNumber, ...data });
  }
  async function copy(invite = false) {
    try {
      await navigator.clipboard.writeText(
        invite ? `${location.origin}/?room=${room.code}` : room.code,
      );
      setCopied(invite ? 'Invite link copied!' : 'Room code copied!');
      setTimeout(() => setCopied(''), 2500);
    } catch {
      api.setError('Copy the room code shown on screen to invite a friend.');
    }
  }
  return (
    <main className="room-main" data-phase={presentation.phase} aria-busy={locked}>
      <EmojiReactions events={social.events} />
      <div className="room-intro">
        <div>
          <p className="eyebrow">
            <span className="short-line" /> YOUR OWN LITTLE CORNER OF THE INTERNET
          </p>
          <h1>
            {finished
              ? 'Well played, everyone.'
              : game
                ? 'Let the good times roll.'
                : 'Make yourself at home.'}
          </h1>
          <p>
            {game
              ? `Round ${room.matchNumber}. The friendly rivalry continues.`
              : 'Pull up a chair. Invite your people. We’ll take care of the rest.'}
          </p>
        </div>
        <div className="invite-card">
          <span className="field-label">PRIVATE ROOM</span>
          <div>
            <b data-testid="room-code">{room.code}</b>
            <button className="icon-button" aria-label="Copy room code" onClick={() => copy()}>
              <Icon name="copy" size={18} />
            </button>
          </div>
          <button className="invite-link" onClick={() => copy(true)}>
            <Icon name="link" size={13} />
            {copied || 'Copy invite link'}
          </button>
        </div>
      </div>
      <BanterNotices events={social.events} players={room.players} />
      <WinCelebration
        winner={winner}
        completedId={presentation.completedId}
        matchNumber={room.matchNumber}
      />
      <div className="game-layout">
        <div className="board-column">
          <section className="table-panel">
            <div className="table-toolbar">
              <span>
                <i className="live-dot" />
                {finished
                  ? 'A ROUND TO REMEMBER'
                  : game
                    ? 'GAME IN PROGRESS'
                    : 'THE GATHERING PLACE'}
              </span>
              <span className="table-badge">
                <Icon name="lock" size={12} /> FRIENDS ONLY
              </span>
            </div>
            <div className="board-area">
              <Board
                players={room.players}
                game={game}
                motion={
                  presentation.moving ? { ...presentation.moving, phase: presentation.phase } : null
                }
                selected={busy ? selected : null}
                legal={moves}
                onMove={(index) => play('move', { tokenIndex: index })}
                disabled={busy || locked || !connected}
              />
            </div>
            <div className="turn-controls">
              <RollingDie
                value={game?.dice ?? game?.lastRoll ?? 6}
                rolling={presentation.phase === 'rolling'}
              />
              <div className="turn-copy">
                {game && !finished && (
                  <span
                    className="turn-marker"
                    style={{ '--active-color': `var(--${current?.color})` }}
                  >
                    <i />
                    {mine ? 'Your turn' : `${current?.name}’s turn`}
                  </span>
                )}
                <strong>
                  {locked
                    ? presentation.phase === 'rolling'
                      ? 'Rolling the dice…'
                      : `Moving token · ${presentation.moving?.step ?? ''}/${presentation.moving?.total ?? ''}`
                    : finished
                      ? `${winner?.name} takes the crown!`
                      : !game
                        ? 'A good game starts with good company.'
                        : !current?.connected
                          ? `${current?.name} is reconnecting…`
                          : mine
                            ? game.phase === 'move'
                              ? 'Your move. Make it count.'
                              : 'Your turn. Feeling lucky?'
                            : `${current?.name}’s turn`}
                </strong>
                <p aria-live="polite">
                  {game?.lastAction ?? 'Share your room code and get everyone around the table.'}
                </p>
              </div>
              {game && !finished && (
                <button
                  className="primary roll-button"
                  onClick={() => play('roll')}
                  disabled={!mine || game.phase !== 'roll' || busy || locked || !connected}
                >
                  {busy
                    ? 'One moment…'
                    : mine
                      ? game.phase === 'move'
                        ? 'Choose a token'
                        : 'Roll the dice'
                      : 'Watching the dice'}
                  <span aria-hidden="true">↗</span>
                </button>
              )}
            </div>
            {mine && game?.phase === 'move' && (
              <div className="move-picker" aria-label="Choose a token to move">
                <span>Your move</span>
                {moves.map((index) => (
                  <button
                    key={index}
                    aria-label={`Move token ${index + 1}`}
                    disabled={busy || locked || !connected}
                    onClick={() => play('move', { tokenIndex: index })}
                  >
                    Token {index + 1} <Icon name="arrow" size={14} />
                  </button>
                ))}
              </div>
            )}
            {host && game?.status === 'active' && !current?.connected && (
              <div className="offline-turn">
                <span>
                  Seat reserved ·{' '}
                  {offlineSeconds < 60
                    ? `Skip available in ${60 - offlineSeconds}s`
                    : 'You can skip this turn'}
                </span>
                <button
                  className="text-button"
                  disabled={offlineSeconds < 60 || busy || locked || !connected}
                  onClick={() => play('skip')}
                >
                  Skip turn <Icon name="arrow" size={14} />
                </button>
              </div>
            )}
            <div className="board-legend">
              <span>
                <span className="legend-star">✧</span> Star squares are safe
              </span>
              <span>
                <span className="legend-ring" /> Highlighted tokens can move
              </span>
            </div>
          </section>
          <div className="after-table">
            <Soundboard social={social} connected={connected} />
            <BadlaBoard room={room} />
          </div>
        </div>
        <aside className="room-sidebar">
          <section className="panel seats-panel">
            <div className="panel-heading">
              <h3>Around the table</h3>
              <span className="muted">{room.players.length}/4</span>
            </div>
            <div className="seats">
              {Array.from({ length: 4 }, (_, index) => {
                const p = room.players[index],
                  active = game?.status === 'active' && p?.id === current?.id,
                  home = game?.players
                    .find((g) => g.id === p?.id)
                    ?.tokens.filter((pos) => pos === FINISH).length;
                return p ? (
                  <div
                    key={p.id}
                    className={`seat ${active ? 'active' : ''}`}
                    style={{ '--seat-color': `var(--${p.color})` }}
                  >
                    <span className={`avatar ${p.color}-bg`}>
                      {p.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <strong>
                        {p.name}
                        {p.id === me && <small> YOU</small>}
                      </strong>
                      <p>
                        <i className={`presence ${p.connected ? 'online' : ''}`} />
                        {p.connected ? (active ? 'Taking a turn' : 'At the table') : 'Reconnecting'}
                        {p.id === room.hostId && ' · Host'}
                      </p>
                    </div>
                    {game && (
                      <span className="home-count" title="Tokens home">
                        {home}/4 <Icon name="trophy" size={13} />
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="seat empty" key={index}>
                    <span className="avatar">+</span>
                    <div>
                      <strong>An open chair</strong>
                      <p>{game ? 'Next time, invite one more' : 'Better with a friend'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {(!game || finished) && (
              <div className="start-section">
                {finished && (
                  <p className="winner-message">
                    <Icon name="trophy" /> {winner?.name} won round {room.matchNumber}.<br />
                    There’s always the next one.
                  </p>
                )}
                <button
                  className="primary full"
                  disabled={!host || !canStart || busy || locked || !connected}
                  onClick={() => run('game:start', {})}
                >
                  {busy
                    ? 'Getting ready…'
                    : host
                      ? finished
                        ? 'One more game?'
                        : 'Everyone here? Let’s play'
                      : 'Waiting for the host'}
                  <Icon name={finished ? 'infinity' : 'arrow'} size={18} />
                </button>
                <p className="entry-caption">
                  {!canStart
                    ? 'Waiting for at least two connected friends.'
                    : host
                      ? 'The starting player rotates each round.'
                      : 'Your host will start when everyone is ready.'}
                </p>
              </div>
            )}
          </section>
          <Chat room={room} me={me} connected={connected} onError={api.setError} />
          <button
            className="leave-button"
            onClick={() => run('room:leave', {})}
            disabled={busy || locked || !connected}
          >
            {game ? 'Leave table · your seat stays reserved' : 'Leave this room'}
          </button>
        </aside>
      </div>
      <p className="room-footnote">
        <Icon name="infinity" size={17} /> No match limits. No rush. Just one more game.
      </p>
    </main>
  );
}
