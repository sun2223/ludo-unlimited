import React from 'react';
import { CHAT_TYPES } from '../../../shared/chat.js';
export function ChatMessage({ message, player, me }) {
  const type = message.type ?? CHAT_TYPES.TEXT;
  return (
    <div className={`chat-message ${message.playerId === me ? 'mine' : ''}`}>
      <div>
        <b className={player?.color}>
          {player?.name ?? 'Former player'}
          {message.playerId === me ? ' (you)' : ''}
        </b>
        <time dateTime={new Date(message.at).toISOString()}>
          {new Date(message.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </time>
      </div>
      {type === CHAT_TYPES.TEXT ? (
        <p>{message.text}</p>
      ) : (
        <p className="message-unavailable">
          {type === CHAT_TYPES.VOICE_NOTE
            ? 'Voice note · playback unavailable'
            : 'Message unavailable'}
        </p>
      )}
    </div>
  );
}
