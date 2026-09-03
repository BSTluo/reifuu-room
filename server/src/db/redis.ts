import { createClient } from 'redis';
import config from '../config.js';
import logger from '../utils/logger.js';

const redisClient = createClient({
  socket: {
    host: config.redis.host,
    port: config.redis.port,
    ...(config.redis.tls ? { tls: true } : {}),
  },
  ...(config.redis.password ? { password: config.redis.password } : {}),
  database: config.redis.db,
});

redisClient.on('connect', () => {
  logger.info('Redis connection established');
});

redisClient.on('error', (err) => {
  logger.error('Redis error', err);
});

export const connectRedis = async () => {
  try {
    await redisClient.connect();
    logger.info('Redis client connected');
  } catch (error) {
    logger.error('Failed to connect to Redis', error);
    throw error;
  }
};

// Helper function to add key prefix
export const prefixKey = (key: string): string => {
  return `${config.redis.keyPrefix}${key}`;
};

export const getRedis = () => redisClient;

export default redisClient;
