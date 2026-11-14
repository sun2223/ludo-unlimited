import { useCallback, useEffect, useRef, useState } from 'react';
import { soundManager } from '../audio/SoundManager.js';
import { socket, request } from './client.js';
const key = 'ludo-unlimited-session';
function savedSession() {
  try {
    const invite = new URLSearchParams(location.search).get('room')?.toUpperCase();
    return JSON.parse(localStorage.getItem(invite ? `${key}-${invite}` : key));
  } catch {
    return null;
  }
}
function storeSession(value) {
  try {
    if (value) {
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem(`${key}-${value.code}`, JSON.stringify(value));
    } else localStorage.removeItem(key);
  } catch {
    /* Current connection works when storage is disabled. */
  }
}
function credentialFor(code) {
  try {
    return JSON.parse(localStorage.getItem(`${key}-${code?.toUpperCase().trim()}`));
  } catch {
    return null;
  }
}
export function useRoom() {
  const [room, setRoom] = useState(null),
    [session, setSession] = useState(savedSession),
    [connected, setConnected] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const sessionRef = useRef(session);
  const pending = useRef(false);
  const update = useCallback(
    (incoming) =>
      setRoom((previous) => {
        if (previous?.code === incoming.code && previous.revision > incoming.revision)
          return previous;
        const messages = new Map(
          [...(previous?.code === incoming.code ? previous.chat : []), ...incoming.chat].map(
            (m) => [m.id, m],
          ),
        );
        return {
          ...incoming,
          chat: [...messages.values()].sort((a, b) => a.at - b.at).slice(-100),
        };
      }),
    [],
  );
  useEffect(() => {
    let disposed = false,
      retryTimer;
    async function onConnect() {
      clearTimeout(retryTimer);
      const connectionId = socket.id;
      setConnected(true);
      setReady(false);
      if (sessionRef.current) {
        try {
          const result = await request('room:resume', sessionRef.current);
          if (disposed || connectionId !== socket.id) return;
          update(result.room);
          setError('');
        } catch (e) {
          if (disposed || connectionId !== socket.id) return;
          setError(e.message);
          if (!/rejoin credential|Room not found|seat is no longer/i.test(e.message)) {
            retryTimer = setTimeout(() => {
              if (socket.connected) onConnect();
            }, 2000);
            return;
          }
          setRoom(null);
          sessionRef.current = null;
          setSession(null);
          storeSession(null);
        }
      } else setError('');
      setReady(true);
    }
    function onMessage(message) {
      if (
        socket.connected &&
        sessionRef.current &&
        message.playerId !== sessionRef.current.playerId
      )
        soundManager.play('chat');
      setRoom((previous) =>
        !previous || previous.chat.some((m) => m.id === message.id)
          ? previous
          : { ...previous, chat: [...previous.chat, message].slice(-100) },
      );
    }
    function onDisconnect() {
      clearTimeout(retryTimer);
      setConnected(false);
      setReady(false);
    }
    function onConnectError() {
      setConnected(false);
      setError('Can’t reach the table. We’ll keep trying to reconnect.');
    }
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('room:state', update);
    socket.on('chat:message', onMessage);
    socket.connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('room:state', update);
      socket.off('chat:message', onMessage);
      socket.disconnect();
    };
  }, [update]);
  async function run(event, data) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const rejoin = event === 'room:join' && credentialFor(data.code);
      const result = await request(rejoin ? 'room:resume' : event, rejoin || data);
      if (result.session) {
        sessionRef.current = result.session;
        setSession(result.session);
        storeSession(result.session);
      }
      if (result.room) update(result.room);
      if (event === 'room:leave') {
        if (!room?.game) {
          try {
            localStorage.removeItem(`${key}-${room?.code}`);
          } catch {}
        }
        sessionRef.current = null;
        setSession(null);
        storeSession(null);
        setRoom(null);
      }
      return result;
    } catch (e) {
      setError(e.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { room, session, connected: connected && ready, error, setError, busy, run };
}
