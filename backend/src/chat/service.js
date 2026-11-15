import { randomUUID } from 'node:crypto';
export class ChatService {
  constructor(rooms) {
    this.rooms = rooms;
    this.lastSent = new Map();
  }
  async send(session, text) {
    if (!session) throw new Error('Join a room first.');
    if (
      typeof text !== 'string' ||
      !text.trim() ||
      text.trim().length > 300 ||
      /[\x00-\x08\x0b-\x1f\x7f]/.test(text)
    )
      throw new Error('Write a message of 1–300 characters.');
    const key = session.playerId;
    if (Date.now() - (this.lastSent.get(key) ?? 0) < 600)
      throw new Error('Give your friends a moment to reply.');
    this.lastSent.set(key, Date.now());
    return this.rooms.mutate(session, (room) => {
      room.chat.push({
        type: 'text',
        id: randomUUID(),
        playerId: key,
        text: text.trim(),
        at: Date.now(),
      });
      room.chat = room.chat.slice(-100);
    });
  }
}
