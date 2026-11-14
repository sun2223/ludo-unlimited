export function registerChat(io, socket, rooms, chat, handle) {
  handle('chat:send', async (data) => {
    const room = await chat.send(socket.data.session, data?.text);
    io.to(room.code).emit('chat:message', room.chat.at(-1));
    return {};
  });
}
