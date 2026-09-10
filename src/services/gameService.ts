/**
 * 通用游戏服务层
 * 支持多游戏复用的数据查询、排行榜、用户进度管理
 */
import pool from '../config/database';

// ==================== 类型定义 ====================

/** 游戏类型 */
export type GameType = 'parkingRush' | 'snake' | 'tetris' | 'minesweeper';

/** 难度等级 */
export type Difficulty = 'easy' | 'normal' | 'medium' | 'hard';

/** 用户游戏数据 */
export interface UserGameData {
  currentLevel: number;
  totalStars: number;
  selectedDifficulty: string;
  coins: number;
  playCount: number;
  totalPlayTime: number; // 总游玩时长（秒）
  lastPlayedAt: string | null;
  // 其他游戏可扩展字段
  [key: string]: any;
}

/** 排行榜项 */
export interface LeaderboardItem {
  rank: number;
  userId: number;
  username: string;
  avatar: string | null;
  score: number; // 总分/星星数
  level: number; // 当前关卡
  playCount: number; // 游玩次数
  bestRecord: any; // 最佳记录（游戏自定义）
}

/** 排行榜查询参数 */
export interface LeaderboardQuery {
  gameId: GameType;
  difficulty?: string; // 按难度筛选（可选）
  limit: number;
  offset: number;
}

/** 游戏元数据 */
interface GameMeta {
  id: GameType;
  name: string;
  hasDifficulty: boolean;
  hasLevels: boolean;
  scoreField: string; // 分数字段名
}

// ==================== 游戏元数据配置 ====================

const GAME_META: Record<GameType, GameMeta> = {
  parkingRush: {
    id: 'parkingRush',
    name: '停车大挑战',
    hasDifficulty: true,
    hasLevels: true,
    scoreField: 'totalStars',
  },
  snake: {
    id: 'snake',
    name: '贪吃蛇',
    hasDifficulty: false,
    hasLevels: false,
    scoreField: 'highScore',
  },
  tetris: {
    id: 'tetris',
    name: '俄罗斯方块',
    hasDifficulty: false,
    hasLevels: false,
    scoreField: 'highScore',
  },
  minesweeper: {
    id: 'minesweeper',
    name: '扫雷',
    hasDifficulty: true,
    hasLevels: false,
    scoreField: 'bestTime',
  },
};

// ==================== 核心服务方法 ====================

/**
 * 获取用户在某游戏中的数据
 * @param userId 用户ID
 * @param gameId 游戏ID
 * @returns 用户游戏数据
 */
const getUserGameData = async (userId: number, gameId: GameType): Promise<UserGameData> => {
  // 从 users 表获取 games_data
  const [userRows] = await pool.query(
    'SELECT games_data FROM users WHERE id = ?',
    [userId]
  ) as any[];

  const gamesData = userRows[0]?.games_data || {};
  const gameData = gamesData[gameId] || {};

  // 获取该游戏的通关记录统计
  const [statsRows] = await pool.query(
    `SELECT 
      COUNT(DISTINCT level_id) as completedLevels,
      COALESCE(SUM(stars), 0) as totalStars,
      COUNT(*) as playCount,
      COALESCE(SUM(time_seconds), 0) as totalPlayTime,
      MAX(completed_at) as lastPlayedAt
     FROM user_level_records r
     JOIN game_levels l ON r.level_id = l.id
     WHERE r.user_id = ? AND l.mode = 'classic'`,
    [userId]
  ) as any[];

  const stats = statsRows[0] || {};

  // 合并数据
  return {
    currentLevel: gameData.currentLevel || 1,
    totalStars: Number(stats.totalStars) || gameData.totalStars || 0,
    selectedDifficulty: gameData.selectedDifficulty || 'easy',
    coins: gameData.coins || 0,
    playCount: Number(stats.playCount) || gameData.playCount || 0,
    totalPlayTime: Number(stats.totalPlayTime) || gameData.totalPlayTime || 0,
    lastPlayedAt: stats.lastPlayedAt || gameData.lastPlayedAt || null,
    ...gameData, // 保留其他自定义字段
  };
};

/**
 * 保存用户游戏数据
 * @param userId 用户ID
 * @param gameId 游戏ID
 * @param data 要保存的数据
 */
const saveUserGameData = async (
  userId: number,
  gameId: GameType,
  data: Partial<UserGameData>
): Promise<UserGameData> => {
  // 构建更新数据
  const updateData = {
    [gameId]: data,
  };

  await pool.query(
    'UPDATE users SET games_data = COALESCE(games_data, \'{}\'::jsonb) || ?::jsonb WHERE id = ?',
    [JSON.stringify(updateData), userId]
  );

  // 返回更新后的完整数据
  return getUserGameData(userId, gameId);
};

/**
 * 更新用户游戏数据（增量更新）
 * @param userId 用户ID
 * @param gameId 游戏ID
 * @param updates 增量更新数据
 */
const updateUserGameData = async (
  userId: number,
  gameId: GameType,
  updates: Partial<UserGameData>
): Promise<UserGameData> => {
  // 先获取现有数据
  const currentData = await getUserGameData(userId, gameId);

  // 合并更新
  const newData = {
    ...currentData,
    ...updates,
    // 特殊字段处理
    totalStars: updates.totalStars !== undefined
      ? updates.totalStars
      : currentData.totalStars,
    coins: updates.coins !== undefined
      ? updates.coins
      : currentData.coins,
    playCount: updates.playCount !== undefined
      ? updates.playCount
      : currentData.playCount + 1, // 默认+1
    lastPlayedAt: new Date().toISOString(),
  };

  return saveUserGameData(userId, gameId, newData);
};

/**
 * 获取游戏排行榜（带缓存）
 * @param query 查询参数
 * @returns 排行榜数据
 */
const getLeaderboard = async (query: LeaderboardQuery): Promise<{
  gameId: GameType;
  difficulty?: string;
  total: number;
  list: LeaderboardItem[];
  updatedAt: string;
}> => {
  const { gameId, difficulty, limit, offset } = query;
  const meta = GAME_META[gameId];

  if (!meta) {
    throw new Error(`Unknown game: ${gameId}`);
  }

  // 构建查询条件
  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (gameId === 'parkingRush') {
    // 停车闯关：从通关记录统计
    whereClause += ' AND l.mode = ?';
    params.push('classic');

    if (difficulty && difficulty !== 'all') {
      whereClause += ' AND l.difficulty = ?';
      params.push(difficulty);
    }
  }

  // 查询总数
  const [countRows] = await pool.query(
    `SELECT COUNT(DISTINCT r.user_id) as total
     FROM user_level_records r
     JOIN game_levels l ON r.level_id = l.id
     ${whereClause}`,
    params
  ) as any[];

  const total = countRows[0]?.total || 0;

  // 查询排行榜数据
  let list: LeaderboardItem[] = [];

  if (gameId === 'parkingRush') {
    const [rows] = await pool.query(
      `SELECT 
        u.id as userId,
        u.username,
        u.avatar,
        COALESCE(SUM(r.stars), 0) as score,
        COUNT(DISTINCT r.level_id) as level,
        COUNT(*) as playCount,
        MIN(r.steps) as bestRecord
       FROM users u
       JOIN user_level_records r ON u.id = r.user_id
       JOIN game_levels l ON r.level_id = l.id
       ${whereClause}
       GROUP BY u.id
       ORDER BY score DESC, level DESC, playCount ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    ) as any[];

    list = rows.map((row: any, index: number) => ({
      rank: offset + index + 1,
      userId: row.userId,
      username: row.username,
      avatar: row.avatar,
      score: Number(row.score),
      level: Number(row.level),
      playCount: Number(row.playCount),
      bestRecord: row.bestRecord,
    }));
  } else {
    // 其他游戏：从 games_data 中读取
    // 这里需要根据具体游戏实现
    list = [];
  }

  return {
    gameId,
    difficulty,
    total,
    list,
    updatedAt: new Date().toISOString(),
  };
};

/**
 * 游戏列表项（从数据库查询）
 */
export interface GameListItem {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  shortDesc: string | null;
  imageUrl: string | null;
  tags: string[];
  isPublished: boolean;
  viewCount: number;
  likeCount: number;
  ratingAvg: number;
  sortOrder: number;
  createdAt: string;
}

/**
 * 获取所有支持的游戏列表（从数据库查询）
 */
const getGameList = async (): Promise<GameListItem[]> => {
  const [rows] = await pool.query(
    `SELECT id, name, slug, description, short_desc, image_url, tags, 
            is_published, view_count, like_count, rating_avg, sort_order, created_at
     FROM games
     WHERE is_published = 1
     ORDER BY sort_order ASC, id ASC`
  ) as any[];

  return rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    shortDesc: row.short_desc,
    imageUrl: row.image_url,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags || [],
    isPublished: row.is_published === 1,
    viewCount: row.view_count,
    likeCount: row.like_count,
    ratingAvg: Number(row.rating_avg),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  }));
};

/**
 * 检查游戏是否存在
 */
const isValidGame = (gameId: string): gameId is GameType => {
  return gameId in GAME_META;
};

/**
 * 获取游戏元数据
 */
const getGameMeta = (gameId: GameType): GameMeta => {
  return GAME_META[gameId];
};

/**
 * 同步离线数据（断网后恢复）
 * @param userId 用户ID
 * @param gameId 游戏ID
 * @param offlineData 离线期间的数据
 */
const syncOfflineData = async (
  userId: number,
  gameId: GameType,
  offlineData: {
    levels?: Array<{ levelId: number; stars: number; steps: number; timeSeconds: number }>;
    totalStars?: number;
    playCount?: number;
    lastPlayedAt?: string;
  }
): Promise<{
  synced: boolean;
  conflicts: any[];
  finalData: UserGameData;
}> => {
  const currentData = await getUserGameData(userId, gameId);
  const conflicts: any[] = [];

  // 处理关卡数据冲突
  if (offlineData.levels && gameId === 'parkingRush') {
    for (const level of offlineData.levels) {
      // 检查是否已有记录
      const [existing] = await pool.query(
        `SELECT r.stars, r.steps
         FROM user_level_records r
         JOIN game_levels l ON r.level_id = l.id
         WHERE r.user_id = ? AND l.level_number = ? AND l.mode = 'classic'`,
        [userId, level.levelId]
      ) as any[];

      if (existing.length > 0) {
        // 有冲突：取星星数更高的
        if (level.stars > existing[0].stars) {
          conflicts.push({
            type: 'level',
            levelId: level.levelId,
            local: existing[0],
            remote: level,
            resolution: 'remote', // 使用离线数据（更高分）
          });
        } else {
          conflicts.push({
            type: 'level',
            levelId: level.levelId,
            local: existing[0],
            remote: level,
            resolution: 'local', // 保留服务器数据
          });
        }
      }
    }
  }

  // 合并数据（简单策略：取最大值）
  const mergedData: Partial<UserGameData> = {
    totalStars: Math.max(currentData.totalStars, offlineData.totalStars || 0),
    playCount: currentData.playCount + (offlineData.playCount || 0),
    lastPlayedAt: offlineData.lastPlayedAt || currentData.lastPlayedAt,
  };

  // 保存合并后的数据
  const finalData = await updateUserGameData(userId, gameId, mergedData);

  return {
    synced: true,
    conflicts,
    finalData,
  };
};

export default {
  getUserGameData,
  saveUserGameData,
  updateUserGameData,
  getLeaderboard,
  getGameList,
  isValidGame,
  getGameMeta,
  syncOfflineData,
};
