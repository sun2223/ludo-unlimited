import test from 'node:test';
import assert from 'node:assert/strict';
import { VOICE_NOTE_POLICY, validateVoiceNoteMetadata } from '../chat.js';
test('voice notes are disabled; the future upload policy bounds duration, size and MIME type', () => {
  assert.equal(VOICE_NOTE_POLICY.ENABLED, false);
  assert.deepEqual(
    validateVoiceNoteMetadata({
      durationMs: 15000,
      bytes: 524288,
      mime: 'audio/webm;codecs=opus',
      url: 'https://untrusted.example',
    }),
    { durationMs: 15000, bytes: 524288, mime: 'audio/webm' },
  );
  for (const invalid of [
    { durationMs: 15001, bytes: 10, mime: 'audio/webm' },
    { durationMs: 0, bytes: 10, mime: 'audio/webm' },
    { durationMs: 1000, bytes: 524289, mime: 'audio/webm' },
    { durationMs: 1000, bytes: 100, mime: 'text/html' },
  ])
    assert.throws(() => validateVoiceNoteMetadata(invalid));
});
