import express from 'express';
import { commentService } from '../services/commentService';

/**
 * 评论控制器
 * 处理评论的CRUD操作和审核功能
 */
export class CommentController {
  /**
   * 获取文章的评论列表
   * @param req 请求对象
   * @param res 响应对象
   */
  async getCommentsByPostId(req: any, res: express.Response): Promise<void> {
    try {
      const { postId } = req.params;

      if (!postId) {
        res.status(400).json({
          code: 400,
          message: 'Post ID is required',
          data: null
        });
        return;
      }

      // 获取当前用户信息（如果已登录）
      const currentUserId = req.user?.id;
      const isAdmin = req.user?.role === 'admin';

      // 调用服务层获取评论列表
      const comments = await commentService.getCommentsByPostId(
        parseInt(postId),
        currentUserId,
        isAdmin
      );

      res.status(200).json({
        code: 200,
        message: 'Comments fetched successfully',
        data: comments
      });
    } catch (error: any) {
      res.status(500).json({
        code: 500,
        message: error.message || 'Failed to fetch comments',
        data: null
      });
    }
  }

  /**
   * 获取待审核的评论列表（管理员）
   * @param req 请求对象
   * @param res 响应对象
   */
  async getPendingComments(req: any, res: express.Response): Promise<void> {
    try {
      // 检查是否是管理员
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          code: 403,
          message: 'Only admin can view pending comments',
          data: null
        });
        return;
      }

      const comments = await commentService.getPendingComments();

      res.status(200).json({
        code: 200,
        message: 'Pending comments fetched successfully',
        data: comments
      });
    } catch (error: any) {
      res.status(500).json({
        code: 500,
        message: error.message || 'Failed to fetch pending comments',
        data: null
      });
    }
  }

  /**
   * 创建评论
   * @param req 请求对象
   * @param res 响应对象
   */
  async createComment(req: any, res: express.Response): Promise<void> {
    try {
      const { postId, content, parentId } = req.body;
      const userId = req.user?.id;
      const userRole = req.user?.role;

      console.log('控制器 - 用户ID:', userId, '用户角色:', userRole, 'req.user:', req.user);

      // 验证参数
      if (!postId || !content || !userId) {
        res.status(400).json({
          code: 400,
          message: 'Post ID, content and user ID are required',
          data: null
        });
        return;
      }

      // 调用服务层创建评论，传递用户角色用于判断是否为管理员
      const comment = await commentService.createComment(
        parseInt(postId),
        userId,
        content,
        parentId ? parseInt(parentId) : undefined,
        userRole
      );

      // 根据状态返回不同消息
      const message = comment.status === 'pending'
        ? 'Comment submitted for approval'
        : 'Comment created successfully';

      res.status(201).json({
        code: 201,
        message,
        data: comment
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message || 'Failed to create comment',
        data: null
      });
    }
  }

  /**
   * 审核评论（管理员）
   * @param req 请求对象
   * @param res 响应对象
   */
  async moderateComment(req: any, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userRole = req.user?.role;

      // 检查是否是管理员
      if (userRole !== 'admin') {
        res.status(403).json({
          code: 403,
          message: 'Only admin can moderate comments',
          data: null
        });
        return;
      }

      // 验证参数
      if (!id || !status) {
        res.status(400).json({
          code: 400,
          message: 'Comment ID and status are required',
          data: null
        });
        return;
      }

      // 验证状态值
      if (status !== 'approved' && status !== 'rejected') {
        res.status(400).json({
          code: 400,
          message: 'Status must be "approved" or "rejected"',
          data: null
        });
        return;
      }

      // 调用服务层审核评论
      const comment = await commentService.moderateComment(parseInt(id), status);

      res.status(200).json({
        code: 200,
        message: `Comment ${status} successfully`,
        data: comment
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message || 'Failed to moderate comment',
        data: null
      });
    }
  }

  /**
   * 一键通过所有待审核评论
   * @param req 请求对象
   * @param res 响应对象
   */
  async approveAllComments(req: any, res: express.Response): Promise<void> {
    try {
      // 检查是否是管理员
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          code: 403,
          message: 'Only admin can approve all comments',
          data: null
        });
        return;
      }

      // 调用服务层一键通过所有待审核评论
      const updatedCount = await commentService.approveAllPendingComments();

      res.status(200).json({
        code: 200,
        message: `Successfully approved ${updatedCount} comments`,
        data: { updatedCount }
      });
    } catch (error: any) {
      res.status(500).json({
        code: 500,
        message: error.message || 'Failed to approve all comments',
        data: null
      });
    }
  }

  /**
   * 删除评论
   * @param req 请求对象
   * @param res 响应对象
   */
  async deleteComment(req: any, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const userRole = req.user?.role;

      // 验证参数
      if (!id || !userId) {
        res.status(400).json({
          code: 400,
          message: 'Comment ID and user ID are required',
          data: null
        });
        return;
      }

      // 管理员可以直接删除任何评论
      let success: boolean;
      if (userRole === 'admin') {
        success = await commentService.adminDeleteComment(parseInt(id));
      } else {
        success = await commentService.deleteComment(parseInt(id), userId);
      }

      if (!success) {
        res.status(404).json({
          code: 404,
          message: 'Comment not found',
          data: null
        });
        return;
      }

      res.status(200).json({
        code: 200,
        message: 'Comment deleted successfully',
        data: null
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message || 'Failed to delete comment',
        data: null
      });
    }
  }
}

export const commentController = new CommentController();
