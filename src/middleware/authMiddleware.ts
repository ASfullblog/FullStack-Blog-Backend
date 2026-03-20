import express from 'express';
import jwt from 'jsonwebtoken';

/**
 * JWT 验证中间件
 * 用于保护需要登录的路由
 */
export const authMiddleware = (req: any, res: express.Response, next: express.NextFunction) => {
  try {
    // 从请求头获取 token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        code: 401,
        message: 'Authorization header is required',
        data: null
      });
    }

    // 提取 token
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        code: 401,
        message: 'Token is required',
        data: null
      });
    }

    // 验证 token
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(token, secret) as {
      id: number;
      username: string;
      role: string;
    };

    // 将用户信息添加到请求对象
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      code: 401,
      message: 'Invalid or expired token',
      data: null
    });
  }
};

/**
 * 可选的JWT验证中间件
 * 用于可选登录的路由，如果提供了token则解析用户信息，否则继续执行
 */
export const optionalAuthMiddleware = (req: any, res: express.Response, next: express.NextFunction) => {
  try {
    // 从请求头获取 token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      // 没有token，继续执行
      return next();
    }

    // 提取 token
    const token = authHeader.split(' ')[1];
    if (!token) {
      // 没有token，继续执行
      return next();
    }

    // 验证 token
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(token, secret) as {
      id: number;
      username: string;
      role: string;
    };

    // 将用户信息添加到请求对象
    req.user = decoded;
    next();
  } catch (error) {
    // token验证失败，继续执行（不阻止请求）
    next();
  }
};

/**
 * 管理员权限检查中间件
 * 只允许管理员访问
 */
export const adminMiddleware = (req: any, res: express.Response, next: express.NextFunction) => {
  // 先执行认证中间件
  authMiddleware(req, res, () => {
    // 检查是否为管理员
    if (req.user && req.user.role === 'admin') {
      next();
    } else {
      return res.status(403).json({
        code: 403,
        message: 'Admin permission required',
        data: null
      });
    }
  });
};
