import React from 'react';
import { ANIMATION } from '@ludo/shared';
import '../animation/motion.css';
import { COLORS, TRACK, LANES, SAFE, FINISH, coordinates } from '@ludo/shared';
const palette = { coral: '#ff826f', mint: '#61dcb6', gold: '#ffcf69', violet: '#bc9aff' };
const quadrants = [
  [0, 0],
  [0, 9],
  [9, 9],
  [9, 0],
];
export function Board({
  players,
  game,
  legal = [],
  onMove,
  preview = false,
  disabled = false,
  motion,
  selected,
}) {
  const seats = preview
    ? COLORS.map((color, i) => ({
        id: color,
        color,
        name: ['You', 'Your friend', 'Your friend', 'Your friend'][i],
      }))
    : players;
  const tokens = seats.flatMap((p) =>
    (game?.players.find((g) => g.id === p.id)?.tokens ?? [-1, -1, -1, -1]).map(
      (progress, index) => ({
        ...p,
        progress,
        index,
        coords: coordinates(p.color, progress, index),
      }),
    ),
  );
  return (
    <div className={`board ${preview ? 'preview-board' : ''}`} aria-label="Ludo board">
      <svg viewBox="0 0 450 450" className="board-art" aria-hidden="true">
        <defs>
          {COLORS.map((color) => (
            <linearGradient key={color} id={`home-${color}`} x1="0" y1="0" x2="1" y2="1">
              <stop stopColor={palette[color]} />
              <stop offset="1" stopColor={palette[color]} stopOpacity=".68" />
            </linearGradient>
          ))}
        </defs>
        <rect width="450" height="450" rx="12" fill="#e6e3d5" />
        {COLORS.map((color, i) => {
          const [row, col] = quadrants[i];
          return (
            <g key={color}>
              <rect
                x={col * 30 + 5}
                y={row * 30 + 5}
                width="170"
                height="170"
                rx="10"
                fill={`url(#home-${color})`}
                stroke="#fff8"
                strokeWidth="1.2"
              />
              <rect
                x={col * 30 + 28}
                y={row * 30 + 28}
                width="124"
                height="124"
                rx="34"
                fill="#f4f0e4"
                fillOpacity=".88"
              />
              {[0, 1, 2, 3].map((index) => {
                const [r, c] = coordinates(color, -1, index);
                return (
                  <circle
                    key={index}
                    cx={c * 30 + 15}
                    cy={r * 30 + 15}
                    r="12"
                    fill={palette[color]}
                    fillOpacity=".3"
                    stroke={palette[color]}
                    strokeWidth="1.2"
                  />
                );
              })}
            </g>
          );
        })}
        {TRACK.map(([r, c], index) => {
          const color = index % 13 === 0 ? palette[COLORS[Math.floor(index / 13)]] : null;
          return (
            <g key={index}>
              <rect
                x={c * 30 + 1.2}
                y={r * 30 + 1.2}
                width="27.6"
                height="27.6"
                rx="3"
                fill={color ?? '#faf7ef'}
              />
              {SAFE.includes(index) && (
                <text
                  x={c * 30 + 15}
                  y={r * 30 + 20}
                  textAnchor="middle"
                  fill="#69746a"
                  fontSize="18"
                >
                  ✧
                </text>
              )}
            </g>
          );
        })}
        {COLORS.map((color) => (
          <g key={color}>
            {LANES[color].slice(0, 5).map(([r, c], i) => (
              <rect
                key={i}
                x={c * 30 + 1.2}
                y={r * 30 + 1.2}
                width="27.6"
                height="27.6"
                rx="3"
                fill={palette[color]}
                fillOpacity=".75"
              />
            ))}
          </g>
        ))}
        <path d="M180 180 225 225 180 270Z" fill={palette.coral} />
        <path d="M180 180 225 225 270 180Z" fill={palette.mint} />
        <path d="M270 180 225 225 270 270Z" fill={palette.gold} />
        <path d="M180 270 225 225 270 270Z" fill={palette.violet} />
        <circle cx="225" cy="225" r="10" fill="#f4f0e4" />
        <path d="m221 225 3 3 5-6" fill="none" stroke="#626c5c" strokeWidth="1.8" />
      </svg>
      {tokens.map((token) => {
        const group = tokens.filter((t) => String(t.coords) === String(token.coords)),
          stack = group.findIndex((t) => t.id === token.id && t.index === token.index),
          stacked = group.length > 1;
        const movable =
          !disabled && game?.players[game.turn]?.id === token.id && legal.includes(token.index);
        const [r, c] = token.coords;
        const columns = Math.ceil(Math.sqrt(group.length));
        const spacing = group.length > 4 ? 1.1 : 1.6;
        const moving = motion?.playerId === token.id && motion?.tokenIndex === token.index;
        const style = {
          '--step-ms': `${ANIMATION.STEP_MS}ms`,
          '--land-ms': `${ANIMATION.LAND_MS}ms`,
          left: `${((c + 0.5) / 15) * 100 + (stacked ? ((stack % columns) - (columns - 1) / 2) * spacing : 0)}%`,
          top: `${((r + 0.5) / 15) * 100 + (stacked ? (Math.floor(stack / columns) - (Math.ceil(group.length / columns) - 1) / 2) * spacing : 0)}%`,
          ...(group.length > 4 ? { width: '2.1%', height: '2.1%', fontSize: '5px' } : {}),
          '--token-color': palette[token.color],
        };
        const description = `${token.name} token ${token.index + 1}, ${token.progress < 0 ? 'in yard' : token.progress === FINISH ? 'home' : `step ${token.progress}`}`;
        return preview ? (
          <span key={`${token.id}-${token.index}`} className="token preview-token" style={style}>
            <span className="token-face">{token.index + 1}</span>
          </span>
        ) : (
          <button
            type="button"
            key={`${token.id}-${token.index}`}
            style={style}
            className={`token ${movable ? 'movable' : ''} ${stacked ? 'stacked' : ''} ${moving && motion.phase === 'moving' ? 'in-motion' : ''} ${moving && motion.phase === 'landing' ? 'landed' : ''} ${selected === token.index && game?.players[game.turn]?.id === token.id ? 'selected' : ''}`}
            disabled={!movable}
            onClick={() => onMove(token.index)}
            aria-label={`${description}${movable ? ', move' : ''}`}
            title={description}
            data-token={`${token.id}:${token.index}`}
            data-progress={token.progress}
            data-hop={moving ? motion.step : undefined}
            data-testid={movable ? 'legal-token' : undefined}
          >
            <span className="token-face" key={moving ? `${motion.id}:${motion.step}` : 'still'}>
              {token.index + 1}
            </span>
          </button>
        );
      })}
    </div>
  );
}
