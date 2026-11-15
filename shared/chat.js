// Forward-compatible message envelope. Voice-note transport is intentionally disabled.
export const CHAT_TYPES = Object.freeze({ TEXT: 'text', VOICE_NOTE: 'voice-note' });
export const VOICE_NOTE_POLICY = Object.freeze({
  ENABLED: false,
  MAX_DURATION_MS: 15000,
  MAX_BYTES: 512 * 1024,
  UPLOAD_TTL_MS: 60000,
  RETENTION_HOURS: 24,
  MIME_TYPES: Object.freeze(['audio/webm', 'audio/ogg', 'audio/mp4']),
});
export function validateVoiceNoteMetadata(metadata) {
  if (
    !metadata ||
    !Number.isInteger(metadata.durationMs) ||
    metadata.durationMs <= 0 ||
    metadata.durationMs > VOICE_NOTE_POLICY.MAX_DURATION_MS
  )
    throw new Error('A voice note must be at most 15 seconds.');
  if (
    !Number.isInteger(metadata.bytes) ||
    metadata.bytes <= 0 ||
    metadata.bytes > VOICE_NOTE_POLICY.MAX_BYTES
  )
    throw new Error('A voice note must be at most 512 KiB.');
  const mime =
    typeof metadata.mime === 'string' ? metadata.mime.toLowerCase().split(';')[0].trim() : '';
  if (!VOICE_NOTE_POLICY.MIME_TYPES.includes(mime))
    throw new Error('Unsupported voice note format.');
  return { durationMs: metadata.durationMs, bytes: metadata.bytes, mime };
}
