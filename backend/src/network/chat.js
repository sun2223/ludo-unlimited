export function registerChat(io, socket, rooms, chat, handle) {
  handle('chat:send', async (data) => {
    if (data?.type !== undefined && data.type !== 'text')
      throw new Error('Only text messages are available right now.');
    const room = await chat.send(socket.data.session, data?.text);
    io.to(room.code).emit('chat:message', room.chat.at(-1));
    return {};
  });
}
