import express from 'express';
import { Request, Response } from 'express';
import gameLevelConfigService from '../services/gameLevelConfigService';

const router = express.Router();

router.get('/games/link-match/levels/:levelNumber', async (req: Request, res: Response) => {
  try {
    const levelNumber = Number.parseInt(req.params.levelNumber, 10);
    if (!Number.isInteger(levelNumber) || levelNumber < 1) {
      res.status(400).json({
        code: 400,
        message: 'Invalid level number',
        data: null
      });
      return;
    }

    const config = await gameLevelConfigService.getLinkMatchLevelConfig(
      levelNumber,
      req.query.difficulty as string | undefined,
      req.query.mode as string | undefined,
      req.query.regenerate === 'true'
    );

    res.json({
      code: 200,
      message: 'Success',
      data: config
    });
  } catch (error: any) {
    console.error('[GameLevelConfigs] failed to fetch link match config:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

export default router;
