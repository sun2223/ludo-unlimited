CREATE TABLE IF NOT EXISTS ludo_rooms (
  code varchar(6) PRIMARY KEY,
  snapshot jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ludo_rooms_updated_idx ON ludo_rooms(updated_at);
