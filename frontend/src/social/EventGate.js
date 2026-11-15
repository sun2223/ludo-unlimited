// Bounded deduplication + server-relative expiry. Never replay saved social history.
export class EventGate {
  constructor(limit = 512) {
    this.seen = new Set();
    this.limit = limit;
  }
  accept(event, room, serverNow) {
    if (
      !event ||
      typeof event.id !== 'string' ||
      event.code !== room.code ||
      event.matchNumber !== room.matchNumber ||
      !Number.isFinite(event.expiresAt) ||
      event.expiresAt <= serverNow ||
      this.seen.has(event.id)
    )
      return false;
    this.seen.add(event.id);
    if (this.seen.size > this.limit) this.seen.delete(this.seen.values().next().value);
    return true;
  }
}
