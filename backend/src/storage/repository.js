import pg from 'pg';
export class MemoryRepository {
  rooms = new Map();
  async get(code) {
    return structuredClone(this.rooms.get(code) ?? null);
  }
  async create(room) {
    if (this.rooms.has(room.code)) return false;
    this.rooms.set(room.code, structuredClone(room));
    return true;
  }
  async save(room) {
    this.rooms.set(room.code, structuredClone(room));
  }
  async close() {}
}
export class PostgresRepository {
  constructor(connectionString) {
    this.pool = new pg.Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
    this.pool.on('error', (error) => console.error('PostgreSQL pool error:', error.message));
    this.standby = false;
    this.closed = false;
    this.activation = Promise.resolve();
  }
  async ready({ allowStandby = false, handoffTimeoutMs = 180000, retryMs = 200 } = {}) {
    await this.pool.query('SELECT code FROM ludo_rooms LIMIT 1');
    this.lease = await this.pool.connect();
    this.lease.on('error', (error) => {
      this.healthy = false;
      this.failHandoff(error);
      console.error('Database writer lease lost:', error.message);
    });
    try {
      if (await this.acquireLease()) return;
      if (!allowStandby)
        throw new Error(
          'Another Ludo server is already using this database. Run one authoritative process.',
        );
      this.healthy = false;
      this.standby = true;
      this.activation = new Promise((resolve, reject) => {
        this.resolveActivation = resolve;
        this.rejectActivation = reject;
      });
      // A caller may attach its waiter after constructing the HTTP server.
      this.activation.catch(() => {});
      this.deadline = setTimeout(
        () =>
          this.failHandoff(
            new Error(
              'Timed out waiting for the previous server to release the database writer lease. Keep one Render instance.',
            ),
          ),
        handoffTimeoutMs,
      );
      this.deadline.unref();
      const poll = async () => {
        if (this.closed || !this.standby) return;
        try {
          if (await this.acquireLease()) return;
        } catch (error) {
          this.failHandoff(error);
          return;
        }
        if (this.standby && !this.closed) {
          this.retry = setTimeout(() => {
            this.pendingPoll = poll();
          }, retryMs);
          this.retry.unref();
        }
      };
      this.retry = setTimeout(() => {
        this.pendingPoll = poll();
      }, retryMs);
      this.retry.unref();
    } catch (error) {
      this.healthy = false;
      this.lease.release(true);
      this.lease = null;
      throw error;
    }
  }
  async acquireLease() {
    const { rows } = await this.lease.query({
      text: 'SELECT pg_try_advisory_lock(173828, 1) AS locked',
      query_timeout: 5000,
    });
    if (!rows[0].locked) return false;
    if (this.closed || this.handoffFailed) {
      await this.lease.query('SELECT pg_advisory_unlock(173828, 1)');
      return false;
    }
    this.healthy = true;
    this.standby = false;
    clearTimeout(this.deadline);
    clearTimeout(this.retry);
    this.resolveActivation?.();
    return true;
  }
  failHandoff(error) {
    if (!this.standby) return;
    this.standby = false;
    this.healthy = false;
    this.handoffFailed = true;
    clearTimeout(this.retry);
    clearTimeout(this.deadline);
    this.rejectActivation?.(error);
  }
  whenActive() {
    if (this.closed || (this.healthy === false && !this.standby))
      return Promise.reject(new Error('Database writer is unavailable.'));
    return this.activation;
  }
  checkLease() {
    if (!this.healthy || this.closed)
      throw Object.assign(new Error('Database writer is unavailable.'), {
        code: 'LUDO_DB_UNAVAILABLE',
      });
  }
  async get(code) {
    this.checkLease();
    return (
      (await this.pool.query('SELECT snapshot FROM ludo_rooms WHERE code = $1', [code])).rows[0]
        ?.snapshot ?? null
    );
  }
  async create(room) {
    this.checkLease();
    return (
      (
        await this.pool.query(
          'INSERT INTO ludo_rooms(code, snapshot) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [room.code, room],
        )
      ).rowCount === 1
    );
  }
  async save(room) {
    this.checkLease();
    await this.pool.query(
      'UPDATE ludo_rooms SET snapshot = $2, updated_at = now() WHERE code = $1',
      [room.code, room],
    );
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    this.failHandoff(new Error('Server stopped before database handoff completed.'));
    clearTimeout(this.retry);
    clearTimeout(this.deadline);
    await this.pendingPoll?.catch(() => {});
    const wasHealthy = this.healthy;
    this.healthy = false;
    try {
      if (this.lease) {
        try {
          if (wasHealthy) await this.lease.query('SELECT pg_advisory_unlock(173828, 1)');
        } finally {
          this.lease.release(!wasHealthy);
          this.lease = null;
        }
      }
    } finally {
      await this.pool.end();
    }
  }
}
