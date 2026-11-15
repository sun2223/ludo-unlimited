// Decorative reminder only: never forfeits turns, changes state or waits in the game action path.
export class SlowTurnMonitor {
  constructor(io, rooms) {
    this.io = io;
    this.rooms = rooms;
    this.watches = new Map();
    this.slowRecent = new Map();
    this.scanning = false;
    this.timer = setInterval(() => void this.scan(), rooms.banter.config.SCAN_MS);
    this.timer.unref();
  }
  observe(room) {
    const key = `${room.matchNumber}:${room.game?.version}`;
    if (this.watches.get(room.code)?.key !== key)
      this.watches.set(room.code, { key, since: this.rooms.now(), announced: false });
  }
  async scan() {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const codes = new Set([...this.rooms.presence.values()].map((s) => s.code));
      for (const code of this.watches.keys())
        if (!codes.has(code)) {
          this.watches.delete(code);
          this.slowRecent.delete(code);
        }
      for (const code of codes) {
        const room = await this.rooms.get(code);
        if (room.game?.status !== 'active') {
          this.watches.delete(code);
          continue;
        }
        this.observe(room);
        const watch = this.watches.get(code);
        const current = room.game.players[room.game.turn];
        if (!this.rooms.connected(code, current.id)) {
          watch.since = this.rooms.now();
          continue;
        }
        if (watch.announced) continue;
        if (this.rooms.now() - watch.since < this.rooms.banter.config.SLOW_TURN_MS) continue;
        // A committed action replaces this watch, so a stale scan cannot announce the old turn.
        if (watch !== this.watches.get(code)) continue;
        watch.announced = true;
        const state = this.rooms.banter.ensure(room);
        state.recent.slow = this.slowRecent.get(code) ?? state.recent.slow ?? [];
        const event = this.rooms.banter.event(room, 'slow', current.id, null, this.rooms.now());
        this.slowRecent.set(code, state.recent.slow);
        this.io.to(code).emit('social:event', { ...event, sentAt: this.rooms.now() });
      }
    } catch (error) {
      console.error('Banter reminder unavailable:', error.message);
    } finally {
      this.scanning = false;
    }
  }
  close() {
    clearInterval(this.timer);
    this.watches.clear();
    this.slowRecent.clear();
  }
}
