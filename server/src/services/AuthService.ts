import bcrypt from 'bcrypt';
import { query } from '../db/mysql.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { validateEmail, validatePassword, validateUsername } from '../utils/validation.js';
import logger from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';

export class AuthService {
  async register(username: string, email: string, password: string) {
    // Validate inputs
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      throw new AppError(usernameValidation.message!, 400);
    }

    if (!validateEmail(email)) {
      throw new AppError('Invalid email format', 400);
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      throw new AppError(passwordValidation.message!, 400);
    }

    try {
      // Check if username or email already exists
      const existingUsers: any = await query(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [username, email]
      );

      if (Array.isArray(existingUsers) && existingUsers.length > 0) {
        throw new AppError('Username or email already exists', 400);
      }

      // Hash password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Insert new user
      const result: any = await query(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        [username, email, passwordHash]
      );

      const userId = result.insertId;

      logger.info(`User registered: ${username}`);
      return {
        id: userId,
        username,
        email,
        message: 'Registration successful'
      };
    } catch (error: any) {
      if (error instanceof AppError) {
        throw error;
      }
      if (error.code === 'ER_DUP_ENTRY') {
        throw new AppError('Username or email already exists', 400);
      }
      logger.error('Registration error', error);
      throw new AppError('Registration failed', 500);
    }
  }

  async login(usernameOrEmail: string, password: string) {
    try {
      // Query by username or email
      const rows: any = await query(
        'SELECT id, username, email, password_hash FROM users WHERE username = ? OR email = ?',
        [usernameOrEmail, usernameOrEmail]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        throw new AppError('Invalid credentials', 401);
      }

      const user = rows[0];

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        throw new AppError('Invalid credentials', 401);
      }

      // Generate tokens
      const accessToken = generateAccessToken({
        userId: user.id.toString(),
        username: user.username,
      });

      const refreshToken = generateRefreshToken({
        userId: user.id.toString(),
        username: user.username,
      });

      // Store refresh token in database
      await query(
        'UPDATE users SET refresh_token = ? WHERE id = ?',
        [refreshToken, user.id]
      );

      logger.info(`User logged in: ${user.username}`);
      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
      };
    } catch (error: any) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Login error', error);
      throw new AppError('Login failed', 500);
    }
  }

  async refreshToken(token: string) {
    try {
      // Verify refresh token
      const payload = verifyRefreshToken(token);

      // Check if token exists in database
      const rows: any = await query(
        'SELECT id, username, email, refresh_token FROM users WHERE id = ?',
        [payload.userId]
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        throw new AppError('Invalid refresh token', 401);
      }

      const user = rows[0];

      // Verify token matches stored token
      if (user.refresh_token !== token) {
        throw new AppError('Invalid refresh token', 401);
      }

      // Generate new access token
      const accessToken = generateAccessToken({
        userId: user.id.toString(),
        username: user.username,
      });

      logger.info(`Token refreshed for user: ${user.username}`);
      return {
        accessToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
      };
    } catch (error: any) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Token refresh error', error);
      throw new AppError('Token refresh failed', 401);
    }
  }

  async logout(userId: string) {
    try {
      // Clear refresh token
      await query(
        'UPDATE users SET refresh_token = NULL WHERE id = ?',
        [userId]
      );

      logger.info(`User logged out: ${userId}`);
      return { message: 'Logout successful' };
    } catch (error: any) {
      logger.error('Logout error', error);
      throw new AppError('Logout failed', 500);
    }
  }
}

export default new AuthService();
