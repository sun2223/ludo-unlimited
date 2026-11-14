import { io } from 'socket.io-client';
export const socket = io({ autoConnect: false });
export function request(event, payload) {
  return new Promise((resolve, reject) => {
    if (!socket.connected) return reject(new Error('You are offline. Reconnecting…'));
    socket.timeout(8000).emit(event, payload, (error, result) => {
      if (error) reject(new Error('The server did not respond. Reconnect before retrying.'));
      else if (!result.ok) reject(new Error(result.error));
      else resolve(result);
    });
  });
}
