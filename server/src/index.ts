import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import config from './config.js';
import logger from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import pool from './db/mysql.js';
import { connectRedis } from './db/redis.js';
import { initializeSocketIO } from './socket.js';
import ResourceService from './services/ResourceService.js';
import PigeonMailService from './services/PigeonMailService.js';

import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import characterRouter from './routes/character.js';
import mapRouter from './routes/map.js';
import resourceRouter from './routes/resource.js';
import buildRouter from './routes/build.js';
import chatRouter from './routes/chat.js';
import friendsRouter from './routes/friends.js';
import pigeonRouter from './routes/pigeon.js';

const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: config.cors.origin }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/character', characterRouter);
app.use('/map', mapRouter);
app.use('/resource', resourceRouter);
app.use('/build', buildRouter);
app.use('/chat', chatRouter);
app.use('/friends', friendsRouter);
app.use('/pigeon', pigeonRouter);

app.use(errorHandler);

const io = initializeSocketIO(httpServer);

// Periodically respawn depleted resource nodes (wood 5min / stone 10min / mineral 30min)
setInterval(() => {
  ResourceService.respawnResources().catch((err) =>
    logger.error('Resource respawn tick failed', err)
  );
}, 60_000);

const testDatabaseConnection = async () => {
  try {
    await pool.query('SELECT 1');
    logger.info('MySQL connection test successful');
  } catch (error) {
    logger.error('MySQL connection test failed', error);
  }
};

const startServer = async () => {
  try {
    // Connect to Redis
    await connectRedis();
    logger.info('Redis connected successfully');

    // Test database connection
    await testDatabaseConnection();

    httpServer.listen(config.port, () => {
      logger.info(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
      logger.info(`REST API: http://localhost:${config.port}`);
      logger.info(`WebSocket: ws://localhost:${config.port}`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
};

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    pool.end();
    process.exit(0);
  });
});

startServer();
