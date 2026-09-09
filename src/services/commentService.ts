import pool from '../config/database';
import { sendHtmlEmail } from '../utils/email';
import { notificationService } from './notificationService';
import { validateComment, sanitizeComment } from '../utils/security';

/**
 * 评论服务
 * 处理评论的CRUD操作和审核功能
 */
export class CommentService {
  /**
   * 获取系统配置
   * @param key 配置键
   * @returns 配置值
   */
  private async getConfig(key: string): Promise<string | null> {
    const [rows] = await pool.query(
      'SELECT config_value FROM sys_config WHERE config_key = ?',
      [key]
    ) as any[];
    return rows.length > 0 ? rows[0].config_value : null;
  }

  /**
   * 获取文章的评论列表
   * @param postId 文章ID
   * @param currentUserId 当前用户ID（可选）
   * @param isAdmin 是否为管理员
   * @returns 评论列表
   */
  async getCommentsByPostId(postId: number, currentUserId?: number, isAdmin: boolean = false): Promise<any[]> {
    let query: string;
    let params: any[];

    if (isAdmin) {
      // 管理员可以看到所有评论
      query = `
        SELECT 
          c.*,
          u.username as user_username,
          u.avatar as user_avatar,
          u.role as user_role
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.post_id = ?
        ORDER BY c.created_at ASC
      `;
      params = [postId];
    } else if (currentUserId) {
      // 普通用户可以看到已通过审核的评论 + 自己发布的待审核评论
      query = `
        SELECT 
          c.*,
          u.username as user_username,
          u.avatar as user_avatar,
          u.role as user_role
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.post_id = ? AND (c.status = 'approved' OR (c.status = 'pending' AND c.user_id = ?))
        ORDER BY c.created_at ASC
      `;
      params = [postId, currentUserId];
    } else {
      // 未登录用户只能看到已通过审核的评论
      query = `
        SELECT 
          c.*,
          u.username as user_username,
          u.avatar as user_avatar,
          u.role as user_role
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.post_id = ? AND c.status = 'approved'
        ORDER BY c.created_at ASC
      `;
      params = [postId];
    }

    const [comments] = await pool.query(query, params) as any[];

    // 格式化评论数据
    const formattedComments = comments.map((comment: any) => ({
      id: comment.id,
      postId: comment.post_id,
      userId: comment.user_id,
      content: comment.content,
      parentId: comment.parent_id,
      status: comment.status,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      user: {
        id: comment.user_id,
        username: comment.user_username,
        email: '',
        name: comment.user_username,
        avatar: comment.user_avatar,
        role: comment.user_role
      },
      children: [] as any[],
      parent: undefined as any  // 预留parent字段，用于buildCommentTree填充
    }));

    // 构建嵌套结构
    return this.buildCommentTree(formattedComments);
  }

  /**
   * 构建评论树形结构
   * @param comments 评论列表
   * @returns 嵌套结构的评论列表
   */
  private buildCommentTree(comments: any[]): any[] {
    const commentMap = new Map<number, any>();
    const rootComments: any[] = [];
    const processedIds = new Set<number>();

    // 首先将所有评论放入map
    comments.forEach(comment => {
      commentMap.set(comment.id, comment);
    });

    // 构建父子关系
    comments.forEach(comment => {
      // 跳过已处理的评论（避免重复添加）
      if (processedIds.has(comment.id)) {
        return;
      }

      if (comment.parentId) {
        const parent = commentMap.get(comment.parentId);
        if (parent) {
          // 添加父评论信息到子评论，用于前端显示"回复 xxx"
          comment.parent = {
            id: parent.id,
            user: parent.user
          };
          parent.children.push(comment);
          processedIds.add(comment.id);
        } else {
          // 如果父评论不存在（可能被过滤掉了），作为根评论
          rootComments.push(comment);
          processedIds.add(comment.id);
        }
      } else {
        // 没有父评论的是根评论
        rootComments.push(comment);
        processedIds.add(comment.id);
      }
    });

    return rootComments;
  }

  /**
   * 获取待审核的评论列表（管理员用）
   * @returns 待审核评论列表
   */
  async getPendingComments(): Promise<any[]> {
    const query = `
      SELECT 
        c.*,
        u.username as user_username,
        u.avatar as user_avatar,
        p.title as post_title,
        p.slug as post_slug
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN posts p ON c.post_id = p.id
      WHERE c.status = 'pending'
      ORDER BY c.created_at DESC
    `;

    const [comments] = await pool.query(query) as any[];

    return comments.map((comment: any) => ({
      id: comment.id,
      postId: comment.post_id,
      userId: comment.user_id,
      content: comment.content,
      parentId: comment.parent_id,
      status: comment.status,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      user: {
        id: comment.user_id,
        username: comment.user_username,
        avatar: comment.user_avatar
      },
      post: {
        title: comment.post_title,
        slug: comment.post_slug
      }
    }));
  }

  /**
   * 创建评论
   * @param postId 文章ID
   * @param userId 用户ID
   * @param content 评论内容
   * @param parentId 父评论ID
   * @param userRole 用户角色（用于判断是否为管理员）
   * @returns 创建的评论
   */
  async createComment(postId: number, userId: number, content: string, parentId?: number, userRole?: string): Promise<any> {
    // 1. 验证评论内容（包含敏感词检测和XSS检测）
    const validation = await validateComment(content);
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    // 2. 清理内容
    const sanitizedContent = sanitizeComment(content);

    // 3. 检查父评论是否存在（如果是回复）
    if (parentId) {
      const [parentComments] = await pool.query(
        'SELECT id FROM comments WHERE id = ? AND post_id = ?',
        [parentId, postId]
      ) as any[];

      if (parentComments.length === 0) {
        const error: any = new Error('该评论已被删除或不存在');
        error.code = 'PARENT_COMMENT_NOT_FOUND';
        throw error;
      }
    }

    // 获取评论审核配置
    const commentApproval = await this.getConfig('comment_approval');

    // 调试日志
    console.log('创建评论 - 用户角色:', userRole, '用户ID:', userId);

    // 管理员评论自动通过审核，不需要等待审核
    let status: string;
    if (userRole === 'admin') {
      status = 'approved';
      console.log('管理员评论，自动通过审核');
    } else {
      status = commentApproval === 'true' ? 'pending' : 'approved';
      console.log('普通用户评论，状态:', status, '审核配置:', commentApproval);
    }

    const query = `
      INSERT INTO comments (post_id, user_id, content, parent_id, status)
      VALUES (?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(query, [postId, userId, sanitizedContent, parentId || null, status]) as any[];
    const commentId = result.insertId;

    // 获取文章信息（用于邮件通知）
    let postTitle = '未知文章';
    if (status === 'pending' && userRole !== 'admin') {
      const [posts] = await pool.query(
        `SELECT title FROM posts WHERE id = ?`,
        [postId]
      ) as any[];
      postTitle = posts[0]?.title || '未知文章';

      // 获取用户名并发送邮件通知
      const [users] = await pool.query(
        `SELECT username FROM users WHERE id = ?`,
        [userId]
      ) as any[];
      const username = users[0]?.username || '未知用户';
      await this.sendModerationNotification(username, sanitizedContent, postTitle);
    }

    // 如果是回复评论，给被回复者发送通知
    if (parentId) {
      await this.sendReplyNotification(parentId, userId, postId, sanitizedContent);
    }

    // 返回简化的响应数据
    return {
      id: commentId,
      postId,
      userId,
      content: sanitizedContent,
      parentId: parentId || null,
      status,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * 发送回复通知给被回复者
   * @param parentId 父评论ID
   * @param replyUserId 回复者用户ID
   * @param postId 文章ID
   * @param content 回复内容
   */
  private async sendReplyNotification(parentId: number, replyUserId: number, postId: number, content: string): Promise<void> {
    try {
      // 获取父评论的作者信息
      const [parentComments] = await pool.query(
        `SELECT c.user_id, u.username 
         FROM comments c 
         JOIN users u ON c.user_id = u.id 
         WHERE c.id = ?`,
        [parentId]
      ) as any[];

      if (parentComments.length === 0) {
        return;
      }

      const parentUserId = parentComments[0].user_id;
      const parentUsername = parentComments[0].username;

      // 不要给自己发通知（自己回复自己的评论）
      if (parentUserId === replyUserId) {
        return;
      }

      // 获取回复者用户名
      const [replyUsers] = await pool.query(
        `SELECT username FROM users WHERE id = ?`,
        [replyUserId]
      ) as any[];
      const replyUsername = replyUsers[0]?.username || '未知用户';

      // 发送通知给被回复者
      await notificationService.createNotification(
        parentUserId,
        'reply',
        `${replyUsername} 回复了您的评论`,
        content.length > 100 ? content.substring(0, 100) + '...' : content,
        postId,
        'post'
      );

      console.log(`已发送回复通知给用户 ${parentUsername} (ID: ${parentUserId})`);
    } catch (error) {
      console.error('发送回复通知失败:', error);
      // 通知发送失败不影响评论创建
    }
  }

  /**
   * 发送评论审核通知邮件
   * @param username 评论用户名称
   * @param content 评论内容
   * @param postTitle 文章标题
   */
  private async sendModerationNotification(username: string, content: string, postTitle: string): Promise<void> {
    try {
      const adminEmail = process.env.ADMIN_EMAIL;
      if (!adminEmail) {
        console.log('未配置管理员邮箱，跳过邮件通知');
        return;
      }

      const subject = '【FullStack Blog】新评论待审核';
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">FullStack Blog - 评论审核通知</h2>
          <p style="font-size: 16px; color: #666;">您好！</p>
          <p style="font-size: 16px; color: #666;">您的博客收到了一条新评论，需要审核：</p>
          <div style="background: #f9f9f9; padding: 15px; margin: 20px 0; border-left: 4px solid #e6a23c; border-radius: 4px;">
            <p style="margin: 0 0 10px 0; font-weight: bold; color: #333;">评论文章：${postTitle}</p>
            <p style="margin: 0 0 10px 0; font-weight: bold; color: #333;">评论用户：${username}</p>
            <p style="margin: 0; color: #666; line-height: 1.6;">评论内容：${content}</p>
          </div>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/comments" 
               style="background: #4a90d9; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; display: inline-block;">
              前往审核
            </a>
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #ccc;">此邮件由系统自动发送，请勿回复。</p>
        </div>
      `;

      await sendHtmlEmail(adminEmail, subject, html);
      console.log('评论审核通知邮件已发送');
    } catch (error) {
      console.error('发送评论审核通知邮件失败:', error);
    }
  }

  /**
   * 审核评论
   * @param commentId 评论ID
   * @param status 新状态 ('approved' 或 'rejected')
   * @returns 更新后的评论
   */
  async moderateComment(commentId: number, status: 'approved' | 'rejected'): Promise<any> {
    // 检查评论是否存在
    const [existingComments] = await pool.query(
      'SELECT * FROM comments WHERE id = ?',
      [commentId]
    ) as any[];

    if (existingComments.length === 0) {
      throw new Error('Comment not found');
    }

    const existingComment = existingComments[0];

    // 更新评论状态
    await pool.query(
      'UPDATE comments SET status = ? WHERE id = ?',
      [status, commentId]
    );

    // 返回更新后的评论
    const [comments] = await pool.query(
      `SELECT 
        c.*,
        u.username as user_username,
        u.avatar as user_avatar,
        p.title as post_title
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN posts p ON c.post_id = p.id
      WHERE c.id = ?`,
      [commentId]
    ) as any[];

    const comment = comments[0];

    // 发送通知给用户
    try {
      await notificationService.createCommentModerationNotification(
        comment.user_id,
        commentId,
        comment.post_title || '未知文章',
        status,
        comment.content
      );
    } catch (error) {
      console.error('发送审核通知失败:', error);
      // 不影响主流程，仅记录错误
    }

    return {
      id: comment.id,
      postId: comment.post_id,
      userId: comment.user_id,
      content: comment.content,
      parentId: comment.parent_id,
      status: comment.status,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      user: {
        id: comment.user_id,
        username: comment.user_username,
        avatar: comment.user_avatar
      }
    };
  }

  /**
   * 删除评论
   * @param id 评论ID
   * @param userId 用户ID
   * @returns 是否删除成功
   */
  async deleteComment(id: number, userId: number): Promise<boolean> {
    // 检查评论是否存在
    const [existingComments] = await pool.query('SELECT * FROM comments WHERE id = ?', [id]) as any[];

    if (existingComments.length === 0) {
      return false;
    }

    const comment = existingComments[0];

    // 检查是否是评论作者
    if (comment.user_id !== userId) {
      throw new Error('You can only delete your own comments');
    }

    // 删除评论
    await pool.query('DELETE FROM comments WHERE id = ?', [id]);

    return true;
  }

  /**
   * 管理员删除评论
   * @param id 评论ID
   * @returns 是否删除成功
   */
  async adminDeleteComment(id: number): Promise<boolean> {
    // 检查评论是否存在
    const [existingComments] = await pool.query('SELECT * FROM comments WHERE id = ?', [id]) as any[];

    if (existingComments.length === 0) {
      return false;
    }

    // 删除评论
    await pool.query('DELETE FROM comments WHERE id = ?', [id]);

    return true;
  }

  /**
   * 一键通过所有待审核评论
   * @returns 更新的评论数量
   */
  async approveAllPendingComments(): Promise<number> {
    const [result] = await pool.query(
      'UPDATE comments SET status = ? WHERE status = ?',
      ['approved', 'pending']
    ) as any[];

    return result.affectedRows || 0;
  }
}

export const commentService = new CommentService();
