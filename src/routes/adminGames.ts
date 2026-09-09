import express from 'express'
import adminGameController from '../controllers/adminGameController'
import { adminMiddleware } from '../middleware/authMiddleware'

const router = express.Router()

router.get('/admin/dashboard/stats', adminMiddleware, adminGameController.getDashboardStats)
router.get('/admin/games', adminMiddleware, adminGameController.getGames)
router.put('/admin/games/:id/publish', adminMiddleware, adminGameController.updatePublishStatus)

export default router
