import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomService } from '../src/rooms/service.js';
import { MemoryRepository } from '../src/storage/repository.js';
import { SocialService } from '../src/banter/SocialService.js';
import { EMOJIS } from '../../shared/social.js';
test('only the six approved emoji are broadcast as short-lived non-audio room reactions', async () => {
  let now = 100000;
  const rooms = new RoomService(new MemoryRepository(), { now: () => now }),
    social = new SocialService(rooms),
    a = await rooms.create('Alice');
  for (let index = 0; index < EMOJIS.length; index++) {
    const result = await social.react(a.session, {
      kind: 'emoji',
      key: EMOJIS[index],
      requestId: 'emoji-request-' + index,
      matchNumber: 0,
    });
    assert.equal(result.event.key, EMOJIS[index]);
    assert.equal(result.event.kind, 'emoji');
    assert.equal(result.event.sound, undefined);
    assert.equal(result.event.code, a.room.code);
    assert.ok(result.event.expiresAt > result.event.at);
    now += 16000;
  }
  await assert.rejects(() =>
    social.react(a.session, {
      kind: 'emoji',
      key: '<img>',
      requestId: 'emoji-not-approved',
      matchNumber: 0,
    }),
  );
});
