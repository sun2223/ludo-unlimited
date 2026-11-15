export function registerGame(io, socket, rooms, handle, monitor) {
  const publish = (room) => {
    const state = rooms.publicRoom(room);
    io.to(room.code).emit('room:state', state);
    monitor?.observe(room);
    for (const event of room.social?.autoEvents ?? [])
      io.to(room.code).emit('social:event', { ...event, sentAt: rooms.now() });
    return { room: state };
  };
  handle('game:start', async () => publish(await rooms.start(socket.data.session)));
  for (const action of ['roll', 'move', 'skip'])
    handle('game:' + action, async (data) =>
      publish(await rooms.play(socket.data.session, data, action)),
    );
}
