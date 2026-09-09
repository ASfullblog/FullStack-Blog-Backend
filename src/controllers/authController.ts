import express from 'express';
import jwt from 'jsonwebtoken';
import { authService } from '../services/authService';

/**
 * 认证控制器
 * 处理用户注册和登录请求
 */
export class AuthController {
  /**
   * 用户注册
   * @param req 请求对象
   * @param res 响应对象
   */
  async register(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { username, password, email } = req.body;

      // 验证参数
      if (!username || !password || !email) {
        res.status(400).json({
          code: 400,
          message: 'Username, password and email are required',
          data: null
        });
        return;
      }

      // 调用服务层注册用户
      const user = await authService.register(username, password, email);

      res.status(201).json({
        code: 201,
        message: 'User registered successfully',
        data: user
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message || 'Registration failed',
        data: null
      });
    }
  }

  /**
   * 用户登录
   * @param req 请求对象
   * @param res 响应对象
   */
  async login(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { username, password } = req.body;

      // 验证参数
      if (!username || !password) {
        res.status(400).json({
          code: 400,
          message: 'Username and password are required',
          data: null
        });
        return;
      }

      // 调用服务层登录
      const { user, token } = await authService.login(username, password);

      res.status(200).json({
        code: 200,
        message: 'Login successful',
        data: {
          user,
          token
        }
      });
    } catch (error: any) {
      res.status(401).json({
        code: 401,
        message: error.message || 'Login failed',
        data: null
      });
    }
  }

  /**
   * 验证Token
   * 功能：验证JWT令牌是否有效，返回用户信息
   * @param req 请求对象
   * @param res 响应对象
   */
  async verifyToken(req: express.Request, res: express.Response): Promise<void> {
    try {
      // 从请求头获取 token
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.status(401).json({
          code: 401,
          message: 'Authorization header is required',
          data: null
        });
        return;
      }

      // 提取 token
      const token = authHeader.split(' ')[1];
      if (!token) {
        res.status(401).json({
          code: 401,
          message: 'Token is required',
          data: null
        });
        return;
      }

      // 验证 token
      const secret = process.env.JWT_SECRET || 'your-secret-key';
      const decoded = jwt.verify(token, secret) as {
        id: number;
        username: string;
        email: string;
        role: string;
        iat: number;
        exp: number;
      };

      // 计算剩余有效时间
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = decoded.exp - now;

      res.status(200).json({
        code: 200,
        message: 'Token is valid',
        data: {
          id: decoded.id,
          username: decoded.username,
          email: decoded.email,
          role: decoded.role,
          issuedAt: new Date(decoded.iat * 1000).toISOString(),
          expiresAt: new Date(decoded.exp * 1000).toISOString(),
          expiresIn: expiresIn > 0 ? expiresIn : 0,
          isExpired: expiresIn <= 0
        }
      });
    } catch (error: any) {
      // 判断错误类型
      if (error.name === 'TokenExpiredError') {
        res.status(401).json({
          code: 401,
          message: 'Token has expired',
          data: {
            isExpired: true,
            expiredAt: error.expiredAt
          }
        });
      } else if (error.name === 'JsonWebTokenError') {
        res.status(401).json({
          code: 401,
          message: 'Invalid token format',
          data: null
        });
      } else {
        res.status(401).json({
          code: 401,
          message: 'Invalid or expired token',
          data: null
        });
      }
    }
  }

}

export const authController = new AuthController();