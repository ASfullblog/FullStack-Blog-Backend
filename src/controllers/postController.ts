import express from 'express';
import { postService } from '../services/postService';

/**
 * 文章控制器
 * 处理文章的CRUD操作
 */
export class PostController {
  /**
   * 分页获取文章列表
   * 支持按分类、标签筛选
   * @param req 请求对象
   * @param res 响应对象
   */
  async getPosts(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { page = 1, limit = 10, categoryId, tagId, status, keyword } = req.query;

      // 调用服务层获取文章列表
      const posts = await postService.getPosts({
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        categoryId: categoryId as string,
        tagId: tagId as string,
        status: status as string,
        keyword: keyword as string
      });

      res.status(200).json({
        code: 200,
        message: 'Posts fetched successfully',
        data: posts
      });
    } catch (error: any) {
      res.status(500).json({
        code: 500,
        message: error.message || 'Failed to fetch posts',
        data: null
      });
    }
  }

  /**
   * 获取文章详情（通过slug）
   * 增加浏览量
   * @param req 请求对象
   * @param res 响应对象
   */
  async getPostBySlug(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { slug } = req.params;

      // 调用服务层获取文章详情
      const post = await postService.getPostBySlug(slug);

      if (!post) {
        res.status(404).json({
          code: 404,
          message: 'Post not found',
          data: null
        });
        return;
      }

      res.status(200).json({
        code: 200,
        message: 'Post fetched successfully',
        data: post
      });
    } catch (error: any) {
      res.status(500).json({
        code: 500,
        message: error.message || 'Failed to fetch post',
        data: null
      });
    }
  }

  /**
   * 获取文章详情（通过ID）
   * 用于编辑文章
   * @param req 请求对象
   * @param res 响应对象
   */
  async getPostById(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;

      // 调用服务层获取文章详情
      const post = await postService.getPostById(parseInt(id));

      if (!post) {
        res.status(404).json({
          code: 404,
          message: 'Post not found',
          data: null
        });
        return;
      }

      res.status(200).json({
        code: 200,
        message: 'Post fetched successfully',
        data: post
      });
    } catch (error: any) {
      res.status(500).json({
        code: 500,
        message: error.message || 'Failed to fetch post',
        data: null
      });
    }
  }

  /**
   * 创建文章
   * 需要鉴权
   * @param req 请求对象
   * @param res 响应对象
   */
  async createPost(req: any, res: express.Response): Promise<void> {
    try {
      const { title, slug, content, excerpt, coverImage, categoryId, status, tags } = req.body;
      const authorId = req.user?.id;

      // 验证参数
      if (!title || !content || !categoryId) {
        res.status(400).json({
          code: 400,
          message: 'Title, content and categoryId are required',
          data: null
        });
        return;
      }

      // 调用服务层创建文章
      const post = await postService.createPost({
        title,
        slug,
        content,
        excerpt,
        coverImage,
        categoryId,
        authorId,
        status,
        tags
      });

      res.status(201).json({
        code: 201,
        message: 'Post created successfully',
        data: post
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message || 'Failed to create post',
        data: null
      });
    }
  }

  /**
   * 更新文章
   * 需要鉴权
   * @param req 请求对象
   * @param res 响应对象
   */
  async updatePost(req: any, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;
      const { title, slug, content, excerpt, coverImage, categoryId, status, tags } = req.body;
      const authorId = req.user?.id;

      // 调用服务层更新文章
      const post = await postService.updatePost({
        id: parseInt(id),
        title,
        slug,
        content,
        excerpt,
        coverImage,
        categoryId,
        authorId,
        status,
        tags
      });

      if (!post) {
        res.status(404).json({
          code: 404,
          message: 'Post not found',
          data: null
        });
        return;
      }

      res.status(200).json({
        code: 200,
        message: 'Post updated successfully',
        data: post
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message || 'Failed to update post',
        data: null
      });
    }
  }

  /**
   * 删除文章
   * 需要鉴权
   * @param req 请求对象
   * @param res 响应对象
   */
  async deletePost(req: any, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;
      const authorId = req.user?.id;

      // 调用服务层删除文章
      const success = await postService.deletePost(parseInt(id), authorId);

      if (!success) {
        res.status(404).json({
          code: 404,
          message: 'Post not found',
          data: null
        });
        return;
      }

      res.status(200).json({
        code: 200,
        message: 'Post deleted successfully',
        data: null
      });
    } catch (error: any) {
      res.status(400).json({
        code: 400,
        message: error.message || 'Failed to delete post',
        data: null
      });
    }
  }
}

export const postController = new PostController();