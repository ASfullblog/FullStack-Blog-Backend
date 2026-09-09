/**
 * 通用游戏控制器
 * 处理多游戏复用的数据查询、排行榜、用户进度等请求
 */
import { Request, Response } from 'express';
import gameService, { GameType } from '../services/gameService';
import adminGameService from '../services/adminGameService'

/**
 * 获取所有游戏列表
 * GET /api/games
 */
const getGameList = async (req: Request, res: Response): Promise<void> => {
  try {
    const games = await gameService.getGameList();
    res.json({
      code: 200,
      message: 'Success',
      data: games,
    });
  } catch (error: any) {
    console.error('[Game] 获取游戏列表失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null,
    });
  }
};

/**
 * 获取当前用户在指定游戏中的数据
 * GET /api/games/:gameId/user-data
 */
const getUserGameData = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || 1;
    const gameId = req.params.gameId as GameType;

    // 验证游戏ID
    if (!gameService.isValidGame(gameId)) {
      res.status(400).json({
        code: 400,
        message: `Invalid game ID: ${gameId}`,
        data: null,
      });
      return;
    }

    const data = await gameService.getUserGameData(userId, gameId);
    res.json({
      code: 200,
      message: 'Success',
      data: {
        gameId,
        userId,
        ...data,
      },
    });
  } catch (error: any) {
    console.error('[Game] 获取用户游戏数据失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null,
    });
  }
};

/**
 * 保存/更新用户游戏数据
 * POST /api/games/:gameId/user-data
 * Body: { currentLevel?, totalStars?, selectedDifficulty?, coins?, ... }
 */
const saveUserGameData = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || 1;
    const gameId = req.params.gameId as GameType;
    const updates = req.body;

    // 验证游戏ID
    if (!gameService.isValidGame(gameId)) {
      res.status(400).json({
        code: 400,
        message: `Invalid game ID: ${gameId}`,
        data: null,
      });
      return;
    }

    // 更新数据并返回最新状态
    const data = await gameService.updateUserGameData(userId, gameId, updates);
    res.json({
      code: 200,
      message: 'Success',
      data: {
        gameId,
        userId,
        ...data,
      },
    });
  } catch (error: any) {
    console.error('[Game] 保存用户游戏数据失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null,
    });
  }
};

/**
 * 获取游戏排行榜（通用接口，支持多游戏）
 * GET /api/games/:gameId/leaderboard?difficulty=easy&limit=50&offset=0
 */
const getLeaderboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const gameId = req.params.gameId as GameType;
    const difficulty = (req.query.difficulty as string) || undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    // 验证游戏ID
    if (!gameService.isValidGame(gameId)) {
      res.status(400).json({
        code: 400,
        message: `Invalid game ID: ${gameId}`,
        data: null,
      });
      return;
    }

    const result = await gameService.getLeaderboard({
      gameId,
      difficulty,
      limit,
      offset,
    });

    res.json({
      code: 200,
      message: 'Success',
      data: result,
    });
  } catch (error: any) {
    console.error('[Game] 获取排行榜失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null,
    });
  }
};

/**
 * 同步离线数据
 * POST /api/games/:gameId/sync
 * Body: { levels?: [...], totalStars?: number, playCount?: number }
 */
const syncOfflineData = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || 1;
    const gameId = req.params.gameId as GameType;
    const offlineData = req.body;

    // 验证游戏ID
    if (!gameService.isValidGame(gameId)) {
      res.status(400).json({
        code: 400,
        message: `Invalid game ID: ${gameId}`,
        data: null,
      });
      return;
    }

    const result = await gameService.syncOfflineData(userId, gameId, offlineData);
    res.json({
      code: 200,
      message: 'Success',
      data: result,
    });
  } catch (error: any) {
    console.error('[Game] 同步离线数据失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null,
    });
  }
};

/**
 * 获取游戏元数据
 * GET /api/games/:gameId/meta
 */
const getGameMeta = async (req: Request, res: Response): Promise<void> => {
  try {
    const gameId = req.params.gameId as GameType;

    // 验证游戏ID
    if (!gameService.isValidGame(gameId)) {
      res.status(400).json({
        code: 400,
        message: `Invalid game ID: ${gameId}`,
        data: null,
      });
      return;
    }

    const meta = gameService.getGameMeta(gameId);
    res.json({
      code: 200,
      message: 'Success',
      data: meta,
    });
  } catch (error: any) {
    console.error('[Game] 获取游戏元数据失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null,
    });
  }
};

const trackGameView = async (req: Request, res: Response): Promise<void> => {
  try {
    const slug = req.params.gameId
    await adminGameService.incrementGameViewCount(slug)
    res.json({
      code: 200,
      message: 'Success',
      data: null
    })
  } catch (error: any) {
    console.error('[Game] track view failed:', error)
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    })
  }
}

export default {
  getGameList,
  getUserGameData,
  saveUserGameData,
  getLeaderboard,
  syncOfflineData,
  getGameMeta,
  trackGameView,
};
