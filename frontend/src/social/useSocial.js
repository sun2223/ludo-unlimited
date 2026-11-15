import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { socket, request } from '../network/client.js';
import { soundManager } from '../audio/SoundManager.js';
import { EventGate } from './EventGate.js';
const AUTO_SOUNDS = {
  no_six: 'aayega',
  six: 'sher',
  capture: 'wah',
  loss: 'dhoka',
  revenge: 'ruk_ja',
  near_win: 'sher',
  win: 'game_over',
  slow: 'aayega',
};
export function useSocial(room, connected) {
  const [events, setEvents] = useState([]),
    [sending, setSending] = useState(false),
    [blockedUntil, setBlockedUntil] = useState(0),
    [hint, setHint] = useState('');
  const gate = useRef(new EventGate()),
    current = useRef(),
    anchor = useRef({ stamp: null, time: 0 }),
    pending = useRef(false);
  const settings = useSyncExternalStore(soundManager.subscribe, soundManager.getSnapshot);
  if (anchor.current.stamp !== room.serverTime)
    anchor.current = { stamp: room.serverTime, time: Date.now() };
  current.current = { room, connected };
  const serverNow = () => anchor.current.stamp + Date.now() - anchor.current.time;
  const receiveRef = useRef();
  receiveRef.current = (event) => {
    const state = current.current;
    if (
      !state.connected ||
      document.hidden ||
      !gate.current.accept(event, state.room, Math.max(serverNow(), event.sentAt ?? 0))
    )
      return;
    if (event.kind === 'auto' && !soundManager.settings.autoBanter) return;
    setEvents((previous) => [...previous, event].slice(-5));
    const sound =
      event.kind === 'sound'
        ? event.sound
        : event.kind === 'auto'
          ? 'reaction_' + AUTO_SOUNDS[event.category]
          : null;
    if (sound) soundManager.playEvent(sound, event.id);
  };
  useEffect(() => {
    const receive = (event) => receiveRef.current(event);
    socket.on('social:event', receive);
    const timer = setInterval(() => {
      setEvents((previous) => previous.filter((event) => event.expiresAt > serverNow()));
      setBlockedUntil((previous) => (previous && previous <= Date.now() ? 0 : previous));
    }, 250);
    return () => {
      socket.off('social:event', receive);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    setEvents([]);
    setBlockedUntil(0);
    setHint('');
  }, [room.code, room.matchNumber, connected]);
  useEffect(() => {
    if (!settings.autoBanter)
      setEvents((previous) => previous.filter((event) => event.kind !== 'auto'));
  }, [settings.autoBanter]);
  async function send(kind, key) {
    if (pending.current || !connected || blockedUntil > Date.now()) return;
    pending.current = true;
    setSending(true);
    setHint('');
    const requestId =
      globalThis.crypto?.randomUUID?.() ??
      Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    try {
      const result = await request('social:react', {
        kind,
        key,
        requestId,
        matchNumber: room.matchNumber,
      });
      setBlockedUntil(Date.now() + result.cooldownMs);
      receiveRef.current(result.event);
    } catch (error) {
      setHint(error.message);
      if (error.retryAfterMs) setBlockedUntil(Date.now() + error.retryAfterMs);
    } finally {
      pending.current = false;
      setSending(false);
    }
  }
  return {
    events: settings.autoBanter ? events : events.filter((event) => event.kind !== 'auto'),
    send,
    sending,
    blocked: blockedUntil > Date.now(),
    hint,
  };
}
