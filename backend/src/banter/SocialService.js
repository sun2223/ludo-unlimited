import { randomUUID } from 'node:crypto';
import { SOUNDBOARD, EMOJIS } from '../../../shared/social.js';
export class SocialService {
  constructor(rooms) {
    this.rooms = rooms;
    this.config = rooms.banter.config;
  }
  async react(session, input) {
    if (!session) throw new Error('Join a room first.');
    if (
      !input ||
      !['sound', 'emoji'].includes(input.kind) ||
      typeof input.requestId !== 'string' ||
      !/^[a-zA-Z0-9-]{12,80}$/.test(input.requestId)
    )
      throw new Error('Choose a valid table reaction.');
    const definition =
      input.kind === 'sound'
        ? SOUNDBOARD.find((item) => item.key === input.key)
        : EMOJIS.includes(input.key)
          ? { key: input.key, label: input.key }
          : null;
    if (!definition) throw new Error('That reaction is not available.');
    let event,
      duplicate = false,
      cooldownMs;
    await this.rooms.mutate(session, (room, id) => {
      if (input.matchNumber !== room.matchNumber)
        throw new Error('The round changed. Try your reaction again.');
      const state = this.rooms.banter.ensure(room),
        now = this.rooms.now();
      state.manual ??= {};
      const rate = state.manual[id] ?? { lastAt: null, windowAt: now, count: 0, receipts: [] };
      const receipt = rate.receipts.find((item) => item.requestId === input.requestId);
      if (receipt) {
        event = receipt.event;
        duplicate = true;
        cooldownMs = Math.max(0, rate.lastAt + this.config.REACTION_COOLDOWN_MS - now);
        return;
      }
      if (now - rate.windowAt >= this.config.BURST_WINDOW_MS) {
        rate.windowAt = now;
        rate.count = 0;
      }
      const wait = Math.max(
        rate.lastAt === null ? 0 : rate.lastAt + this.config.REACTION_COOLDOWN_MS - now,
        state.manualAt === undefined ? 0 : state.manualAt + this.config.ROOM_REACTION_MS - now,
        rate.count >= this.config.BURST_LIMIT
          ? rate.windowAt + this.config.BURST_WINDOW_MS - now
          : 0,
      );
      if (wait > 0)
        throw Object.assign(new Error('Thoda sa break! Let your friends react too.'), {
          retryAfterMs: wait,
        });
      event = {
        id: randomUUID(),
        code: room.code,
        matchNumber: room.matchNumber,
        gameVersion: room.game?.version ?? 0,
        kind: input.kind,
        key: definition.key,
        text: definition.label,
        playerId: id,
        at: now,
        expiresAt: now + this.config.EVENT_TTL_MS,
      };
      if (input.kind === 'sound') event.sound = 'reaction_' + definition.key;
      rate.lastAt = now;
      rate.count++;
      rate.receipts = [...rate.receipts, { requestId: input.requestId, event }].slice(-24);
      state.manual[id] = rate;
      state.manualAt = now;
      cooldownMs = this.config.REACTION_COOLDOWN_MS;
    });
    return { event, duplicate, cooldownMs };
  }
}
