import { Router, Request, Response, NextFunction } from 'express';
import AuthService from '../services/AuthService.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Register endpoint
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Username, email and password are required',
      });
    }

    const result = await AuthService.register(username, email, password);
    res.status(201).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
});

// Login endpoint
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { usernameOrEmail, password } = req.body;

    if (!usernameOrEmail || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Username/email and password are required',
      });
    }

    const result = await AuthService.login(usernameOrEmail, password);
    res.json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
});

// Refresh token endpoint
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        status: 'error',
        message: 'Refresh token is required',
      });
    }

    const result = await AuthService.refreshToken(refreshToken);
    res.json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
});

// Logout endpoint (protected)
router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User not authenticated',
      });
    }

    const result = await AuthService.logout(userId);
    res.json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
});

// Get current user (protected) - for testing authentication
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      status: 'success',
      data: {
        user: req.user,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
