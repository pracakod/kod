const express = require('express');
const http = require('http');
const path = require('path');
const { generateMap } = require('./src/world/map');
const { setupWebSocketServer } = require('./src/network/websocket');
const { loadDatabase } = require('./src/data/database');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// anty-cache na statyki
app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false, maxAge: 0 }));
app.get('/health', (_req, res) => res.type('text/plain').send('ok'));

// Globalne zmienne
const WORLD = generateMap();
const players = new Map();
const sockets = new Map();
const fishingSessions = new Map();
const lastFishingStart = new Map();

// Setup WebSocket z przekazaniem referencji
const wss = setupWebSocketServer(server, {
  players,
  sockets,
  fishingSessions,
  lastFishingStart,
  WORLD
});

// Inicjalizacja serwera
async function startServer() {
  await loadDatabase();
  server.listen(PORT, () => {
    console.log('Server listening on http://localhost:' + PORT);
  });
}

startServer();

module.exports = { wss };