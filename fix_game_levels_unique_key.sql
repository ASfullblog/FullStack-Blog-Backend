-- ================================
-- 修复 game_levels 表唯一键问题
-- 支持同一关卡不同难度
-- ================================

-- 1. 删除旧唯一键（如果存在）
ALTER TABLE game_levels DROP INDEX IF EXISTS uk_level_mode;

-- 2. 添加新唯一键（包含难度）
ALTER TABLE game_levels ADD UNIQUE KEY uk_level_mode_difficulty (level_number, mode, difficulty);

-- 3. 查看表结构确认修改
DESCRIBE game_levels;
SHOW INDEX FROM game_levels;
