import express from 'express';
import { aiController } from '../controllers/aiController';

const router = express.Router();

/**
 * AI API路由
 * 提供AI生成功能
 */

// 生成文章摘要 - 公开访问
router.post('/excerpt', aiController.generateExcerpt);

// 获取励志金句 - 公开访问
router.get('/quote', aiController.getInspirationalQuote);

export default router;
