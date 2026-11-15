import { randomInt } from 'node:crypto';
import { FINISH } from '@ludo/shared';
import { SOCIAL_CONFIG } from '../../../shared/social.js';
import { trackCaptures } from './CaptureTracker.js';
import { DIALOGUES } from './dialogues.js';
export class BanterEngine {
  constructor({ config = {}, choose = (count) => randomInt(count) } = {}) {
    this.config = { ...SOCIAL_CONFIG, ...config };
    this.choose = choose;
  }
  ensure(room) {
    if (room.social?.matchNumber !== room.matchNumber) {
      room.social = {
        matchNumber: room.matchNumber,
        recent: room.social?.recent ?? {},
        categoryAt: {},
        lastAutoAt: null,
        nearPlayers: [],
        autoEvents: [],
      };
    }
    return room.social;
  }
  onStart(room) {
    this.ensure(room).autoEvents = [];
  }
  pick(state, category) {
    const lines = DIALOGUES[category],
      recent = (state.recent[category] ?? []).slice(
        -Math.min(this.config.RECENT_DIALOGUES, lines.length - 1),
      );
    const available = lines
      .map((text, index) => ({ text, index }))
      .filter((item) => !recent.includes(item.index));
    const selected = available[this.choose(available.length)];
    state.recent[category] = [...recent, selected.index].slice(-this.config.RECENT_DIALOGUES);
    return selected;
  }
  event(room, category, playerId, targetId, at) {
    const state = this.ensure(room),
      selected = this.pick(state, category);
    return {
      id: `${room.code}:${room.matchNumber}:${room.game.version}:auto:${category}:${playerId}:${targetId ?? ''}`,
      code: room.code,
      matchNumber: room.matchNumber,
      gameVersion: room.game.version,
      kind: 'auto',
      category,
      playerId,
      targetId,
      text: selected.text,
      dialogueId: `${category}:${selected.index}`,
      at,
      expiresAt: at + this.config.EVENT_TTL_MS,
    };
  }
  onAction(room, before) {
    const state = this.ensure(room),
      event = room.lastEvent,
      now = event.at;
    state.autoEvents = [];
    if (state.processed === event.id) return;
    state.processed = event.id;
    const revenges = event.kind === 'move' ? trackCaptures(state, event) : [];
    const actor = before.players.find((p) => p.id === event.playerId),
      after = room.game.players.find((p) => p.id === event.playerId);
    const candidates = [];
    if (room.game.winnerId) candidates.push(['win', room.game.winnerId]);
    else {
      if (event.kind === 'move') {
        const victims = [...new Set(event.captures.map((c) => c.playerId))];
        if (victims.length) {
          candidates.push([
            revenges.length ? 'revenge' : 'capture',
            event.playerId,
            revenges[0] ?? victims[0],
          ]);
          candidates.push(['loss', victims[0], event.playerId]);
        }
        if (
          after.tokens.filter((p) => p === FINISH).length === 3 &&
          after.tokens.some((p) => p >= 45 && p < FINISH) &&
          !state.nearPlayers.includes(event.playerId)
        )
          candidates.push(['near_win', event.playerId]);
      }
      if (event.kind === 'roll' && event.dice === 6) candidates.push(['six', event.playerId]);
      else if (
        event.kind === 'roll' &&
        actor.tokens.includes(-1) &&
        actor.tokens.every((p) => p === -1 || p === FINISH)
      )
        candidates.push(['no_six', event.playerId]);
    }
    if (
      state.lastAutoAt !== null &&
      now - state.lastAutoAt < this.config.AUTO_COOLDOWN_MS &&
      !room.game.winnerId &&
      !revenges.length
    )
      return;
    for (const [category, playerId, targetId] of candidates) {
      if (
        category !== 'revenge' &&
        state.categoryAt[category] !== undefined &&
        now - state.categoryAt[category] < this.config.CATEGORY_COOLDOWN_MS
      )
        continue;
      state.autoEvents.push(this.event(room, category, playerId, targetId, now));
      state.categoryAt[category] = now;
      if (category === 'near_win') state.nearPlayers.push(playerId);
      if (state.autoEvents.length === 2) break;
    }
    if (state.autoEvents.length) state.lastAutoAt = now;
  }
}
