-- =====================================================
-- FullStack-Blog 游戏模块数据库迁移回滚脚本
-- MySQL 8.0+ 兼容
-- 创建时间: 2026-06-05
-- 警告：此脚本将删除所有游戏相关表和数据！
-- =====================================================

-- 设置会话参数
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET AUTOCOMMIT = 0;

-- 选择数据库
USE fullstack_blog;

-- =====================================================
-- 回滚步骤（按依赖关系逆序删除）
-- =====================================================

-- -----------------------------------------------------
-- 步骤1：删除触发器
-- -----------------------------------------------------
-- 功能描述：删除自动更新统计字段的触发器
-- -----------------------------------------------------
DROP TRIGGER IF EXISTS trg_after_favorite_insert;
DROP TRIGGER IF EXISTS trg_after_favorite_delete;
DROP TRIGGER IF EXISTS trg_after_rating_insert;
DROP TRIGGER IF EXISTS trg_after_rating_update;
DROP TRIGGER IF EXISTS trg_after_rating_delete;

SELECT '步骤1：触发器已删除' as rollback_step;

-- -----------------------------------------------------
-- 步骤2：删除外键约束
-- -----------------------------------------------------
-- 功能描述：删除所有表的外键约束
-- -----------------------------------------------------

-- 2.1 删除 game_levels 表的外键
ALTER TABLE game_levels DROP FOREIGN KEY IF EXISTS fk_level_game;

-- 2.2 删除 game_favorites 表的外键
ALTER TABLE game_favorites DROP FOREIGN KEY IF EXISTS fk_favorite_user;
ALTER TABLE game_favorites DROP FOREIGN KEY IF EXISTS fk_favorite_game;

-- 2.3 删除 game_ratings 表的外键
ALTER TABLE game_ratings DROP FOREIGN KEY IF EXISTS fk_rating_user;
ALTER TABLE game_ratings DROP FOREIGN KEY IF EXISTS fk_rating_game;

-- 2.4 删除 game_tag_rel 表的外键
ALTER TABLE game_tag_rel DROP FOREIGN KEY IF EXISTS fk_gametag_game;
ALTER TABLE game_tag_rel DROP FOREIGN KEY IF EXISTS fk_gametag_tag;

-- 2.5 删除 game_category_rel 表的外键
ALTER TABLE game_category_rel DROP FOREIGN KEY IF EXISTS fk_gamecat_game;
ALTER TABLE game_category_rel DROP FOREIGN KEY IF EXISTS fk_gamecat_category;

SELECT '步骤2：外键约束已删除' as rollback_step;

-- -----------------------------------------------------
-- 步骤3：删除索引
-- -----------------------------------------------------
-- 功能描述：删除新增的索引（保留主键和原有索引）
-- -----------------------------------------------------

-- 3.1 删除 game_levels 表新增索引
ALTER TABLE game_levels DROP INDEX IF EXISTS idx_game_id;
ALTER TABLE game_levels DROP INDEX IF EXISTS idx_game_level;
ALTER TABLE game_levels DROP INDEX IF EXISTS idx_game_difficulty;

SELECT '步骤3：索引已删除' as rollback_step;

-- -----------------------------------------------------
-- 步骤4：删除字段
-- -----------------------------------------------------
-- 功能描述：删除 game_levels 表的 game_id 字段
-- 警告：此操作将丢失游戏与关卡的关联关系
-- -----------------------------------------------------

-- 4.1 备份关联关系到临时表（可选，用于数据恢复）
CREATE TABLE IF NOT EXISTS _backup_game_level_rel AS
SELECT id, game_id 
FROM game_levels 
WHERE game_id IS NOT NULL;

-- 4.2 删除 game_id 字段
ALTER TABLE game_levels DROP COLUMN IF EXISTS game_id;

SELECT '步骤4：game_id 字段已删除' as rollback_step;

-- -----------------------------------------------------
-- 步骤5：删除关联表
-- -----------------------------------------------------
-- 功能描述：删除游戏关联表
-- 警告：此操作将永久删除收藏、评分、标签关联、分类关联数据！
-- -----------------------------------------------------

-- 5.1 删除 game_category_rel 表
DROP TABLE IF EXISTS game_category_rel;

-- 5.2 删除 game_tag_rel 表
DROP TABLE IF EXISTS game_tag_rel;

-- 5.3 删除 game_ratings 表
DROP TABLE IF EXISTS game_ratings;

-- 5.4 删除 game_favorites 表
DROP TABLE IF EXISTS game_favorites;

SELECT '步骤5：关联表已删除' as rollback_step;

-- -----------------------------------------------------
-- 步骤6：删除 games 主表
-- -----------------------------------------------------
-- 功能描述：删除游戏主信息表
-- 警告：此操作将永久删除所有游戏数据！
-- -----------------------------------------------------

-- 6.1 备份 games 表数据（可选）
CREATE TABLE IF NOT EXISTS _backup_games AS
SELECT * FROM games;

-- 6.2 删除 games 表
DROP TABLE IF EXISTS games;

SELECT '步骤6：games 主表已删除' as rollback_step;

-- -----------------------------------------------------
-- 步骤7：清理临时备份表
-- -----------------------------------------------------
-- 说明：如果确认不需要恢复数据，可以删除备份表
-- 建议保留备份表一段时间，确认无误后再删除
-- -----------------------------------------------------

-- 7.1 删除备份表（取消注释以执行）
-- DROP TABLE IF EXISTS _backup_games;
-- DROP TABLE IF EXISTS _backup_game_level_rel;

SELECT '步骤7：回滚完成' as rollback_step;

-- =====================================================
-- 验证回滚结果
-- =====================================================

-- 恢复会话参数
SET FOREIGN_KEY_CHECKS = 1;
COMMIT;

-- 验证表是否已删除
SELECT 
    table_name,
    CASE 
        WHEN table_name IS NULL THEN '已删除'
        ELSE '仍存在'
    END as status
FROM information_schema.tables 
WHERE table_schema = 'fullstack_blog' 
AND table_name IN ('games', 'game_favorites', 'game_ratings', 'game_tag_rel', 'game_category_rel');

-- 验证 game_levels 表结构
SELECT 
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_schema = 'fullstack_blog' 
AND table_name = 'game_levels'
AND column_name = 'game_id';

-- =====================================================
-- 回滚完成
-- =====================================================
-- 注意：
-- 1. 备份表 _backup_games 和 _backup_game_level_rel 已创建
-- 2. 如需恢复数据，请使用备份表或联系DBA
-- 3. 确认无误后，可手动删除备份表
-- =====================================================
