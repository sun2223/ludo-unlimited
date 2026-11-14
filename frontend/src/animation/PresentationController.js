import { ANIMATION, movementPath } from '@ludo/shared';

// Receives committed snapshots; never submits actions or mutates engine state.
// Injectable clock/scheduler lets tests inspect every hop without real-time sleeps.
export class PresentationController {
  constructor({
    onFrame,
    onCue = () => {},
    now = Date.now,
    schedule = (fn, ms) => setTimeout(fn, ms),
    cancel = (id) => clearTimeout(id),
  }) {
    Object.assign(this, { onFrame, onCue, now, schedule, cancel });
    this.latest = null;
    this.frame = { game: null, phase: 'idle', moving: null };
    this.generation = 0;
    this.queue = [];
  }
  get locked() {
    return this.frame.phase !== 'idle';
  }
  emit(frame) {
    this.frame = frame;
    this.onFrame(frame);
  }
  stop() {
    this.generation++;
    this.cancel(this.timer);
    this.queue = [];
  }
  snap(room) {
    this.stop();
    this.emit({ game: room?.game ?? null, phase: 'idle', moving: null });
  }
  receive(room, { live = true, reducedMotion = false } = {}) {
    const previous = this.latest;
    this.latest = room;
    if (
      !live ||
      !previous ||
      room.code !== previous.code ||
      room.matchNumber !== previous.matchNumber ||
      !room.game
    ) {
      this.snap(room);
      return;
    }
    if (room.game.version === previous.game?.version) return; // chat/presence/duplicate ACK
    const event = room.lastEvent;
    if (
      !event ||
      event.fromVersion !== previous.game?.version ||
      event.toVersion !== room.game.version ||
      room.game.version <= previous.game.version
    ) {
      this.snap(room);
      return;
    }
    const path =
      event.kind === 'move'
        ? movementPath(event.color, event.from, event.to, event.tokenIndex)
        : [];
    const duration =
      event.kind === 'move'
        ? path.length * ANIMATION.STEP_MS + ANIMATION.LAND_MS
        : event.kind === 'roll'
          ? ANIMATION.DICE_MS
          : 0;
    const elapsed = Math.max(0, (room.serverTime ?? event.at) - event.at);
    const item = { previous, room, event, path, duration, elapsed, received: this.now() };
    if (elapsed >= duration && duration > 0) {
      this.snap(room);
      return;
    }
    if (reducedMotion || duration === 0) {
      this.snap(room);
      if (event.kind === 'roll') {
        this.onCue('dice');
        if (room.game.lastRoll === 6) this.onCue('six');
      }
      if (event.kind === 'move') this.onCue('step');
      this.completeCues(item);
      return;
    }
    if (this.locked) this.queue.push(item);
    else this.play(item);
  }
  completeCues({ previous, room, event }) {
    if (event.captures?.length) this.onCue('capture');
    if (room.game.winnerId && room.game.winnerId !== previous.game?.winnerId) this.onCue('win');
    else if (room.game.turn !== previous.game?.turn) this.onCue('turn');
  }
  play(item) {
    const { previous, room, event, path, duration } = item;
    const elapsed = item.elapsed + this.now() - item.received;
    if (elapsed >= duration) {
      this.emit({ game: room.game, phase: 'idle', moving: null });
      this.drain();
      return;
    }
    const generation = ++this.generation;
    const later = (fn, ms) => {
      this.timer = this.schedule(
        () => {
          if (generation === this.generation) fn();
        },
        Math.max(0, ms),
      );
    };
    const finish = () => {
      this.emit({ game: room.game, phase: 'idle', moving: null, completedId: event.id });
      this.completeCues(item);
      this.drain();
    };
    if (event.kind === 'roll') {
      this.onCue('dice');
      this.emit({ game: previous.game, phase: 'rolling', moving: null, eventId: event.id });
      later(() => {
        if (room.game.lastRoll === 6) this.onCue('six');
        finish();
      }, duration - elapsed);
      return;
    }
    const visual = structuredClone(previous.game);
    const actor = visual.players.find((p) => p.id === event.playerId);
    const startIndex = Math.floor(elapsed / ANIMATION.STEP_MS);
    // A slightly late snapshot starts at the current hop instead of replaying the past.
    const step = (index) => {
      if (index >= path.length) {
        this.emit({
          game: room.game,
          phase: 'landing',
          moving: { ...event, step: path.length, total: path.length },
        });
        later(finish, ANIMATION.LAND_MS);
        return;
      }
      actor.tokens[event.tokenIndex] = path[index].progress;
      this.emit({
        game: structuredClone(visual),
        phase: 'moving',
        moving: { ...event, step: index + 1, total: path.length },
      });
      const remaining =
        index === startIndex
          ? ANIMATION.STEP_MS - (elapsed % ANIMATION.STEP_MS)
          : ANIMATION.STEP_MS;
      later(() => {
        this.onCue('step');
        step(index + 1);
      }, remaining);
    };
    if (startIndex >= path.length) {
      this.emit({
        game: room.game,
        phase: 'landing',
        moving: { ...event, step: path.length, total: path.length },
      });
      later(finish, duration - elapsed);
    } else step(startIndex);
  }
  drain() {
    const next = this.queue.shift();
    if (next) this.play(next);
  }
  dispose() {
    this.stop();
  }
}
