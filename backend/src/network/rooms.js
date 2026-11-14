export function registerRooms(io, socket, service, handle) {
  // Serialize entry per socket so simultaneous requests cannot create ghost seats.
  let entering = false;
  async function enter(task) {
    if (socket.data.session || entering) throw new Error('Already joining or seated in a room.');
    entering = true;
    try {
      return await attach(await task());
    } finally {
      entering = false;
    }
  }
  async function attach(result) {
    if (socket.data.session) throw new Error('Leave your current room first.');
    if (!socket.connected) throw new Error('Connection closed. Rejoin the table.');
    socket.data.session = result.session;
    service.connect(result.session, socket.id);
    await socket.join(result.room.code);
    io.to(result.room.code).emit('room:state', service.publicRoom(result.room));
    return { session: result.session, room: service.publicRoom(result.room) };
  }
  handle('room:create', (data) => enter(() => service.create(data?.name)));
  handle('room:join', (data) => enter(() => service.join(data?.code, data?.name)));
  handle('room:resume', async (data) => {
    if (!socket.data.session) return enter(() => service.resume(data));
    const result = await service.resume(data);
    if (
      result.session.code !== socket.data.session.code ||
      result.session.playerId !== socket.data.session.playerId
    )
      throw new Error('Leave your current room first.');
    return { session: result.session, room: service.publicRoom(result.room) };
  });
  handle('room:leave', async () => {
    const room = await service.leave(socket.data.session);
    service.disconnect(socket.id);
    socket.data.session = null;
    await socket.leave(room.code);
    io.to(room.code).emit('room:state', service.publicRoom(room));
    return {};
  });
  socket.on('disconnect', async () => {
    const session = service.disconnect(socket.id);
    if (session) {
      try {
        io.to(session.code).emit('room:state', service.publicRoom(await service.get(session.code)));
      } catch (error) {
        console.error('Disconnect state:', error.message);
      }
    }
  });
}
