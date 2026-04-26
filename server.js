const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { loadData } = require('./src/store');
const apiRouter = require('./src/api');
const { registerSocketHandlers } = require('./src/sockets');

const LAN_IP = '98.50.19.151';

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Page routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')));
app.get('/results', (req, res) => res.sendFile(path.join(__dirname, 'views', 'results.html')));
app.get('/display/:id', (req, res) => res.sendFile(path.join(__dirname, 'views', 'display.html')));
app.get('/survey/:id', (req, res) => res.sendFile(path.join(__dirname, 'views', 'survey.html')));

// Convenience redirects → active survey
app.get('/display', (req, res) => {
  const { getState } = require('./src/store');
  const { activeSurveyId } = getState();
  if (activeSurveyId) return res.redirect(`/display/${activeSurveyId}`);
  res.redirect('/admin');
});
app.get('/survey', (req, res) => {
  const { getState } = require('./src/store');
  const { activeSurveyId } = getState();
  if (activeSurveyId) return res.redirect(`/survey/${activeSurveyId}`);
  res.redirect('/admin');
});

// REST API
app.use('/api', apiRouter(io));

// WebSocket
registerSocketHandlers(io);

// Server info (exposes LAN IP for QR code generation on clients)
app.get('/api/server-info', (req, res) => res.json({ ip: LAN_IP, port: PORT, baseUrl: `http://${LAN_IP}:${PORT}` }));

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

async function start() {
  await loadData();
  httpServer.listen(PORT, () => {
    console.log(`QuorumSurvey running at http://localhost:${PORT}`);
    console.log(`  Network: http://${LAN_IP}:${PORT}`);
    console.log(`  Admin:   http://${LAN_IP}:${PORT}/admin`);
  });
}

start();
