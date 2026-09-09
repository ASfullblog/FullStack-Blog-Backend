import express from 'express'
import gameController from '../controllers/gameController'
import { authMiddleware } from '../middleware/authMiddleware'

const router = express.Router()

router.get('/', gameController.getGameList)
router.get('/:gameId/meta', gameController.getGameMeta)
router.post('/:gameId/view', gameController.trackGameView)
router.get('/:gameId/user-data', authMiddleware, gameController.getUserGameData)
router.post('/:gameId/user-data', authMiddleware, gameController.saveUserGameData)
router.get('/:gameId/leaderboard', gameController.getLeaderboard)
router.post('/:gameId/sync', authMiddleware, gameController.syncOfflineData)

export default router
