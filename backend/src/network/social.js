export function registerSocial(io, socket, social, handle) {
  handle('social:react', async (data) => {
    const result = await social.react(socket.data.session, data);
    result.event = { ...result.event, sentAt: social.rooms.now() };
    if (!result.duplicate) io.to(result.event.code).emit('social:event', result.event);
    return result;
  });
}
