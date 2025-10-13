import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import User, { IUser } from '../models/User.js';

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}

export interface JWTPayload {
  userId: string;
  username: string;
  role: string;
}

export const generateToken = (user: IUser): string => {
  const payload: JWTPayload = {
    userId: (user._id as any).toString(),
    username: user.username,
    role: user.role
  };

  const secret: string = process.env.JWT_SECRET || '7K9mP3xQ8vN2wR5tY6uI1oP4sA7dF0gH3jK6lM9nB2cV5xZ8qW1eR4tY7uI0pA3s';
  
  return jwt.sign(payload, secret, { expiresIn: '7d' });
};

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const secret: string = process.env.JWT_SECRET || '7K9mP3xQ8vN2wR5tY6uI1oP4sA7dF0gH3jK6lM9nB2cV5xZ8qW1eR4tY7uI0pA3s';
    const decoded = jwt.verify(token, secret) as JWTPayload;
    
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - user not found'
      });
    }

    if (user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'Admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }

  next();
};
