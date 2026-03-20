import pool from '../config/database';

/**
 * 通知服务
 * 处理通知的创建、查询、标记已读等操作
 */
export class NotificationService {
  /**
   * 创建通知
   * @param userId 接收通知的用户ID
   * @param type 通知类型
   * @param title 通知标题
   * @param content 通知内容
   * @param relatedId 关联ID
   * @param relatedType 关联类型
   * @returns 创建的通知
   */
  async createNotification(
    userId: number,
    type: string,
    title: string,
    content?: string,
    relatedId?: number,
    relatedType?: string
  ): Promise<any> {
    const query = `
      INSERT INTO notifications (user_id, type, title, content, related_id, related_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(query, [
      userId,
      type,
      title,
      content || null,
      relatedId || null,
      relatedType || null
    ]) as any[];

    return this.getNotificationById(result.insertId);
  }

  /**
   * 根据ID获取通知
   * @param id 通知ID
   * @returns 通知对象
   */
  async getNotificationById(id: number): Promise<any> {
    const [notifications] = await pool.query(
      'SELECT * FROM notifications WHERE id = ?',
      [id]
    ) as any[];

    if (notifications.length === 0) {
      return null;
    }

    return this.formatNotification(notifications[0]);
  }

  /**
   * 获取用户的通知列表
   * @param userId 用户ID
   * @param options 查询选项
   * @returns 通知列表和分页信息
   */
  async getUserNotifications(
    userId: number,
    options: { page?: number; limit?: number; isRead?: boolean } = {}
  ): Promise<{ notifications: any[]; total: number; unreadCount: number }> {
    const { page = 1, limit = 20, isRead } = options;
    const offset = (page - 1) * limit;

    // 构建查询条件
    let whereClause = 'WHERE user_id = ?';
    const params: any[] = [userId];

    if (isRead !== undefined) {
      whereClause += ' AND is_read = ?';
      params.push(isRead ? 1 : 0);
    }

    // 获取总数
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM notifications ${whereClause}`,
      params
    ) as any[];
    const total = countResult[0].total;

    // 获取未读数
    const [unreadResult] = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    ) as any[];
    const unreadCount = unreadResult[0].count;

    // 获取通知列表
    const [notifications] = await pool.query(
      `SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    ) as any[];

    return {
      notifications: notifications.map(n => this.formatNotification(n)),
      total,
      unreadCount
    };
  }

  /**
   * 标记通知为已读
   * @param notificationId 通知ID
   * @param userId 用户ID（用于权限验证）
   * @returns 是否成功
   */
  async markAsRead(notificationId: number, userId: number): Promise<boolean> {
    const [result] = await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    ) as any[];

    return result.affectedRows > 0;
  }

  /**
   * 标记所有通知为已读
   * @param userId 用户ID
   * @returns 更新的通知数量
   */
  async markAllAsRead(userId: number): Promise<number> {
    const [result] = await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [userId]
    ) as any[];

    return result.affectedRows;
  }

  /**
   * 删除通知
   * @param notificationId 通知ID
   * @param userId 用户ID（用于权限验证）
   * @returns 是否成功
   */
  async deleteNotification(notificationId: number, userId: number): Promise<boolean> {
    const [result] = await pool.query(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    ) as any[];

    return result.affectedRows > 0;
  }

  /**
   * 创建评论审核通知
   * @param userId 评论作者ID
   * @param commentId 评论ID
   * @param postTitle 文章标题
   * @param status 审核状态
   * @param content 评论内容
   */
  async createCommentModerationNotification(
    userId: number,
    commentId: number,
    postTitle: string,
    status: 'approved' | 'rejected',
    content: string
  ): Promise<any> {
    const type = status === 'approved' ? 'comment_approved' : 'comment_rejected';
    const title = status === 'approved'
      ? `您的评论已通过审核`
      : `您的评论未通过审核`;
    const notificationContent = status === 'approved'
      ? `您在文章《${postTitle}》中的评论已通过审核，现在对所有用户可见。`
      : `您在文章《${postTitle}》中的评论未通过审核，请遵守社区规范。`;

    return this.createNotification(
      userId,
      type,
      title,
      notificationContent,
      commentId,
      'comment'
    );
  }

  /**
   * 创建评论回复通知
   * @param userId 被回复的用户ID
   * @param commentId 评论ID
   * @param replyUsername 回复者用户名
   * @param postTitle 文章标题
   * @param content 回复内容
   */
  async createCommentReplyNotification(
    userId: number,
    commentId: number,
    replyUsername: string,
    postTitle: string,
    content: string
  ): Promise<any> {
    const title = `${replyUsername} 回复了您的评论`;
    const notificationContent = `在文章《${postTitle}》中，${replyUsername} 回复了您的评论：${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`;

    return this.createNotification(
      userId,
      'reply',
      title,
      notificationContent,
      commentId,
      'comment'
    );
  }

  /**
   * 创建系统公告（发送给所有用户）
   * @param title 公告标题
   * @param content 公告内容
   * @param adminId 管理员ID
   */
  async createAnnouncement(title: string, content: string, adminId: number): Promise<void> {
    // 获取所有用户ID
    const [users] = await pool.query('SELECT id FROM users') as any[];

    // 为每个用户创建通知
    for (const user of users) {
      await this.createNotification(
        user.id,
        'announcement',
        `【公告】${title}`,
        content
      );
    }
  }

  /**
   * 格式化通知数据
   * @param notification 原始通知数据
   * @returns 格式化后的通知
   */
  private formatNotification(notification: any): any {
    return {
      id: notification.id,
      userId: notification.user_id,
      type: notification.type,
      title: notification.title,
      content: notification.content,
      relatedId: notification.related_id,
      relatedType: notification.related_type,
      isRead: notification.is_read === 1,
      createdAt: notification.created_at,
      updatedAt: notification.updated_at
    };
  }
}

export const notificationService = new NotificationService();
