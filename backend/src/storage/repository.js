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
  }
  async ready() {
    await this.pool.query('SELECT code FROM ludo_rooms LIMIT 1');
    // This deployment uses one authoritative process; refuse a second writer against the same DB.
    this.lease = await this.pool.connect();
    try {
      const { rows } = await this.lease.query('SELECT pg_try_advisory_lock(173828, 1) AS locked');
      if (!rows[0].locked)
        throw new Error(
          'Another Ludo server is already using this database. Run one authoritative process.',
        );
      this.healthy = true;
      this.lease.on('error', (error) => {
        this.healthy = false;
        console.error('Database writer lease lost:', error.message);
      });
    } catch (error) {
      this.lease.release();
      this.lease = null;
      throw error;
    }
  }
  checkLease() {
    if (!this.healthy)
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
