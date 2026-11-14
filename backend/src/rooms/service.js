import { randomBytes, randomUUID, createHash, timingSafeEqual, randomInt } from 'node:crypto';
import { COLORS, newGame, rollDice, moveToken, skipTurn } from '@ludo/shared';
const hash = (value) => createHash('sha256').update(value).digest('hex');
export function nickname(value) {
  if (typeof value !== 'string') throw new Error('Enter a nickname.');
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 20 || /[\x00-\x1f\x7f]/.test(name))
    throw new Error('Use a nickname of 2–20 characters.');
  return name;
}
export function roomCode(value) {
  if (typeof value !== 'string' || !/^[A-Z2-9]{6}$/.test(value.toUpperCase().trim()))
    throw new Error('Enter a valid six-character room code.');
  return value.toUpperCase().trim();
}
export class RoomService {
  constructor(repository, { die = () => randomInt(1, 7), now = Date.now } = {}) {
    this.repository = repository;
    this.queues = new Map();
    this.presence = new Map();
    this.offline = new Map();
    this.die = die;
    this.now = now;
    this.startedAt = now();
  }
  async locked(code, task) {
    const previous = this.queues.get(code) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(task);
    this.queues.set(code, current);
    try {
      return await current;
    } finally {
      if (this.queues.get(code) === current) this.queues.delete(code);
    }
  }
  player(name, color) {
    const token = randomBytes(32).toString('hex');
    return {
      token,
      player: { id: randomUUID(), name: nickname(name), color, tokenHash: hash(token) },
    };
  }
  async create(name) {
    const { token, player } = this.player(name, COLORS[0]);
    for (let tries = 0; tries < 10; tries++) {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code = Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
      const room = {
        code,
        hostId: player.id,
        players: [player],
        game: null,
        chat: [],
        matchNumber: 0,
        revision: 0,
        createdAt: Date.now(),
      };
      if (await this.repository.create(room))
        return { room, session: { code, playerId: player.id, token } };
    }
    throw new Error('Could not create a room. Try again.');
  }
  async join(codeInput, name) {
    const code = roomCode(codeInput);
    return this.locked(code, async () => {
      const room = await this.get(code);
      if (room.game)
        throw new Error('This match has started. Use your original browser to rejoin.');
      if (room.players.length >= 4) throw new Error('This room is full.');
      const cleanName = nickname(name);
      if (room.players.some((p) => p.name.toLowerCase() === cleanName.toLowerCase()))
        throw new Error('That nickname is already in this room.');
      const { player, token } = this.player(
        cleanName,
        COLORS.find((c) => !room.players.some((p) => p.color === c)),
      );
      room.players.push(player);
      room.revision++;
      await this.repository.save(room);
      return { room, session: { code, playerId: player.id, token } };
    });
  }
  async get(code) {
    const room = await this.repository.get(code);
    if (!room) throw new Error('Room not found. Check the code.');
    return room;
  }
  async resume(session) {
    if (!session || typeof session.token !== 'string' || !/^[a-f0-9]{64}$/.test(session.token))
      throw new Error('Your rejoin credential is invalid.');
    const room = await this.get(roomCode(session.code));
    const player = room.players.find((p) => p.id === session.playerId);
    if (
      !player ||
      !timingSafeEqual(Buffer.from(player.tokenHash), Buffer.from(hash(session.token)))
    )
      throw new Error('Your rejoin credential is invalid.');
    return { room, session: { code: room.code, playerId: player.id, token: session.token } };
  }
  connect(session, socketId) {
    this.presence.set(socketId, session);
    this.offline.delete(session.playerId);
  }
  disconnect(socketId) {
    const session = this.presence.get(socketId);
    this.presence.delete(socketId);
    if (session && !this.connected(session.code, session.playerId))
      this.offline.set(session.playerId, this.now());
    return session;
  }
  connected(code, playerId) {
    return [...this.presence.values()].some((p) => p.code === code && p.playerId === playerId);
  }
  host(room) {
    return this.connected(room.code, room.hostId)
      ? room.hostId
      : room.players.find((p) => this.connected(room.code, p.id))?.id;
  }
  publicRoom(room) {
    return {
      ...room,
      serverTime: this.now(),
      hostId: this.host(room),
      players: room.players.map(({ tokenHash, ...p }) => ({
        ...p,
        connected: this.connected(room.code, p.id),
        disconnectedAt: this.connected(room.code, p.id)
          ? null
          : (this.offline.get(p.id) ?? this.startedAt),
      })),
    };
  }
  async mutate(session, action) {
    if (!session) throw new Error('Join a room first.');
    return this.locked(session.code, async () => {
      const room = await this.get(session.code);
      if (!room.players.some((p) => p.id === session.playerId))
        throw new Error('Your seat is no longer in this room.');
      await action(room, session.playerId);
      room.revision++;
      await this.repository.save(room);
      return room;
    });
  }
  async start(session) {
    return this.mutate(session, (room, id) => {
      if (this.host(room) !== id) throw new Error('Only the room host can start a match.');
      if (room.game?.status === 'active') throw new Error('The match is already underway.');
      if (room.players.length < 2 || room.players.some((p) => !this.connected(room.code, p.id)))
        throw new Error('You need 2–4 connected players to start.');
      room.game = newGame(room.players, room.matchNumber % room.players.length);
      room.matchNumber++;
    });
  }
  async play(session, data, action) {
    return this.mutate(session, (room, id) => {
      if (
        !room.game ||
        data?.version !== room.game.version ||
        data?.matchNumber !== room.matchNumber
      )
        throw new Error('The board has changed. Try again with the latest state.');
      const before = room.game;
      if (action === 'roll') room.game = rollDice(room.game, id, this.die());
      else if (action === 'move') room.game = moveToken(room.game, id, data.tokenIndex);
      else {
        const current = room.game.players[room.game.turn];
        if (
          this.host(room) !== id ||
          this.connected(room.code, current.id) ||
          this.now() - (this.offline.get(current.id) ?? this.startedAt) < 60000
        )
          throw new Error('Only the host can skip a player after 60 seconds offline.');
        room.game = skipTurn(room.game);
      }
      // Presentation metadata describes an already validated and committed transition.
      // It never changes rule validation, dice generation, or turn timing.
      const actor = before.players[before.turn];
      const captures =
        action === 'move'
          ? before.players.flatMap((p) =>
              p.tokens.flatMap((from, tokenIndex) =>
                from >= 0 &&
                room.game.players.find((next) => next.id === p.id).tokens[tokenIndex] === -1
                  ? [{ playerId: p.id, tokenIndex, from }]
                  : [],
              ),
            )
          : [];
      room.lastEvent = {
        id: `${room.matchNumber}:${room.game.version}`,
        kind: action,
        matchNumber: room.matchNumber,
        fromVersion: before.version,
        toVersion: room.game.version,
        at: this.now(),
        playerId: id,
        dice: action === 'roll' ? room.game.lastRoll : before.dice,
        ...(action === 'move'
          ? {
              color: actor.color,
              tokenIndex: data.tokenIndex,
              from: actor.tokens[data.tokenIndex],
              to: room.game.players.find((p) => p.id === id).tokens[data.tokenIndex],
              captures,
            }
          : {}),
      };
    });
  }
  async leave(session) {
    return this.mutate(session, (room, id) => {
      if (room.game) return; // Match seats and credentials remain valid after leaving the table.
      room.players = room.players.filter((p) => p.id !== id);
      if (room.hostId === id) room.hostId = room.players[0]?.id ?? null;
    });
  }
}
