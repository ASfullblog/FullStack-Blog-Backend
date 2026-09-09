/**
 * 闯关挪车游戏路由
 */
import express from 'express';
import parkingRushController from '../controllers/parkingRushController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

// 获取关卡列表（含解锁状态）
router.get('/levels', parkingRushController.getLevelList);

// 获取单个关卡布局数据
router.get('/levels/:levelNumber', parkingRushController.getLevelData);

// 提交通关结果（需要登录）
router.post('/submit', authMiddleware, parkingRushController.submitResult);

// 获取排行榜
router.get('/leaderboard', parkingRushController.getLeaderboard);

// 获取用户游戏进度
router.get('/progress', authMiddleware, parkingRushController.getUserProgress);

// 保存用户选择的难度
router.post('/difficulty', authMiddleware, parkingRushController.saveDifficulty);

export default router;