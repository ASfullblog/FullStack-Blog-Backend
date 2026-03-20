import express from 'express';
import { commentController } from '../controllers/commentController';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

/**
 * 评论路由
 * 处理评论的CRUD操作和审核功能
 */

// 获取文章的评论列表（可选认证，用于根据用户角色返回不同评论）
router.get('/posts/:postId/comments', optionalAuthMiddleware, commentController.getCommentsByPostId);

// 获取待审核的评论列表（需要管理员权限）
router.get('/comments/pending', authMiddleware, commentController.getPendingComments);

// 创建评论（需要认证）
router.post('/comments', authMiddleware, commentController.createComment);

// 审核评论（需要管理员权限）
router.put('/comments/:id/moderate', authMiddleware, commentController.moderateComment);

// 一键通过所有待审核评论（需要管理员权限）
router.put('/comments/approve-all', authMiddleware, commentController.approveAllComments);

// 删除评论（需要认证）
router.delete('/comments/:id', authMiddleware, commentController.deleteComment);

export default router;
