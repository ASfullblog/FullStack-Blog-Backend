import pool from '../config/database';

type Difficulty = 'easy' | 'normal' | 'medium' | 'hard';
type LinkMatchMode = 'time' | 'moves';

interface LinkMatchCellConfig {
  icon: string;
  type: number;
  layer: number;
  row: number;
  col: number;
}

interface LinkMatchLevelConfig {
  gameId: 'linkMatch';
  levelNumber: number;
  mode: LinkMatchMode;
  difficulty: Difficulty;
  rows: number;
  cols: number;
  types: number;
  layers: number;
  time: number;
  moves: number;
  cells: Array<LinkMatchCellConfig | null>;
}

const TILE_ICONS = [
  '🍕', '🍔', '🍟', '🌭', '🍿', '🥓', '🥞', '🧇',
  '🍖', '🍗', '🥩', '🍤', '🍣', '🍱', '🍜', '🍙',
  '🍎', '🍐', '🍊', '🍋', '🍉', '🍇', '🍓', '🫐',
  '🍒', '🥝', '🥑', '🍍', '🥥', '🥕', '🌽', '🥔'
];

const DIFFICULTY_CONFIG: Record<Difficulty, {
  rows: number;
  cols: number;
  types: number;
  layers: number;
  time: number;
  moves: number;
}> = {
  easy: { rows: 6, cols: 6, types: 6, layers: 1, time: 120, moves: 50 },
  normal: { rows: 7, cols: 8, types: 8, layers: 2, time: 180, moves: 70 },
  medium: { rows: 8, cols: 9, types: 10, layers: 3, time: 240, moves: 90 },
  hard: { rows: 9, cols: 10, types: 12, layers: 4, time: 300, moves: 120 }
};

const DIFFICULTY_CYCLE: Difficulty[] = ['easy', 'easy', 'easy', 'hard', 'medium', 'hard', 'normal'];

const pickDifficultyForLevel = (levelNumber: number): Difficulty => {
  const index = (levelNumber - 1) % DIFFICULTY_CYCLE.length;
  return DIFFICULTY_CYCLE[index];
};

const buildAdjacentPairs = (rows: number, cols: number): Array<[number, number]> => {
  const used = new Set<number>();
  const pairs: Array<[number, number]> = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      if (used.has(index)) {
        continue;
      }

      let partner = -1;
      if (col + 1 < cols) {
        const right = row * cols + col + 1;
        if (!used.has(right)) {
          partner = right;
        }
      }

      if (partner === -1 && row + 1 < rows) {
        const down = (row + 1) * cols + col;
        if (!used.has(down)) {
          partner = down;
        }
      }

      if (partner === -1) {
        throw new Error(`Unable to pair link-match cell at row=${row}, col=${col}`);
      }

      used.add(index);
      used.add(partner);
      pairs.push([index, partner]);
    }
  }

  return pairs;
};

const buildLinkMatchLevelConfig = (
  levelNumber: number,
  difficulty: Difficulty,
  mode: LinkMatchMode
): LinkMatchLevelConfig => {
  const config = DIFFICULTY_CONFIG[difficulty];
  const totalCells = config.rows * config.cols;
  const pairPositions = buildAdjacentPairs(config.rows, config.cols);
  const totalPairs = pairPositions.length;
  const cells: Array<LinkMatchCellConfig | null> = new Array(totalCells).fill(null);
  const basePairsPerLayer = Math.floor(totalPairs / config.layers);
  let remainingPairs = totalPairs;
  let pairCursor = 0;

  for (let layer = 1; layer <= config.layers; layer += 1) {
    const layersLeft = config.layers - layer + 1;
    const pairCount = layer === config.layers
      ? remainingPairs
      : Math.max(basePairsPerLayer, remainingPairs - basePairsPerLayer * (layersLeft - 1));

    for (let i = 0; i < pairCount; i += 1) {
      const [first, second] = pairPositions[pairCursor];
      const iconIndex = (pairCursor + levelNumber + layer + (mode === 'moves' ? 3 : 0)) % config.types;
      const icon = TILE_ICONS[iconIndex];
      const type = TILE_ICONS.indexOf(icon);

      [first, second].forEach((position) => {
        const row = Math.floor(position / config.cols);
        const col = position % config.cols;
        cells[position] = {
          icon,
          type,
          layer,
          row,
          col
        };
      });

      pairCursor += 1;
      remainingPairs -= 1;
    }
  }

  return {
    gameId: 'linkMatch',
    levelNumber,
    mode,
    difficulty,
    rows: config.rows,
    cols: config.cols,
    types: config.types,
    layers: config.layers,
    time: config.time,
    moves: config.moves,
    cells
  };
};

const ensureTable = async (): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_stage_configs (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      game_slug VARCHAR(100) NOT NULL,
      level_number INT UNSIGNED NOT NULL,
      difficulty VARCHAR(32) NOT NULL,
      mode VARCHAR(32) NOT NULL,
      config_data JSON NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_game_level_difficulty_mode (game_slug, level_number, difficulty, mode),
      KEY idx_game_slug (game_slug),
      KEY idx_game_active (game_slug, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

const getLinkMatchLevelConfig = async (
  levelNumber: number,
  difficulty?: string,
  mode: string = 'time',
  regenerate: boolean = false
): Promise<LinkMatchLevelConfig> => {
  const resolvedDifficulty = (difficulty as Difficulty) || pickDifficultyForLevel(levelNumber);
  const resolvedMode = mode === 'moves' ? 'moves' : 'time';

  await ensureTable();

  if (!regenerate) {
    const [rows] = await pool.query(
      `SELECT config_data
       FROM game_stage_configs
       WHERE game_slug = ? AND level_number = ? AND difficulty = ? AND mode = ? AND is_active = 1
       LIMIT 1`,
      ['link-match', levelNumber, resolvedDifficulty, resolvedMode]
    ) as any[];

    const cachedConfig = rows[0]?.config_data;
    if (cachedConfig) {
      return typeof cachedConfig === 'string' ? JSON.parse(cachedConfig) : cachedConfig;
    }
  }

  const generatedConfig = buildLinkMatchLevelConfig(levelNumber, resolvedDifficulty, resolvedMode);

  await pool.query(
    `INSERT INTO game_stage_configs (game_slug, level_number, difficulty, mode, config_data, is_active)
     VALUES (?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE config_data = VALUES(config_data), is_active = 1`,
    ['link-match', levelNumber, resolvedDifficulty, resolvedMode, JSON.stringify(generatedConfig)]
  );

  return generatedConfig;
};

export default {
  getLinkMatchLevelConfig
};
