# Future voice notes — architecture only

This release does not record or upload audio, request microphone access, or provide continuous voice chat. Soundboard effects are synthesized locally. Text chat remains operational.

The versioned chat envelope now includes `type: "text"`; stored legacy messages without a type still render as text. `ChatMessage.jsx` routes presentation by type with a safe unavailable-message fallback. The existing `chat:send` route explicitly rejects unsupported types. There is no media or upload endpoint.

`shared/chat.js` defines the disabled voice-note policy and a strict metadata validator: 15 seconds, 512 KiB, WebM/Ogg/MP4 audio, 60-second upload tickets, and a proposed 24-hour retention window. The validator strips extraneous properties. Metadata alone must not be trusted as file verification.

## Planned opt-in flow

1. A future Record button calls `getUserMedia({audio:true})` only from the user's explicit gesture and only after explaining the short-note behavior. Let the browser ask for microphone permission. Denial/cancel leaves text chat and the game working.
2. A separate recorder hook owns MediaRecorder, negotiates `isTypeSupported`, caps duration/bytes, stops all microphone tracks on stop/cancel/unmount, and revokes preview object URLs.
3. An authenticated upload service validates current room membership and the metadata policy, applies a distinct upload cooldown, and issues a single-use, player/room-bound upload ticket expiring in 60 seconds. Do not put recordings into Socket.IO packets, PostgreSQL JSON snapshots, logs, or browser local storage.
4. A private object-storage adapter supplies `issueUploadTicket`, `inspectObject`, `createReadUrl`, and `deleteObject`. Configure credentials server-side on Render; do not expose them to Vite.
5. Before accepting completion, independently inspect actual object bytes, audio format and duration; enforce the size limit at upload and storage layers. Consume the ticket once and reject arbitrary URLs or cross-room object keys. Publish the voice-note message only after verified storage completion.
6. Persist only a message ID, type, sender, room, private object key, validated duration/size/MIME, and timestamp. Check room authorization for every read; provide short-lived signed playback URLs rather than public bucket URLs.
7. An explicit Play control handles playback. Stop playback when switching rooms. Delete expired, orphaned and cancelled objects using a retention job. Add quota, permission-denial, cross-room, expired-ticket, oversized-object and object-deletion tests before enabling the feature.

Implement these routes and storage lifecycle in a later release, behind `VOICE_NOTE_POLICY.ENABLED`. No Render setting, dependency or database migration is required for the architecture in this release.
