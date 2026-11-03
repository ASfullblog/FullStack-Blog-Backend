import express from 'express';
import { authController } from '../controllers/authController';

const router = express.Router();

/**
 * 认证路由
 * 处理用户注册和登录请求
 */

// 用户注册
router.post('/register', authController.register);

// 用户登录
router.post('/login', authController.login);

// 重置密码（用户名 + 注册邮箱，直接改密码）
router.post('/reset-password', authController.resetPassword);

// 验证Token
router.get('/verify', authController.verifyToken);



export default router;