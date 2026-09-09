/**
 * 闯关挪车游戏控制器
 * 处理关卡获取、结果提交、排行榜等请求
 */
import { Request, Response } from 'express';
import parkingRushService from '../services/parkingRushService';

/**
 * 获取关卡列表（含解锁状态）
 * GET /api/parking-rush/levels
 */
const getLevelList = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || 1; // 未登录用户默认使用游客ID=1
    const levels = await parkingRushService.getLevelList(userId);
    res.json({
      code: 200,
      message: 'Success',
      data: levels,
    });
  } catch (error: any) {
    console.error('[ParkingRush] 获取关卡列表失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null,
    });
  }
};

/**
 * 获取单个关卡布局数据
 * GET /api/parking-rush/levels/:levelNumber
 * Query: ?mode=classic|evacuation&difficulty=easy|normal|medium|hard&regenerate=true|false
 */
const getLevelData = async (req: Request, res: Response): Promise<void> => {
  try {
    const levelNumber = parseInt(req.params.levelNumber);
    const mode = (req.query.mode as string) || 'classic';
    const difficulty = (req.query.difficulty as string) || '';
    const regenerate = (req.query.regenerate as string) === 'true';

    if (isNaN(levelNumber) || levelNumber < 1) {
      res.status(400).json({
        code: 400,
        message: 'Invalid level number',
        data: null,
      });
      return;
    }

    const level = await parkingRushService.getLevelData(levelNumber, mode, difficulty, regenerate);
    if (!level) {
      res.status(404).json({
        code: 404,
        message: 'Level not found',
        data: null,
      });
      return;
    }

    res.json({
      code: 200,
      message: 'Success',
      data: {
        id: level.id,
        levelNumber: level.level_number,
        mode: level.mode,
        difficulty: level.difficulty,
        gridSize: level.grid_size,
        exitRow: level.exit_row,
        boardData: level.board_data,
        minSteps: level.min_steps,
      },
    });
  } catch (error: any) {
    console.error('[ParkingRush] 获取关卡数据失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null,
    });
  }
};

/**
 * 提交通关结果
 * POST /api/parking-rush/submit
 * Body: { levelId, mode, steps, hintUsed, timeSeconds }
 */
const submitResult = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || 1;
    const { levelId, mode, steps, hintUsed, timeSeconds } = req.body;

    if (!levelId || steps === undefined) {
      res.status(400).json({
        code: 400,
        message: 'Missing required fields: levelId, steps',
        data: null,
      });
      return;
    }

    const result = await parkingRushService.submitResult(userId, {
      levelId,
      mode: mode || 'classic',
      steps,
      hintUsed: hintUsed || false,
      timeSeconds: timeSeconds || 0,
    });

    res.json({
      code: 200,
      message: 'Success',
      data: result,
    });
  } catch (error: any) {
    console.error('[ParkingRush] 提交通关结果失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null,
    });
  }
};

/**
 * 获取用户游戏进度
 * GET /api/parking-rush/progress
 */
const getUserProgress = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || 1;
    const progress = await parkingRushService.getUserProgress(userId);
    res.json({
      code: 200,
      message: 'Success',
      data: progress,
    });
  } catch (error: any) {
    console.error('[ParkingRush] 获取用户进度失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null,
    });
  }
};

/**
 * 保存用户选择的难度
 * POST /api/parking-rush/difficulty
 * Body: { difficulty }
 * 返回：更新后的用户进度数据
 */
const saveDifficulty = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || 1;
    const { difficulty } = req.body;

    if (!difficulty) {
      res.status(400).json({
        code: 400,
        message: 'Missing required field: difficulty',
        data: null,
      });
      return;
    }

    // 保存难度并返回最新用户进度
    const progress = await parkingRushService.saveUserDifficulty(userId, difficulty);
    res.json({
      code: 200,
      message: 'Success',
      data: progress,
    });
  } catch (error: any) {
    console.error('[ParkingRush] 保存难度失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null,
    });
  }
};

/**
 * 获取通用排行榜（支持多游戏复用）
 * GET /api/parking-rush/leaderboard?game=parkingRush&limit=50
 * game参数：parkingRush, snake, tetris等
 */
const getLeaderboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const game = (req.query.game as string) || 'parkingRush';
    
    // 根据游戏类型获取不同的排行榜数据
    let leaderboard: any[] = [];
    
    if (game === 'parkingRush') {
      leaderboard = await parkingRushService.getLeaderboard(Math.min(limit, 100));
    } else {
      // 其他游戏的排行榜可以在这里扩展
      // 暂时返回空数组
      leaderboard = [];
    }
    
    res.json({
      code: 200,
      message: 'Success',
      data: {
        game,
        leaderboard,
      },
    });
  } catch (error: any) {
    console.error('[ParkingRush] 获取排行榜失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null,
    });
  }
};

export default {
  getLevelList,
  getLevelData,
  submitResult,
  getLeaderboard,
  getUserProgress,
  saveDifficulty,
};