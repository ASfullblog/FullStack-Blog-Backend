import express from 'express';
import pool from '../config/database';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

/**
 * 系统设置路由
 * 处理系统配置的CRUD操作
 */

// 获取所有设置
router.get('/settings', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM sys_config') as any[];
    const settings: Record<string, string> = {};
    rows.forEach((row: any) => {
      settings[row.config_key] = row.config_value;
    });
    res.json({
      code: 200,
      message: 'Success',
      data: settings
    });
  } catch (error: any) {
    console.error('获取设置失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

// 获取单个设置
router.get('/settings/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const [rows] = await pool.query('SELECT * FROM sys_config WHERE config_key = ?', [key]) as any[];
    if (rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'Setting not found',
        data: null
      });
    }
    res.json({
      code: 200,
      message: 'Success',
      data: rows[0]
    });
  } catch (error: any) {
    console.error('获取设置失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

// 更新设置（需要管理员权限）
router.put('/settings', authMiddleware, async (req, res) => {
  try {
    const settings = req.body;
    
    // 批量更新设置
    for (const [key, value] of Object.entries(settings)) {
      await pool.query(
        'INSERT INTO sys_config (config_key, config_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_value = ?',
        [key, value, value]
      );
    }
    
    res.json({
      code: 200,
      message: 'Settings updated successfully',
      data: null
    });
  } catch (error: any) {
    console.error('更新设置失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

// 更新单个设置（需要管理员权限）
router.put('/settings/:key', authMiddleware, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    await pool.query(
      'INSERT INTO sys_config (config_key, config_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_value = ?',
      [key, value, value]
    );
    
    res.json({
      code: 200,
      message: 'Setting updated successfully',
      data: null
    });
  } catch (error: any) {
    console.error('更新设置失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

export default router;
