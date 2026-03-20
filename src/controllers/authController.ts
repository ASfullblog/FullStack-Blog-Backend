import express from 'express';
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


}

export const authController = new AuthController();