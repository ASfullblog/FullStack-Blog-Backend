import express from 'express';
import { postService } from '../services/postService';

const router = express.Router();

/**
 * 分类和标签路由
 * 处理分类和标签的CRUD操作
 */

// 获取分类列表
router.get('/categories', async (req, res) => {
  try {
    const categories = await postService.getCategories();
    res.json({
      code: 200,
      message: 'Success',
      data: categories
    });
  } catch (error: any) {
    console.error('获取分类列表失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

// 创建分类
router.post('/categories', async (req, res) => {
  try {
    const { name, slug, parentId } = req.body;
    if (!name || !slug) {
      return res.status(400).json({
        code: 400,
        message: 'Name and slug are required',
        data: null
      });
    }
    
    // 简单的分类创建逻辑
    const [result] = await postService.pool.query(
      'INSERT INTO categories (name, slug, parent_id) VALUES (?, ?, ?)',
      [name, slug, parentId || null]
    ) as any[];
    
    const categoryId = result.insertId;
    const [categories] = await postService.pool.query(
      'SELECT * FROM categories WHERE id = ?',
      [categoryId]
    ) as any[];
    
    res.json({
      code: 200,
      message: 'Success',
      data: categories[0]
    });
  } catch (error: any) {
    console.error('创建分类失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

// 更新分类
router.put('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, parentId } = req.body;
    
    if (!name || !slug) {
      return res.status(400).json({
        code: 400,
        message: 'Name and slug are required',
        data: null
      });
    }
    
    await postService.pool.query(
      'UPDATE categories SET name = ?, slug = ?, parent_id = ? WHERE id = ?',
      [name, slug, parentId || null, id]
    );
    
    const [categories] = await postService.pool.query(
      'SELECT * FROM categories WHERE id = ?',
      [id]
    ) as any[];
    
    res.json({
      code: 200,
      message: 'Success',
      data: categories[0]
    });
  } catch (error: any) {
    console.error('更新分类失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

// 删除分类
router.delete('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 检查是否有子分类
    const [children] = await postService.pool.query(
      'SELECT * FROM categories WHERE parent_id = ?',
      [id]
    ) as any[];
    
    if (children.length > 0) {
      return res.status(400).json({
        code: 400,
        message: 'Cannot delete category with children',
        data: null
      });
    }
    
    // 检查是否有文章使用此分类
    const [posts] = await postService.pool.query(
      'SELECT * FROM posts WHERE category_id = ?',
      [id]
    ) as any[];
    
    if (posts.length > 0) {
      return res.status(400).json({
        code: 400,
        message: 'Cannot delete category with posts',
        data: null
      });
    }
    
    await postService.pool.query('DELETE FROM categories WHERE id = ?', [id]);
    
    res.json({
      code: 200,
      message: 'Success',
      data: null
    });
  } catch (error: any) {
    console.error('删除分类失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

// 获取标签列表
router.get('/tags', async (req, res) => {
  try {
    const tags = await postService.getTags();
    res.json({
      code: 200,
      message: 'Success',
      data: tags
    });
  } catch (error: any) {
    console.error('获取标签列表失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

export default router;