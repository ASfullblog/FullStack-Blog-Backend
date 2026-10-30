import express from 'express';
import { notificationService } from '../services/notificationService';

/**
 * 通知控制器
 * 处理通知的CRUD操作
 */
export class NotificationController {
  /**
   * 获取当前用户的通知列表
   * @param req 请求对象
   * @param res 响应对象
   */
  async getNotifications(req: any, res: express.Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          code: 401,
          message: '请先登录',
          data: null
        });
        return;
      }

      const { page = 1, limit = 20, isRead } = req.query;

      const result = await notificationService.getUserNotifications(userId, {
        page: parseInt(page),
        limit: parseInt(limit),
        isRead: isRead !== undefined ? isRead === 'true' : undefined
      });

      res.status(200).json({
        code: 200,
        message: '获取通知列表成功',
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        code: 500,
        message: error.message || '获取通知列表失败',
        data: null
      });
    }
  }

  /**
   * 获取未读通知数量
   * @param req 请求对象
   * @param res 响应对象
   */
  async getUnreadCount(req: any, res: express.Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          code: 401,
          message: '请先登录',
          data: null
        });
        return;
      }

      const result = await notificationService.getUserNotifications(userId, { limit: 1 });

      res.status(200).json({
        code: 200,
        message: '获取未读数量成功',
        data: { unreadCount: result.unreadCount }
      });
    } catch (error: any) {
      res.status(500).json({
        code: 500,
        message: error.message || '获取未读数量失败',
        data: null
      });
    }
  }

  /**
   * 标记通知为已读
   * @param req 请求对象
   * @param res 响应对象
   */
  async markAsRead(req: any, res: express.Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({
          code: 401,
          message: '请先登录',
          data: null
        });
        return;
      }

      const success = await notificationService.markAsRead(parseInt(id), userId);

      if (!success) {
        res.status(404).json({
          code: 404,
          message: '通知不存在或无权限',
          data: null
        });
        return;
      }

      res.status(200).json({
        code: 200,
        message: '标记已读成功',
        data: null
      });
    } catch (error: any) {
      res.status(500).json({
        code: 500,
        message: error.message || '标记已读失败',
        data: null
      });
    }
  }

  /**
   * 标记所有通知为已读
   * @param req 请求对象
   * @param res 响应对象
   */
  async markAllAsRead(req: any, res: express.Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          code: 401,
          message: '请先登录',
          data: null
        });
        return;
      }

      const count = await notificationService.markAllAsRead(userId);

      res.status(200).json({
        code: 200,
        message: `已将 ${count} 条通知标记为已读`,
        data: { count }
      });
    } catch (error: any) {
      res.status(500).json({
        code: 500,
        message: error.message || '标记全部已读失败',
        data: null
      });
    }
  }

  /**
   * 删除通知
   * @param req 请求对象
   * @param res 响应对象
   */
  async deleteNotification(req: any, res: express.Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({
          code: 401,
          message: '请先登录',
          data: null
        });
        return;
      }

      const success = await notificationService.deleteNotification(parseInt(id), userId);

      if (!success) {
        res.status(404).json({
          code: 404,
          message: '通知不存在或无权限',
          data: null
        });
        return;
      }

      res.status(200).json({
        code: 200,
        message: '删除通知成功',
        data: null
      });
    } catch (error: any) {
      res.status(500).json({
        code: 500,
        message: error.message || '删除通知失败',
        data: null
      });
    }
  }

  /**
   * 清空当前用户的全部通知
   * @param req 请求对象
   * @param res 响应对象
   */
  async clearAllNotifications(req: any, res: express.Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          code: 401,
          message: '请先登录',
          data: null
        });
        return;
      }

      const deleted = await notificationService.clearAllNotifications(userId);

      res.status(200).json({
        code: 200,
        message: `已清空 ${deleted} 条通知`,
        data: { deleted }
      });
    } catch (error: any) {
      res.status(500).json({
        code: 500,
        message: error.message || '清空通知失败',
        data: null
      });
    }
  }

  /**
   * 创建系统公告（管理员）
   * @param req 请求对象
   * @param res 响应对象
   */
  async createAnnouncement(req: any, res: express.Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      const { title, content } = req.body;

      // 检查是否是管理员
      if (userRole !== 'admin') {
        res.status(403).json({
          code: 403,
          message: '只有管理员可以发布公告',
          data: null
        });
        return;
      }

      if (!title || !content) {
        res.status(400).json({
          code: 400,
          message: '标题和内容不能为空',
          data: null
        });
        return;
      }

      await notificationService.createAnnouncement(title, content, userId);

      res.status(201).json({
        code: 201,
        message: '公告发布成功',
        data: null
      });
    } catch (error: any) {
      res.status(500).json({
        code: 500,
        message: error.message || '发布公告失败',
        data: null
      });
    }
  }
}

export const notificationController = new NotificationController();
