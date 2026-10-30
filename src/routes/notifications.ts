import express from 'express';
import { notificationController } from '../controllers/notificationController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

/**
 * 通知路由
 * 处理通知的查询、标记已读、删除等操作
 */

// 获取当前用户的通知列表
router.get('/notifications', authMiddleware, notificationController.getNotifications);

// 获取未读通知数量
router.get('/notifications/unread-count', authMiddleware, notificationController.getUnreadCount);

// 标记通知为已读
router.put('/notifications/:id/read', authMiddleware, notificationController.markAsRead);

// 标记所有通知为已读
router.put('/notifications/read-all', authMiddleware, notificationController.markAllAsRead);

// 清空当前用户的全部通知
// 注意：必须注册在 DELETE /notifications/:id 之前，否则 'all' 会被当成 :id 参数
router.delete('/notifications/all', authMiddleware, notificationController.clearAllNotifications);

// 删除通知
router.delete('/notifications/:id', authMiddleware, notificationController.deleteNotification);

// 创建系统公告（管理员）
router.post('/notifications/announcement', authMiddleware, notificationController.createAnnouncement);

export default router;
