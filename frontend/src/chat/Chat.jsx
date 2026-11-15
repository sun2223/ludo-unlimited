import React, { useEffect, useRef, useState } from 'react';
import { request } from '../network/client.js';
import { ChatMessage } from './ChatMessage.jsx';
import { Icon } from '../components/Icons.jsx';
export function Chat({ room, me, connected, onError }) {
  const [text, setText] = useState(''),
    [sending, setSending] = useState(false),
    feed = useRef(null);
  useEffect(() => {
    if (feed.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [room.chat.length]);
  async function send(event) {
    event.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await request('chat:send', { type: 'text', text });
      setText('');
    } catch (error) {
      onError(error.message);
    } finally {
      setSending(false);
    }
  }
  return (
    <section className="chat panel" aria-label="Room chat">
      <div className="panel-heading">
        <h3>
          Table talk <span className="tiny-pill">LIVE</span>
        </h3>
        <Icon name="people" size={17} />
      </div>
      <div className="chat-feed" ref={feed} role="log" aria-label="Messages" aria-live="polite">
        <div className="chat-welcome">
          <span className="chat-bubble-icon">“</span>
          <strong>The banter starts here.</strong>
          <p>Say hello, celebrate a six, or negotiate a very temporary alliance.</p>
        </div>
        {room.chat.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            player={room.players.find((p) => p.id === message.playerId)}
            me={me}
          />
        ))}
      </div>
      <form className="chat-form" onSubmit={send}>
        <input
          aria-label="Chat message"
          placeholder="A little friendly banter…"
          maxLength={300}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!connected}
        />
        <button
          className="icon-button send"
          aria-label="Send message"
          disabled={!connected || sending || !text.trim()}
        >
          <Icon name="send" size={18} />
        </button>
      </form>
      <p className="chat-caption">
        <Icon name="lock" size={11} /> Only the people at this table can see this chat.
      </p>
    </section>
  );
}
