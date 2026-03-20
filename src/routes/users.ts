import express from 'express';
import pool from '../config/database';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

/**
 * 用户路由
 * 处理用户信息的CRUD操作
 */

// 获取用户总数
router.get('/users/count', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) as total FROM users') as any[];
    res.json({
      code: 200,
      message: 'Success',
      data: { total: rows[0].total }
    });
  } catch (error: any) {
    console.error('获取用户总数失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

// 获取所有用户
router.get('/users', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, username, email, role, avatar, bio, github_url, qq_number, tech_stack, visited_provinces, created_at FROM users') as any[];
    res.json({
      code: 200,
      message: 'Success',
      data: rows
    });
  } catch (error: any) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

// 获取单个用户
router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT id, username, email, role, avatar, bio, github_url, qq_number, tech_stack, visited_provinces, created_at FROM users WHERE id = ?', [id]) as any[];
    if (rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'User not found',
        data: null
      });
    }
    res.json({
      code: 200,
      message: 'Success',
      data: rows[0]
    });
  } catch (error: any) {
    console.error('获取用户失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

// 更新用户信息
router.put('/users/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, bio, githubUrl, qqNumber, techStack, visitedProvinces, avatar } = req.body;
    
    // 构建更新字段
    const updates: string[] = [];
    const values: any[] = [];
    
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email);
    }
    if (bio !== undefined) {
      updates.push('bio = ?');
      values.push(bio);
    }
    if (githubUrl !== undefined) {
      updates.push('github_url = ?');
      values.push(githubUrl);
    }
    if (qqNumber !== undefined) {
      updates.push('qq_number = ?');
      values.push(qqNumber);
    }
    if (techStack !== undefined) {
      updates.push('tech_stack = ?');
      values.push(techStack);
    }
    if (visitedProvinces !== undefined) {
      updates.push('visited_provinces = ?');
      values.push(visitedProvinces);
    }
    if (avatar !== undefined) {
      updates.push('avatar = ?');
      values.push(avatar);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        code: 400,
        message: 'No fields to update',
        data: null
      });
    }
    
    values.push(id);
    
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    
    // 获取更新后的用户信息
    const [rows] = await pool.query('SELECT id, username, email, role, avatar, bio, github_url, qq_number, tech_stack, visited_provinces, created_at FROM users WHERE id = ?', [id]) as any[];
    
    res.json({
      code: 200,
      message: 'User updated successfully',
      data: rows[0]
    });
  } catch (error: any) {
    console.error('更新用户失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

export default router;
