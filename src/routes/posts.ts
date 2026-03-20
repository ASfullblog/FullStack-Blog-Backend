import express from 'express';
import { postController } from '../controllers/postController';
import { authMiddleware, adminMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

/**
 * 文章路由
 * 处理文章的CRUD操作
 * 创建、更新、删除文章需要管理员权限
 * 普通用户只能查看文章和评论
 */

// 分页获取文章列表（支持按分类、标签筛选）- 公开访问
router.get('/', postController.getPosts);

// 创建文章（需要管理员权限）
router.post('/', adminMiddleware, postController.createPost);

// 通过ID获取文章详情（用于编辑）- 放在/:slug之前，公开访问
router.get('/id/:id', postController.getPostById);

// 更新文章（需要管理员权限）
router.put('/:id', adminMiddleware, postController.updatePost);

// 删除文章（需要管理员权限）
router.delete('/:id', adminMiddleware, postController.deletePost);

// 通过slug获取文章详情（增加浏览量）- 放在最后，公开访问
router.get('/:slug', postController.getPostBySlug);

export default router;