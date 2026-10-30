import express from 'express';
import { postService } from '../services/postService';

const router = express.Router();

/**
 * 分类和标签路由
 * 处理分类和标签的CRUD操作
 */

/**
 * 获取分类列表
 * 查询参数：keyword（可选）——对 name / slug 做不区分大小写模糊匹配（ILIKE）
 * 每个分类附带 postCount：直接挂在该分类下的文章数量（不含子分类累加）
 * 不传 keyword 时返回的集合/字段与旧版一致（仅额外增加 postCount、parent 字段），保持向后兼容
 */
router.get('/categories', async (req, res) => {
  try {
    const rawKeyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
    // 转义 ILIKE 通配符，让用户输入的 % _ \ 按字面字符匹配（PostgreSQL LIKE 默认转义符为反斜杠）
    const keyword = rawKeyword.replace(/[\\%_]/g, (ch) => `\\${ch}`);

    // 一条 SQL 完成：父分类名 JOIN + 文章数子查询 GROUP BY，避免 N+1（Neon HTTP 驱动一次 query 一次请求）
    let sql = `
      SELECT
        c.id,
        c.name,
        c.slug,
        c.parent_id,
        parent.name AS parent_name,
        COALESCE(pc.post_count, 0) AS post_count
      FROM categories c
      LEFT JOIN categories parent ON parent.id = c.parent_id
      LEFT JOIN (
        SELECT category_id, COUNT(*) AS post_count
        FROM posts
        GROUP BY category_id
      ) pc ON pc.category_id = c.id
    `;
    const params: any[] = [];
    if (keyword) {
      sql += ' WHERE (c.name ILIKE ? OR c.slug ILIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    sql += ' ORDER BY c.name ASC, c.id ASC';

    const [rows] = await postService.pool.query(sql, params) as any[];
    const categories = rows.map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      parentId: cat.parent_id,
      // COUNT(*) 是 bigint，HTTP 驱动可能返回字符串，统一转成 number
      postCount: Number(cat.post_count) || 0,
      parent: cat.parent_id && cat.parent_name
        ? { id: cat.parent_id, name: cat.parent_name }
        : null
    }));

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