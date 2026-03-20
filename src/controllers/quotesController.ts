import express from 'express';
import { quotesService } from '../services/quotesService';

/**
 * 语录控制器
 * 处理语录的获取和敏感词校验
 */
export class QuotesController {
  /**
   * 获取随机语录
   * 后端调用第三方API并进行敏感词校验
   * @param req 请求对象
   * @param res 响应对象
   */
  async getRandomQuote(req: express.Request, res: express.Response): Promise<void> {
    try {
      // 调用服务层获取语录（带敏感词校验和自动重试）
      const quote = await quotesService.getRandomQuote();

      res.status(200).json({
        code: 200,
        message: 'Success',
        data: quote
      });
    } catch (error: any) {
      res.status(500).json({
        code: 500,
        message: error.message || 'Failed to fetch quote',
        data: null
      });
    }
  }

  /**
   * 获取多条语录
   * @param req 请求对象
   * @param res 响应对象
   */
  async getQuotes(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { limit = 5 } = req.query;

      // 调用服务层获取多条语录
      const quotes = await quotesService.getQuotes(parseInt(limit as string));

      res.status(200).json({
        code: 200,
        message: 'Success',
        data: quotes
      });
    } catch (error: any) {
      res.status(500).json({
        code: 500,
        message: error.message || 'Failed to fetch quotes',
        data: null
      });
    }
  }
}

export const quotesController = new QuotesController();
