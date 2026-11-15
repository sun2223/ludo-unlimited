import test from 'node:test';
import assert from 'node:assert/strict';
import { EventGate } from '../src/social/EventGate.js';
test('social gate rejects duplicate, expired, foreign-room and previous-match events', () => {
  const gate = new EventGate(),
    room = { code: 'ABC234', matchNumber: 2 },
    event = { id: 'one', code: room.code, matchNumber: 2, expiresAt: 1100 };
  assert.equal(gate.accept({ ...event, code: 'WRONG' }, room, 1000), false);
  assert.equal(gate.accept({ ...event, matchNumber: 1 }, room, 1000), false);
  assert.equal(gate.accept(event, room, 1100), false);
  assert.equal(gate.accept(event, room, 1000), true);
  assert.equal(gate.accept(event, room, 1000), false);
});
