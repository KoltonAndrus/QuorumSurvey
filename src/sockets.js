function registerSocketHandlers(io) {
  io.on('connection', socket => {
    socket.on('join_display', ({ surveyId }) => {
      if (surveyId) socket.join(`display:${surveyId}`);
    });
  });
}

module.exports = { registerSocketHandlers };
