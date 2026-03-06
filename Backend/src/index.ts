// Backend/src/index.ts
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { RoomManager } from './services/RoomManager.js';
import { dbService } from './services/Database.js';
import authRoutes from './routes/auth.js';
import type { Player, PlayerMovementData, JoinRoomData } from './types/Player.js';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Configure Middleware
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:3000',
].filter(Boolean) as string[];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      var msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
}));
app.use(express.json());

// Initialize Database
dbService.init().then(() => {
  console.log('? Database initialized');
}).catch((err: any) => {
  console.error('? Database initialization failed:', err);
});

// Routes
app.use('/auth', authRoutes);

// Initialize Socket.IO with CORS
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Initialize Room Manager
const roomManager = new RoomManager();

// Health check endpoint
app.get('/health', (req, res) => {
  const stats = roomManager.getStats();
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    ...stats,
    timestamp: new Date().toISOString(),
  });
});

// Socket.IO Connection Handler
io.on('connection', (socket: Socket) => {
  console.log(`\n?? New connection: ${socket.id}`);

  // EVENT: Player joins a room
  socket.on('join-room', (data: JoinRoomData) => {
    const { roomId, username, x, y, userId, avatarSprite, avatarColor } = data;

    // Create player object
    const newPlayer: Player = {
      id: socket.id,
      userId: userId || 'anonymous',
      username,
      x,
      y,
      direction: 'down',
      animation: 'idle-down',
      roomId,
      lastUpdate: Date.now(),
      avatarSprite,
      avatarColor,
      status: 'online',
    };

    // Get existing players in room BEFORE adding new player
    const existingPlayers = roomManager.getPlayersInRoom(roomId);

    // Add player to room
    roomManager.addPlayerToRoom(roomId, newPlayer);

    // Join the Socket.IO room
    socket.join(roomId);

    // Send existing players to the new player
    socket.emit('existing-players', existingPlayers);

    // Notify other players in the room about the new player
    socket.to(roomId).emit('player-joined', newPlayer);

    // Send confirmation to the player
    socket.emit('join-room-success', {
      playerId: socket.id,
      roomId,
      playerCount: existingPlayers.length + 1,
    });
  });

  // EVENT: Player movement
  socket.on('player-movement', (data: PlayerMovementData) => {
    const { x, y, direction, animation, status } = data;

    // Update player position in room manager
    const updatedPlayer = roomManager.updatePlayerPosition(
      socket.id,
      x,
      y,
      direction,
      animation
    );

    if (updatedPlayer) {
      if (status) updatedPlayer.status = status;
      const roomId = roomManager.getPlayerRoom(socket.id);
      if (roomId) {
        // Broadcast to all OTHER players in the same room
        socket.to(roomId).emit('player-moved', {
          id: socket.id,
          x,
          y,
          direction,
          animation,
          status: updatedPlayer.status,
        });
      }
    }
  });

  // EVENT: Player disconnects
  socket.on('disconnect', () => {
    const player = roomManager.getPlayer(socket.id);
    const roomId = roomManager.removePlayer(socket.id);

    if (roomId && player) {
      socket.to(roomId).emit('player-left', {
        id: socket.id,
        username: player.username,
      });
    }
  });
});

// Start server
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`\n?? Server running on http://localhost:${PORT}`);
});
