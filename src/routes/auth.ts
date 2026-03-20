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



export default router;