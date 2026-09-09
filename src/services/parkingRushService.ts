/**
 * 闯关挪车游戏服务
 * 关卡生成算法 + BFS 求解器 + 疏散模式生成
 */
import pool from '../config/database';

// ==================== 类型定义 ====================

/** 难度等级 */
type Difficulty = 'easy' | 'normal' | 'medium' | 'hard';

/** 车辆朝向 */
type Orientation = 'horizontal' | 'vertical';

/** 车型 */
type CarType = 'small' | 'truck' | 'fire' | 'police' | 'ambulance';

/** 一辆车的定义 */
interface Car {
  id: number;
  type: CarType;
  orientation: Orientation;
  length: number;
  row: number;
  col: number;
  isTarget: boolean;
  color: string;
}

/** 关卡布局数据 */
interface BoardData {
  gridSize: number;
  exitRow: number;
  cars: Car[];
}

/** 关卡记录 */
interface GameLevel {
  id: number;
  level_number: number;
  mode: string;
  difficulty: string;
  grid_size: number;
  exit_row: number;
  board_data: BoardData;
  min_steps: number;
}

/** 提交通关结果请求 */
interface SubmitResult {
  levelId: number;
  mode: string;
  steps: number;
  hintUsed: boolean;
  timeSeconds: number;
}

// ==================== 难度配置 ====================

/** 难度配置映射 */
const DIFFICULTY_CONFIG: Record<Difficulty, {
  gridSizeRange: [number, number];
  carCountRange: [number, number];
  targetDepthRange: [number, number];
  blockLayers: number;
  hasTruck: boolean;
}> = {
  easy:   { gridSizeRange: [4, 5], carCountRange: [3, 5],  targetDepthRange: [1, 2], blockLayers: 1, hasTruck: false },
  normal: { gridSizeRange: [5, 6], carCountRange: [5, 8],  targetDepthRange: [2, 3], blockLayers: 2, hasTruck: false },
  medium: { gridSizeRange: [6, 7], carCountRange: [8, 12], targetDepthRange: [3, 4], blockLayers: 3, hasTruck: true  },
  hard:   { gridSizeRange: [7, 15], carCountRange: [12, 30], targetDepthRange: [4, 6], blockLayers: 4, hasTruck: true  },
};

/** 车辆颜色 */
const CAR_COLORS: Record<CarType, string> = {
  small: '#4ECDC4',
  truck: '#FF6B6B',
  fire: '#FF4444',
  police: '#4444FF',
  ambulance: '#FFFFFF',
};

// ==================== 工具函数 ====================

/** 随机整数 [min, max] */
const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

/** 随机选择数组元素 */
const randPick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** 检查位置是否被占用 */
const isPositionOccupied = (
  row: number, col: number, orientation: Orientation,
  length: number, cars: Car[]
): boolean => {
  for (const car of cars) {
    for (let i = 0; i < car.length; i++) {
      const cr = car.orientation === 'vertical' ? car.row + i : car.row;
      const cc = car.orientation === 'horizontal' ? car.col + i : car.col;
      for (let j = 0; j < length; j++) {
        const nr = orientation === 'vertical' ? row + j : row;
        const nc = orientation === 'horizontal' ? col + j : col;
        if (cr === nr && cc === nc) return true;
      }
    }
  }
  return false;
};

/** 检查车辆是否越界 */
const isOutOfBounds = (
  row: number, col: number, orientation: Orientation,
  length: number, gridSize: number
): boolean => {
  if (row < 0 || col < 0) return true;
  if (orientation === 'horizontal') return col + length > gridSize;
  return row + length > gridSize;
};

// ==================== BFS 求解器 ====================

/** 棋盘状态：用各车的位置表示（id -> 行列） */
interface BoardState {
  cars: Map<number, { row: number; col: number }>;
}

/** BFS 节点 */
interface BFSNode {
  state: BoardState;
  steps: number;
  prev: BFSNode | null;
  move: string | null; // 记录移动操作
}

/** 将车辆列表转为状态快照字符串 */
const stateToKey = (cars: Car[]): string => {
  return cars.map(c => `${c.id}:${c.row},${c.col}`).sort().join('|');
};

/** 将 BFS 状态转为快照字符串 */
const boardStateToKey = (state: BoardState): string => {
  const parts: string[] = [];
  for (const [id, pos] of state.cars.entries()) {
    parts.push(`${id}:${pos.row},${pos.col}`);
  }
  return parts.sort().join('|');
};

/** 检查车辆能否移动 */
const canMove = (
  carId: number, newRow: number, newCol: number,
  orientation: Orientation, length: number,
  gridSize: number, cars: Map<number, { row: number; col: number; orientation: Orientation; length: number }>
): boolean => {
  if (isOutOfBounds(newRow, newCol, orientation, length, gridSize)) return false;

  for (const [id, c] of cars) {
    if (id === carId) continue;
    for (let i = 0; i < c.length; i++) {
      const cr = c.orientation === 'vertical' ? c.row + i : c.row;
      const cc = c.orientation === 'horizontal' ? c.col + i : c.col;
      for (let j = 0; j < length; j++) {
        const nr = orientation === 'vertical' ? newRow + j : newRow;
        const nc = orientation === 'horizontal' ? newCol + j : newCol;
        if (cr === nr && cc === nc) return false;
      }
    }
  }
  return true;
};

/** 检查目标车是否到达出口 */
const isTargetAtExit = (targetCar: Car, gridSize: number): boolean => {
  return targetCar.col + targetCar.length === gridSize;
};

/** BFS 求解最少步数（带超时和步数限制） */
const solveWithBFS = (cars: Car[], gridSize: number, maxSteps: number = 50, timeoutMs: number = 2000): number | null => {
  const targetCar = cars.find(c => c.isTarget);
  if (!targetCar) return null;

  const startTime = Date.now();

  // 构建车辆信息映射
  const carInfo = new Map<number, { orientation: Orientation; length: number }>();
  for (const c of cars) {
    carInfo.set(c.id, { orientation: c.orientation, length: c.length });
  }

  // 初始状态
  const initialCars = new Map<number, { row: number; col: number }>();
  for (const c of cars) {
    initialCars.set(c.id, { row: c.row, col: c.col });
  }

  const initialKey = boardStateToKey({ cars: initialCars });
  const visited = new Set<string>([initialKey]);
  const queue: BFSNode[] = [{ state: { cars: initialCars }, steps: 0, prev: null, move: null }];

  let head = 0;
  while (head < queue.length) {
    // 超时检查
    if (Date.now() - startTime > timeoutMs) {
      return null; // 超时，认为无解或太难
    }

    // 最大步数限制
    if (queue[head].steps >= maxSteps) {
      continue;
    }
    const node = queue[head++];

    // 检查目标车是否到达出口
    const targetPos = node.state.cars.get(targetCar.id)!;
    const targetInfo = carInfo.get(targetCar.id)!;
    if (targetPos.col + targetInfo.length === gridSize) {
      return node.steps;
    }

    // 尝试移动每辆车
    for (const [carId, pos] of node.state.cars) {
      const info = carInfo.get(carId)!;

      if (info.orientation === 'horizontal') {
        // 向左移动
        for (let step = -1; pos.col + step >= 0; step--) {
          const newCol = pos.col + step;
          const newCars = new Map(node.state.cars);
          newCars.set(carId, { row: pos.row, col: newCol });
          // 检查能否移动（需要逐格检查）
          let blocked = false;
          for (const [otherId, otherPos] of node.state.cars) {
            if (otherId === carId) continue;
            const otherInfo = carInfo.get(otherId)!;
            for (let i = 0; i < otherInfo.length; i++) {
              const or = otherInfo.orientation === 'vertical' ? otherPos.row + i : otherPos.row;
              const oc = otherInfo.orientation === 'horizontal' ? otherPos.col + i : otherPos.col;
              for (let j = 0; j < info.length; j++) {
                if (or === pos.row && oc === newCol + j) { blocked = true; break; }
              }
              if (blocked) break;
            }
            if (blocked) break;
          }
          if (blocked) break;
          const key = boardStateToKey({ cars: newCars });
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ state: { cars: newCars }, steps: node.steps + 1, prev: node, move: `${carId}:L${Math.abs(step)}` });
          }
        }
        // 向右移动
        for (let step = 1; pos.col + info.length + step <= gridSize; step++) {
          const newCol = pos.col + step;
          let blocked = false;
          for (const [otherId, otherPos] of node.state.cars) {
            if (otherId === carId) continue;
            const otherInfo = carInfo.get(otherId)!;
            for (let i = 0; i < otherInfo.length; i++) {
              const or = otherInfo.orientation === 'vertical' ? otherPos.row + i : otherPos.row;
              const oc = otherInfo.orientation === 'horizontal' ? otherPos.col + i : otherPos.col;
              for (let j = 0; j < info.length; j++) {
                if (or === pos.row && oc === newCol + j) { blocked = true; break; }
              }
              if (blocked) break;
            }
            if (blocked) break;
          }
          if (blocked) break;
          const newCars = new Map(node.state.cars);
          newCars.set(carId, { row: pos.row, col: newCol });
          const key = boardStateToKey({ cars: newCars });
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ state: { cars: newCars }, steps: node.steps + 1, prev: node, move: `${carId}:R${step}` });
          }
        }
      } else {
        // 向上移动
        for (let step = -1; pos.row + step >= 0; step--) {
          const newRow = pos.row + step;
          let blocked = false;
          for (const [otherId, otherPos] of node.state.cars) {
            if (otherId === carId) continue;
            const otherInfo = carInfo.get(otherId)!;
            for (let i = 0; i < otherInfo.length; i++) {
              const or = otherInfo.orientation === 'vertical' ? otherPos.row + i : otherPos.row;
              const oc = otherInfo.orientation === 'horizontal' ? otherPos.col + i : otherPos.col;
              for (let j = 0; j < info.length; j++) {
                if (or === newRow + j && oc === pos.col) { blocked = true; break; }
              }
              if (blocked) break;
            }
            if (blocked) break;
          }
          if (blocked) break;
          const newCars = new Map(node.state.cars);
          newCars.set(carId, { row: newRow, col: pos.col });
          const key = boardStateToKey({ cars: newCars });
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ state: { cars: newCars }, steps: node.steps + 1, prev: node, move: `${carId}:U${Math.abs(step)}` });
          }
        }
        // 向下移动
        for (let step = 1; pos.row + info.length + step <= gridSize; step++) {
          const newRow = pos.row + step;
          let blocked = false;
          for (const [otherId, otherPos] of node.state.cars) {
            if (otherId === carId) continue;
            const otherInfo = carInfo.get(otherId)!;
            for (let i = 0; i < otherInfo.length; i++) {
              const or = otherInfo.orientation === 'vertical' ? otherPos.row + i : otherPos.row;
              const oc = otherInfo.orientation === 'horizontal' ? otherPos.col + i : otherPos.col;
              for (let j = 0; j < info.length; j++) {
                if (or === newRow + j && oc === pos.col) { blocked = true; break; }
              }
              if (blocked) break;
            }
            if (blocked) break;
          }
          if (blocked) break;
          const newCars = new Map(node.state.cars);
          newCars.set(carId, { row: newRow, col: pos.col });
          const key = boardStateToKey({ cars: newCars });
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ state: { cars: newCars }, steps: node.steps + 1, prev: node, move: `${carId}:D${step}` });
          }
        }
      }
    }
  }

  return null; // 无解
};

// ==================== 关卡生成算法 ====================

/** 快速检查关卡是否有解（启发式） */
const hasQuickSolution = (cars: Car[], gridSize: number, exitRow: number): boolean => {
  const targetCar = cars.find(c => c.isTarget);
  if (!targetCar) return false;

  // 检查目标车前方是否有直接阻挡
  const targetEndCol = targetCar.col + targetCar.length;
  for (const car of cars) {
    if (car.isTarget) continue;
    if (car.orientation === 'vertical' && car.col === targetEndCol) {
      // 竖向车在目标车前方，检查是否可以移开
      let canMoveUp = true;
      let canMoveDown = true;
      for (const other of cars) {
        if (other.id === car.id) continue;
        // 检查上方
        for (let i = 1; i <= car.row; i++) {
          if (isPositionOccupied(car.row - i, car.col, car.orientation, car.length, [other])) {
            canMoveUp = false;
            break;
          }
        }
        // 检查下方
        for (let i = 1; car.row + car.length + i <= gridSize; i++) {
          if (isPositionOccupied(car.row + i, car.col, car.orientation, car.length, [other])) {
            canMoveDown = false;
            break;
          }
        }
      }
      if (!canMoveUp && !canMoveDown) return false;
    }
  }
  return true;
};

/** 生成一个经典模式关卡 */
const generateClassicLevel = (difficulty: Difficulty): { boardData: BoardData; minSteps: number } => {
  const config = DIFFICULTY_CONFIG[difficulty];
  const gridSize = randInt(config.gridSizeRange[0], config.gridSizeRange[1]);
  const carCount = randInt(config.carCountRange[0], config.carCountRange[1]);
  const targetDepth = randInt(config.targetDepthRange[0], config.targetDepthRange[1]);
  const exitRow = Math.floor(gridSize / 2);

  let maxRetries = 20; // 减少重试次数
  while (maxRetries > 0) {
    maxRetries--;
    const cars: Car[] = [];
    let carId = 1;

    // 1. 放置目标车
    const targetStartCol = Math.max(0, gridSize - 2 - targetDepth);
    const targetCar: Car = {
      id: carId++,
      type: 'small',
      orientation: 'horizontal',
      length: 2,
      row: exitRow,
      col: targetStartCol,
      isTarget: true,
      color: CAR_COLORS.small,
    };
    cars.push(targetCar);

    // 2. 按深度逐层放置阻挡车辆
    const blockLayers = config.blockLayers;
    for (let layer = 0; layer < blockLayers; layer++) {
      const blocksInLayer = 1 + Math.floor(Math.random() * 2);
      for (let b = 0; b < blocksInLayer; b++) {
        let attempts = 0;
        while (attempts < 50) { // 减少尝试次数
          attempts++;
          const isTruck = config.hasTruck && Math.random() < 0.3;
          const type: CarType = isTruck ? 'truck' : 'small';
          const length = isTruck ? 3 : 2;
          const orientation: Orientation = Math.random() > 0.5 ? 'horizontal' : 'vertical';

          const row = Math.floor(Math.random() * gridSize);
          const col = Math.floor(Math.random() * gridSize);

          if (row === exitRow && orientation === 'horizontal') continue;

          if (!isOutOfBounds(row, col, orientation, length, gridSize) &&
              !isPositionOccupied(row, col, orientation, length, cars)) {
            cars.push({
              id: carId++, type, orientation, length, row, col,
              isTarget: false, color: CAR_COLORS[type],
            });
            break;
          }
        }
      }
    }

    // 3. 填充剩余车辆
    let fillAttempts = 0;
    const maxFillAttempts = 200; // 减少填充尝试次数
    while (cars.length < carCount && fillAttempts < maxFillAttempts) {
      fillAttempts++;
      const isTruck = config.hasTruck && Math.random() < 0.3;
      const type: CarType = isTruck ? 'truck' : 'small';
      const length = isTruck ? 3 : 2;
      const orientation: Orientation = Math.random() > 0.5 ? 'horizontal' : 'vertical';

      const row = Math.floor(Math.random() * gridSize);
      const col = Math.floor(Math.random() * gridSize);

      if (row === exitRow && orientation === 'horizontal') continue;

      if (!isOutOfBounds(row, col, orientation, length, gridSize) &&
          !isPositionOccupied(row, col, orientation, length, cars)) {
        cars.push({
          id: carId++, type, orientation, length, row, col,
          isTarget: false, color: CAR_COLORS[type],
        });
      }
    }

    // 4. 快速可解性检查
    if (!hasQuickSolution(cars, gridSize, exitRow)) {
      continue; // 快速检查失败，跳过BFS
    }

    // 5. BFS 求解验证（带超时）
    const minSteps = solveWithBFS(cars, gridSize, 50, 1500);
    if (minSteps !== null && minSteps > 0) {
      return {
        boardData: { gridSize, exitRow, cars },
        minSteps,
      };
    }
  }

  // 兜底：返回一个极简关卡
  return generateFallbackLevel(difficulty);
};

/** 兜底关卡生成（确保有解） */
const generateFallbackLevel = (difficulty: Difficulty): { boardData: BoardData; minSteps: number } => {
  const config = DIFFICULTY_CONFIG[difficulty];
  const gridSize = randInt(config.gridSizeRange[0], config.gridSizeRange[1]);
  const exitRow = Math.floor(gridSize / 2);

  const cars: Car[] = [];
  let carId = 1;

  // 目标车
  cars.push({
    id: carId++, type: 'small', orientation: 'horizontal', length: 2,
    row: exitRow, col: gridSize - 3, isTarget: true, color: CAR_COLORS.small,
  });

  // 在目标车前面放一辆竖向车（简单阻挡）
  cars.push({
    id: carId++, type: 'small', orientation: 'vertical', length: 2,
    row: exitRow - 1, col: gridSize - 1, isTarget: false, color: CAR_COLORS.small,
  });

  const minSteps = solveWithBFS(cars, gridSize)!;
  return { boardData: { gridSize, exitRow, cars }, minSteps };
};

/** 获取难度对应的章节 */
const getDifficultyByLevel = (level: number): Difficulty => {
  if (level <= 10) return 'easy';
  if (level <= 30) return 'normal';
  if (level <= 60) return 'medium';
  return 'hard';
};

// ==================== 数据库操作 ====================

/** 预生成前1000关并存入数据库 */
const preGenerateLevels = async (count: number = 1000): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (let level = 1; level <= count; level++) {
      const difficulty = getDifficultyByLevel(level);
      const { boardData, minSteps } = generateClassicLevel(difficulty);

      await connection.query(
        `INSERT INTO game_levels (level_number, mode, difficulty, grid_size, exit_row, board_data, min_steps)
         VALUES (?, 'classic', ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           difficulty = VALUES(difficulty),
           grid_size = VALUES(grid_size),
           exit_row = VALUES(exit_row),
           board_data = VALUES(board_data),
           min_steps = VALUES(min_steps)`,
        [level, difficulty, boardData.gridSize, boardData.exitRow, JSON.stringify(boardData), minSteps]
      );
    }

    await connection.commit();
    console.log(`[ParkingRush] 预生成 ${count} 关完成`);
  } catch (error) {
    await connection.rollback();
    console.error('[ParkingRush] 预生成关卡失败:', error);
    throw error;
  } finally {
    connection.release();
  }
};

/** 获取关卡数据（预生成或实时生成）
 * @param regenerate - 是否重新生成关卡（用于重开按钮）
 */
const getLevelData = async (levelNumber: number, mode: string = 'classic', difficulty: string = '', regenerate: boolean = false): Promise<GameLevel | null> => {
  // 确定难度：如果前端传了difficulty参数，使用前端传入的；否则根据关卡编号自动确定
  const effectiveDifficulty = difficulty && ['easy', 'normal', 'medium', 'hard'].includes(difficulty)
    ? difficulty as Difficulty
    : getDifficultyByLevel(levelNumber);

  // 如果不是重新生成，先查询数据库
  if (!regenerate) {
    const [rows] = await pool.query(
      'SELECT * FROM game_levels WHERE level_number = ? AND mode = ? AND difficulty = ?',
      [levelNumber, mode, effectiveDifficulty]
    ) as any[];

    if (rows.length > 0) {
      const row = rows[0];
      return {
        id: row.id,
        level_number: row.level_number,
        mode: row.mode,
        difficulty: row.difficulty,
        grid_size: row.grid_size,
        exit_row: row.exit_row,
        board_data: typeof row.board_data === 'string' ? JSON.parse(row.board_data) : row.board_data,
        min_steps: row.min_steps,
      };
    }
  }

  // 经典模式实时生成
  const { boardData, minSteps } = generateClassicLevel(effectiveDifficulty);

  // 如果是重新生成模式（regenerate=true），不保存到数据库，直接返回生成的关卡
  // 这样每次重开都会生成不同的布局
  if (regenerate) {
    return {
      id: 0, // 临时ID
      level_number: levelNumber,
      mode: 'classic',
      difficulty: effectiveDifficulty,
      grid_size: boardData.gridSize,
      exit_row: boardData.exitRow,
      board_data: boardData,
      min_steps: minSteps,
    };
  }

  // 非重新生成模式，保存到数据库
  const [result] = await pool.query(
    `INSERT INTO game_levels (level_number, mode, difficulty, grid_size, exit_row, board_data, min_steps)
     VALUES (?, 'classic', ?, ?, ?, ?, ?)`,
    [levelNumber, effectiveDifficulty, boardData.gridSize, boardData.exitRow, JSON.stringify(boardData), minSteps]
  ) as any[];

  return {
    id: result.insertId,
    level_number: levelNumber,
    mode: 'classic',
    difficulty: effectiveDifficulty,
    grid_size: boardData.gridSize,
    exit_row: boardData.exitRow,
    board_data: boardData,
    min_steps: minSteps,
  };
};

/** 获取关卡列表（含解锁状态） */
const getLevelList = async (userId: number): Promise<any[]> => {
  const [levels] = await pool.query(
    'SELECT id, level_number, mode, difficulty, grid_size, min_steps FROM game_levels WHERE mode = ? ORDER BY level_number',
    ['classic']
  ) as any[];

  // 获取用户已通关记录
  const [records] = await pool.query(
    'SELECT level_id, stars, steps, completed_at FROM user_level_records WHERE user_id = ? AND mode = ?',
    [userId, 'classic']
  ) as any[];

  const recordMap = new Map<number, any>();
  for (const r of records) {
    recordMap.set(r.level_id, r);
  }

  // 判断解锁状态
  let lastCompletedLevel = 0;
  for (const r of records) {
    if (r.level_id > lastCompletedLevel) {
      lastCompletedLevel = r.level_id;
    }
  }

  return levels.map((level: any) => {
    const record = recordMap.get(level.id);
    const isUnlocked = level.level_number === 1 || record !== undefined ||
      level.level_number <= lastCompletedLevel + 1;
    return {
      ...level,
      unlocked: isUnlocked,
      completed: !!record,
      stars: record?.stars || 0,
      bestSteps: record?.steps || null,
      completedAt: record?.completed_at || null,
    };
  });
};

/** 提交通关结果 */
const submitResult = async (userId: number, data: SubmitResult): Promise<{
  stars: number;
  unlocked: boolean;
  nextLevel: number | null;
  evacuationUnlocked: boolean;
}> => {
  // 获取关卡数据
  const [levelRows] = await pool.query(
    'SELECT * FROM game_levels WHERE id = ?',
    [data.levelId]
  ) as any[];

  if (levelRows.length === 0) {
    throw new Error('关卡不存在');
  }

  const level = levelRows[0];
  const minSteps = level.min_steps;

  // 计算星星
  // 1星：通关即可
  // 2星：步数 <= min_steps
  // 3星：步数 <= min_steps 且未使用提示
  let stars = 1;
  if (data.steps <= minSteps) {
    stars = 2;
    if (!data.hintUsed) {
      stars = 3;
    }
  }

  // 防作弊基础校验：步数不能少于 min_steps（BFS理论最少步数）且不能为0
  if (data.steps < minSteps || data.steps <= 0) {
    stars = 1;
  }

  // 保存或更新通关记录
  await pool.query(
    `INSERT INTO user_level_records (user_id, level_id, mode, steps, stars, hint_used, time_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       steps = IF(steps > VALUES(steps), VALUES(steps), steps),
       stars = IF(stars > VALUES(stars), VALUES(stars), stars),
       hint_used = VALUES(hint_used),
       time_seconds = VALUES(time_seconds),
       completed_at = NOW()`,
    [userId, data.levelId, data.mode, data.steps, stars, data.hintUsed ? 1 : 0, data.timeSeconds]
  );

  // 更新用户 games_data
  const gamesData = {
    parkingRush: {
      currentLevel: level.level_number + 1,
      totalStars: stars,
    },
  };

  await pool.query(
    'UPDATE users SET games_data = JSON_MERGE_PATCH(COALESCE(games_data, \'{}\'), ?) WHERE id = ?',
    [JSON.stringify(gamesData), userId]
  );

  return {
    stars,
    unlocked: true,
    nextLevel: level.level_number + 1,
    evacuationUnlocked: false,
  };
};

/** 获取排行榜 */
const getLeaderboard = async (limit: number = 50): Promise<any[]> => {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.avatar,
            COUNT(DISTINCT r.level_id) as completed_levels,
            SUM(r.stars) as total_stars
     FROM users u
     JOIN user_level_records r ON u.id = r.user_id
     WHERE r.mode = 'classic'
     GROUP BY u.id
     ORDER BY total_stars DESC, completed_levels DESC
     LIMIT ?`,
    [limit]
  ) as any[];
  return rows;
};

/** 获取用户游戏进度 */
const getUserProgress = async (userId: number): Promise<any> => {
  const [userRows] = await pool.query(
    'SELECT games_data FROM users WHERE id = ?',
    [userId]
  ) as any[];

  const [records] = await pool.query(
    `SELECT r.level_id, r.stars, r.steps, r.hint_used, r.time_seconds, r.completed_at,
            l.level_number, l.difficulty, l.mode
     FROM user_level_records r
     JOIN game_levels l ON r.level_id = l.id
     WHERE r.user_id = ?
     ORDER BY l.level_number`,
    [userId]
  ) as any[];

  // 计算总星星数
  let totalStars = 0;
  for (const r of records) {
    totalStars += r.stars || 0;
  }

  // 获取用户当前关卡和难度
  const gamesData = userRows[0]?.games_data || {};
  const parkingRush = gamesData.parkingRush || {};

  return {
    gamesData: {
      ...gamesData,
      parkingRush: {
        currentLevel: parkingRush.currentLevel || 1,
        totalStars: totalStars,
        selectedDifficulty: parkingRush.selectedDifficulty || 'easy',
        coins: parkingRush.coins || 0,
      }
    },
    records,
  };
};

/** 保存用户选择的难度 */
const saveUserDifficulty = async (userId: number, difficulty: string): Promise<any> => {
  // 引入通用游戏服务获取最新数据
  const gameService = await import('./gameService');

  // 更新难度
  const updatedData = await gameService.default.updateUserGameData(userId, 'parkingRush', {
    selectedDifficulty: difficulty,
  });

  // 返回完整的用户游戏数据
  return {
    gameId: 'parkingRush',
    userId,
    ...updatedData,
  };
};

export default {
  preGenerateLevels,
  getLevelData,
  getLevelList,
  submitResult,
  getLeaderboard,
  getUserProgress,
  saveUserDifficulty,
  generateClassicLevel,
  getDifficultyByLevel,
};