import express from 'express';
import { aiService } from '../services/MoonshotAi';

/**
 * AI控制器
 * 处理AI相关的接口调用
 */
export class AIController {
  /**
   * 生成文章摘要
   * @param req 请求对象
   * @param res 响应对象
   */
  async generateExcerpt(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { content } = req.body;

      if (!content) {
        res.status(400).json({
          code: 400,
          message: '请提供文章内容',
          data: null
        });
        return;
      }

      const excerpt = await aiService.generateExcerpt(content);

      res.status(200).json({
        code: 200,
        message: 'Success',
        data: excerpt
      });
    } catch (error: any) {
      res.status(500).json({
        code: 500,
        message: error.message || 'Failed to generate excerpt',
        data: null
      });
    }
  }

  /**
   * 获取励志金句
   * @param req 请求对象
   * @param res 响应对象
   */
  async getInspirationalQuote(req: express.Request, res: express.Response): Promise<void> {
    try {
      const quote = await aiService.getInspirationalQuote();

      res.status(200).json({
        code: 200,
        message: 'Success',
        data: quote
      });
    } catch (error: any) {
      res.status(500).json({
        code: 500,
        message: error.message || 'Failed to get quote',
        data: null
      });
    }
  }
}

export const aiController = new AIController();
