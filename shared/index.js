export { ANIMATION } from './animation.js';
export const COLORS = ['coral', 'mint', 'gold', 'violet'];
export const FINISH = 56;
export const SAFE = [0, 8, 13, 21, 26, 34, 39, 47];
export const TRACK = [
  [6, 1],
  [6, 2],
  [6, 3],
  [6, 4],
  [6, 5],
  [5, 6],
  [4, 6],
  [3, 6],
  [2, 6],
  [1, 6],
  [0, 6],
  [0, 7],
  [0, 8],
  [1, 8],
  [2, 8],
  [3, 8],
  [4, 8],
  [5, 8],
  [6, 9],
  [6, 10],
  [6, 11],
  [6, 12],
  [6, 13],
  [6, 14],
  [7, 14],
  [8, 14],
  [8, 13],
  [8, 12],
  [8, 11],
  [8, 10],
  [8, 9],
  [9, 8],
  [10, 8],
  [11, 8],
  [12, 8],
  [13, 8],
  [14, 8],
  [14, 7],
  [14, 6],
  [13, 6],
  [12, 6],
  [11, 6],
  [10, 6],
  [9, 6],
  [8, 5],
  [8, 4],
  [8, 3],
  [8, 2],
  [8, 1],
  [8, 0],
  [7, 0],
  [6, 0],
];
export const LANES = {
  coral: [
    [7, 1],
    [7, 2],
    [7, 3],
    [7, 4],
    [7, 5],
    [7, 6],
  ],
  mint: [
    [1, 7],
    [2, 7],
    [3, 7],
    [4, 7],
    [5, 7],
    [6, 7],
  ],
  gold: [
    [7, 13],
    [7, 12],
    [7, 11],
    [7, 10],
    [7, 9],
    [7, 8],
  ],
  violet: [
    [13, 7],
    [12, 7],
    [11, 7],
    [10, 7],
    [9, 7],
    [8, 7],
  ],
};
export function square(color, progress) {
  return progress >= 0 && progress <= 50 ? (COLORS.indexOf(color) * 13 + progress) % 52 : null;
}
export function coordinates(color, progress, token = 0) {
  if (progress < 0) {
    const [r, c] = { coral: [1, 1], mint: [1, 10], gold: [10, 10], violet: [10, 1] }[color];
    return [r + 1 + Math.floor(token / 2) * 2, c + 1 + (token % 2) * 2];
  }
  if (progress <= 50) return TRACK[square(color, progress)];
  return LANES[color][progress - 51];
}
export function newGame(players, startingIndex = 0) {
  if (
    players.length < 2 ||
    players.length > 4 ||
    new Set(players.map((p) => p.id)).size !== players.length ||
    new Set(players.map((p) => p.color)).size !== players.length ||
    players.some((p) => !COLORS.includes(p.color))
  )
    throw new Error('A match needs 2–4 distinct players and colors.');
  return {
    status: 'active',
    players: players.map((p) => ({ id: p.id, color: p.color, tokens: [-1, -1, -1, -1] })),
    turn: startingIndex % players.length,
    phase: 'roll',
    dice: null,
    lastRoll: null,
    sixes: 0,
    winnerId: null,
    version: 0,
    lastAction: 'The match is on. Roll a six to leave your yard.',
  };
}
function advance(game) {
  game.turn = (game.turn + 1) % game.players.length;
  game.phase = 'roll';
  game.dice = null;
  game.sixes = 0;
}
function requireTurn(game, id, phase) {
  if (!game || game.status !== 'active') throw new Error('There is no active match.');
  if (game.players[game.turn].id !== id) throw new Error('Wait for your turn.');
  if (game.phase !== phase)
    throw new Error(
      phase === 'roll' ? 'Choose a highlighted token first.' : 'Roll the dice first.',
    );
}
function blocked(game, player, tokenIndex, progress) {
  const target = square(player.color, progress);
  if (target === null || SAFE.includes(target)) return false;
  return game.players.some(
    (p) =>
      p.tokens.filter(
        (pos, i) => !(p.id === player.id && i === tokenIndex) && square(p.color, pos) === target,
      ).length >= 2,
  );
}
export function legalMoves(game) {
  if (!game || game.status !== 'active' || game.phase !== 'move') return [];
  const player = game.players[game.turn];
  return player.tokens.flatMap((progress, index) => {
    if (progress === FINISH || (progress < 0 && game.dice !== 6)) return [];
    const destination = progress < 0 ? 0 : progress + game.dice;
    if (destination > FINISH) return [];
    for (let step = Math.max(0, progress + 1); step <= destination; step++)
      if (blocked(game, player, index, step)) return [];
    return [index];
  });
}
export function rollDice(state, id, value) {
  requireTurn(state, id, 'roll');
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new Error('Invalid die result.');
  const game = structuredClone(state);
  game.version++;
  game.lastRoll = value;
  game.sixes = value === 6 ? game.sixes + 1 : 0;
  if (game.sixes === 3) {
    advance(game);
    game.lastAction = 'Three sixes in a row. The turn passes.';
    return game;
  }
  game.dice = value;
  game.phase = 'move';
  game.lastAction = `Rolled ${value}. Choose a highlighted token.`;
  if (!legalMoves(game).length) {
    game.phase = 'roll';
    game.dice = null;
    if (value !== 6) advance(game);
    game.lastAction =
      value === 6
        ? 'No legal moves. A six gives you another roll.'
        : 'No legal moves. The turn passes.';
  }
  return game;
}
export function moveToken(state, id, tokenIndex) {
  requireTurn(state, id, 'move');
  if (!Number.isInteger(tokenIndex) || !legalMoves(state).includes(tokenIndex))
    throw new Error('That token cannot move. Choose a highlighted token.');
  const game = structuredClone(state),
    player = game.players[game.turn],
    rolled = game.dice;
  player.tokens[tokenIndex] =
    player.tokens[tokenIndex] < 0 ? 0 : player.tokens[tokenIndex] + rolled;
  const target = square(player.color, player.tokens[tokenIndex]);
  let captured = false;
  if (target !== null && !SAFE.includes(target))
    for (const enemy of game.players.filter((p) => p.id !== id)) {
      enemy.tokens = enemy.tokens.map((pos) => {
        if (square(enemy.color, pos) === target) {
          captured = true;
          return -1;
        }
        return pos;
      });
    }
  const finished = player.tokens[tokenIndex] === FINISH;
  game.version++;
  game.dice = null;
  game.phase = 'roll';
  if (player.tokens.every((pos) => pos === FINISH)) {
    game.status = 'finished';
    game.winnerId = id;
    game.lastAction = 'All four tokens are home. A winner!';
  } else if (rolled === 6 || captured || finished) {
    game.lastAction = captured
      ? 'Captured a token! Roll again.'
      : finished
        ? 'A token made it home! Roll again.'
        : 'A six gives you another roll.';
  } else {
    advance(game);
    game.lastAction = 'Token moved. Next player’s turn.';
  }
  return game;
}
export function skipTurn(state) {
  if (!state || state.status !== 'active') throw new Error('There is no active match.');
  const game = structuredClone(state);
  advance(game);
  game.version++;
  game.lastAction = 'The disconnected player’s turn was skipped. Their tokens stay on the board.';
  return game;
}

/** Ordered visual cells for a validated move. Leaving the yard is one entry hop. */
export function movementPath(color, from, to, tokenIndex = 0) {
  if (
    !COLORS.includes(color) ||
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < -1 ||
    to > FINISH ||
    to <= from ||
    (from === -1 && to !== 0)
  )
    throw new Error('Invalid movement path.');
  return Array.from({ length: to - from }, (_, index) => {
    const progress = from + index + 1;
    return { progress, coords: coordinates(color, progress, tokenIndex) };
  });
}
