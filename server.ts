import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import eventRoutes from './routes/events.js';
import eventReportsRoutes from './routes/eventReports.js';
import userRoutes from './routes/users.js';
import departmentRoutes from './routes/departments.js';
import resourceAvailabilityRoutes from './routes/resourceAvailability.js';
import locationAvailabilityRoutes from './routes/locationAvailability.js';
import locationRequirementsRoutes from './routes/locationRequirements.js';
import departmentPermissionsRoutes from './routes/departmentPermissions.js';
import messageRoutes from './routes/messages.js';
import notificationRoutes from './routes/notifications.js';
import loginLogsRoutes from './routes/loginLogs.js';
import userActivityLogsRoutes from './routes/userActivityLogs.js';
import { startScheduler, runCleanupNow } from './services/scheduler.js';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables (only if .env file exists - in Docker, use ENV vars instead)
try {
  const envPath = path.join(__dirname, '.env');
  dotenv.config({ path: envPath });
} catch (error) {
  // Silently fail if .env doesn't exist (expected in Docker)
  console.log('ℹ️ No .env file found (expected in Docker - using environment variables)');
}

const app = express();
const httpServer = createServer(app);

// CORS allowed origins from environment variable or defaults
const allowedOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : [
      "http://localhost:5173", 
      "http://localhost:8080", 
      "http://localhost:3000",
      "https://eventscheduler.bataan.gov.ph",
      "https://eventscheduler-api.bataan.gov.ph"
    ];

// Re-enable Socket.IO server with proper connection management
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
  },
  // Add connection limits to prevent spam
  maxHttpBufferSize: 1e6, // 1MB
  pingTimeout: 60000,
  pingInterval: 25000,
  // Enable transports
  transports: ['websocket', 'polling'],
  // Limit connections per IP
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  }
});

// Make Socket.IO instance available to routes
app.set('io', io);

// Use port 3000 by default. Ignore PORT env var if it's 5000 (Coolify default)
const PORT = (process.env.PORT && process.env.PORT !== '5000') ? parseInt(process.env.PORT) : 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// Trust proxy - required for Coolify/reverse proxy setups
app.set('trust proxy', 1);

// Log environment and CORS origins on startup for debugging
console.log('🔐 NODE_ENV:', process.env.NODE_ENV);
console.log('🔐 CORS_ORIGINS env var:', process.env.CORS_ORIGINS);
console.log('🔐 CORS Allowed Origins:', allowedOrigins);

// Log all incoming requests for debugging (disabled for production - too verbose)
// app.use((req, res, next) => {
//   console.log(`📨 ${req.method} ${req.path} - Origin: ${req.headers.origin || 'no-origin'}`);
//   next();
// });

// Manual CORS headers for preflight - MUST come before cors middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Check if origin is allowed
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Expose-Headers', 'Content-Type, Authorization');
  } else if (origin) {
    console.log('❌ CORS rejected origin:', origin);
  }
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  
  next();
});

// Middleware - CORS configuration with preflight support
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('❌ CORS rejected origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Type', 'Authorization', 'Set-Cookie'],
  preflightContinue: false,
  optionsSuccessStatus: 200
}));

// Increase body size limits for large file uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Make io available to routes (disabled)
app.set('io', io);

// Socket.IO connection handling with proper tracking
const connectedUsers = new Map(); // Track connected users to prevent duplicates

io.on('connection', (socket) => {
  // Join user to their personal room (for receiving messages)
  socket.on('join-user-room', (userId) => {
    // Check if user is already connected with a different socket
    if (connectedUsers.has(userId)) {
      const oldSocketId = connectedUsers.get(userId);
      if (oldSocketId !== socket.id) {
        // Update to new socket ID
        connectedUsers.set(userId, socket.id);
      }
    } else {
      connectedUsers.set(userId, socket.id);
    }

    // Always join the room (in case of reconnection)
    socket.join(`user-${userId}`);
  });

  // Test connection handler
  socket.on('test-connection', (data) => {
    socket.emit('test-response', { message: 'Connection test successful', timestamp: new Date() });
  });

  // Join conversation room with rate limiting
  socket.on('join-conversation', (conversationId) => {
    socket.join(`conversation-${conversationId}`);
  });

  // Leave conversation room
  socket.on('leave-conversation', (conversationId) => {
    socket.leave(`conversation-${conversationId}`);
  });

  socket.on('disconnect', () => {
    // Clean up user tracking
    for (const [userId, socketId] of connectedUsers.entries()) {
      if (socketId === socket.id) {
        connectedUsers.delete(userId);
        break;
      }
    }
  });
});

// Routes
app.use('/api/events', eventRoutes);
app.use('/api/event-reports', eventReportsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/resource-availability', resourceAvailabilityRoutes);
app.use('/api/location-availability', locationAvailabilityRoutes);
app.use('/api/location-requirements', locationRequirementsRoutes);
app.use('/api/department-permissions', departmentPermissionsRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/login-logs', loginLogsRoutes);
app.use('/api/user-activity-logs', userActivityLogsRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'PGB Event Scheduler API is running!',
    timestamp: new Date().toISOString()
  });
});

// Manual cleanup trigger route (for testing)
app.post('/api/cleanup-now', async (req, res) => {
  try {
    const result = await runCleanupNow();
    
    res.json({
      success: true,
      message: 'Cleanup completed successfully',
      result: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Cleanup failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// MongoDB Connection
const connectDB = async () => {
  try {
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    console.log('🔄 Connecting to MongoDB Atlas...');
    
    await mongoose.connect(MONGODB_URI);
    
    console.log('✅ MongoDB Atlas connected successfully!');
    console.log(`📊 Database: ${mongoose.connection.db?.databaseName}`);
    
    // Start the automated scheduler with Socket.IO instance
    const io = app.get('io');
    startScheduler(io);
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

// Start server
const startServer = async () => {
  try {
    await connectDB();
    
    httpServer.listen(PORT, '0.0.0.0' as any, () => {
      console.log('🚀 PGB Event Scheduler Backend Server Started!');
      console.log(`📡 Server running on: http://0.0.0.0:${PORT}`);
      console.log(`🔌 Socket.IO enabled`);
      console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
      console.log(`📅 Events API: http://localhost:${PORT}/api/events`);
      console.log(`👥 Users API: http://localhost:${PORT}/api/users`);
      console.log('─'.repeat(50));
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
