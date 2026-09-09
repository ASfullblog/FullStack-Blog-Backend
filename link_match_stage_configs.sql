CREATE TABLE IF NOT EXISTS game_stage_configs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    game_slug VARCHAR(100) NOT NULL COMMENT '游戏标识，例如 link-match',
    level_number INT UNSIGNED NOT NULL COMMENT '关卡号',
    difficulty VARCHAR(32) NOT NULL COMMENT '难度',
    mode VARCHAR(32) NOT NULL COMMENT '模式',
    config_data JSON NOT NULL COMMENT '关卡配置 JSON',
    is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_game_level_difficulty_mode (game_slug, level_number, difficulty, mode),
    KEY idx_game_slug (game_slug),
    KEY idx_game_active (game_slug, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
