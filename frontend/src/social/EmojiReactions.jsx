import React from 'react';
function position(id) {
  let hash = 0;
  for (const char of id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return 15 + (hash % 70);
}
export function EmojiReactions({ events }) {
  return (
    <div className="emoji-sky" aria-hidden="true">
      {events
        .filter((event) => event.kind === 'emoji')
        .map((event) => (
          <span
            key={event.id}
            data-reaction-id={event.id}
            style={{ '--emoji-x': position(event.id) + '%' }}
          >
            {event.key}
          </span>
        ))}
    </div>
  );
}
