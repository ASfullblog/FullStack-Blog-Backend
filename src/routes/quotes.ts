import express from 'express';
import { quotesController } from '../controllers/quotesController';

const router = express.Router();

/**
 * 语录API路由
 * 提供名言警句的获取功能
 * 后端调用第三方API并进行敏感词校验
 */

// 获取随机语录（带敏感词校验）- 公开访问
router.get('/random', quotesController.getRandomQuote);

// 获取多条语录 - 公开访问
router.get('/', quotesController.getQuotes);

export default router;
