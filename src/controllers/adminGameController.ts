import { Request, Response } from 'express'
import adminGameService from '../services/adminGameService'

const getGames = async (_req: Request, res: Response): Promise<void> => {
  try {
    const games = await adminGameService.getAdminGameList()
    res.json({
      code: 200,
      message: 'Success',
      data: games
    })
  } catch (error: any) {
    res.status(500).json({
      code: 500,
      message: error.message || 'Failed to fetch games',
      data: null
    })
  }
}

const updatePublishStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id)
    const isPublished = Boolean(req.body?.isPublished)

    if (!id) {
      res.status(400).json({
        code: 400,
        message: 'Invalid game id',
        data: null
      })
      return
    }

    const game = await adminGameService.updateGamePublishStatus(id, isPublished)
    if (!game) {
      res.status(404).json({
        code: 404,
        message: 'Game not found',
        data: null
      })
      return
    }

    res.json({
      code: 200,
      message: 'Success',
      data: game
    })
  } catch (error: any) {
    res.status(500).json({
      code: 500,
      message: error.message || 'Failed to update game status',
      data: null
    })
  }
}

const getDashboardStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await adminGameService.getDashboardStats()
    res.json({
      code: 200,
      message: 'Success',
      data: stats
    })
  } catch (error: any) {
    res.status(500).json({
      code: 500,
      message: error.message || 'Failed to fetch dashboard stats',
      data: null
    })
  }
}

const trackGameView = async (req: Request, res: Response): Promise<void> => {
  try {
    const slug = String(req.params.slug || '')
    if (!slug) {
      res.status(400).json({
        code: 400,
        message: 'Invalid game slug',
        data: null
      })
      return
    }

    await adminGameService.incrementGameViewCount(slug)
    res.json({
      code: 200,
      message: 'Success',
      data: null
    })
  } catch (error: any) {
    res.status(500).json({
      code: 500,
      message: error.message || 'Failed to track game view',
      data: null
    })
  }
}

export default {
  getGames,
  updatePublishStatus,
  getDashboardStats,
  trackGameView
}
