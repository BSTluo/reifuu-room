import mysql from 'mysql2/promise';
import config from '../config.js';
import logger from '../utils/logger.js';

const pool = mysql.createPool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.database,
  waitForConnections: true,
  connectionLimit: config.database.poolMax,
  queueLimit: 100, // 限制队列长度，防止无限堆积
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  connectTimeout: 10000, // 10秒连接超时
  maxIdle: 10, // 最大空闲连接数
  idleTimeout: 60000, // 空闲连接60秒超时
});

pool.on('connection', () => {
  logger.info('MySQL connection established');
});

export const query = async (sql: string, params?: any[]) => {
  const start = Date.now();
  const connection = await pool.getConnection();
  try {
    // 设置查询超时为5秒
    await connection.query('SET SESSION MAX_EXECUTION_TIME=5000');
    const [rows] = await connection.execute(sql, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn('Slow query detected', { sql, duration, rowCount: Array.isArray(rows) ? rows.length : 0 });
    } else {
      logger.debug('Executed query', { sql, duration, rowCount: Array.isArray(rows) ? rows.length : 0 });
    }
    return rows;
  } catch (error) {
    logger.error('Query error', { sql, error });
    throw error;
  } finally {
    connection.release();
  }
};

export const getConnection = () => pool.getConnection();

export default pool;
