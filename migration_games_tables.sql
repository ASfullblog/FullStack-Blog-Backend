-- =====================================================
-- FullStack-Blog 游戏模块数据库迁移脚本
-- MySQL 8.0+ 兼容
-- 创建时间: 2026-06-05
-- 作者: MySQL DBA
-- =====================================================

-- 设置会话参数
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET UNIQUE_CHECKS = 0;
SET AUTOCOMMIT = 0;

-- 选择数据库
USE fullstack_blog;

-- =====================================================
-- 第一部分：创建新表
-- =====================================================

-- -----------------------------------------------------
-- 1. 创建 games 游戏主信息表
-- -----------------------------------------------------
-- 功能描述：存储游戏的基本信息，包括名称、描述、图片、发布状态等
-- 页面逻辑：游戏列表页、游戏详情页的数据来源
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS games (
    -- 主键字段
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '游戏ID，主键自增',
    
    -- 基本信息字段
    name VARCHAR(100) NOT NULL COMMENT '游戏名称，用于展示',
    slug VARCHAR(100) NOT NULL COMMENT '游戏标识，用于URL和查询',
    description TEXT NULL COMMENT '游戏详细介绍，支持富文本',
    short_desc VARCHAR(500) NULL COMMENT '游戏简短描述，用于列表展示',
    
    -- 媒体字段
    image_url VARCHAR(500) NULL COMMENT '游戏封面图URL',
    banner_url VARCHAR(500) NULL COMMENT '游戏横幅图URL',
    
    -- 分类和标签字段（JSON格式，支持多值）
    tags JSON NULL COMMENT '游戏标签JSON数组，如：["益智", "休闲", "闯关"]',
    
    -- 状态字段
    is_published TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否发布: 0-未发布, 1-已发布',
    
    -- 统计字段
    view_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '浏览量，用于热门排序',
    like_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '点赞数',
    favorite_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '收藏数',
    rating_avg DECIMAL(2,1) NOT NULL DEFAULT 5.0 COMMENT '平均评分(1-5)，默认5分',
    rating_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '评分人数',
    
    -- 排序字段
    sort_order INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '排序权重，数值越大越靠前',
    
    -- 时间字段
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    published_at DATETIME NULL COMMENT '发布时间，is_published=1时更新',
    
    -- 唯一约束
    UNIQUE KEY uk_slug (slug),
    
    -- 查询索引
    INDEX idx_name (name),
    INDEX idx_is_published (is_published),
    INDEX idx_created_at (created_at),
    INDEX idx_view_count (view_count),
    INDEX idx_sort_order (sort_order),
    INDEX idx_published_at (published_at),
    
    -- 复合索引（常用查询组合）
    INDEX idx_published_sort (is_published, sort_order, created_at),
    INDEX idx_published_view (is_published, view_count DESC)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='游戏主信息表';

-- -----------------------------------------------------
-- 2. 创建 game_favorites 用户游戏收藏表
-- -----------------------------------------------------
-- 功能描述：记录用户收藏的游戏
-- 页面逻辑：用户个人中心-我的收藏、游戏详情页-收藏按钮状态
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS game_favorites (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '收藏ID，主键自增',
    user_id INT UNSIGNED NOT NULL COMMENT '用户ID，关联users表',
    game_id INT UNSIGNED NOT NULL COMMENT '游戏ID，关联games表',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '收藏时间',
    
    -- 唯一约束：一个用户只能收藏同一个游戏一次
    UNIQUE KEY uk_user_game (user_id, game_id),
    
    -- 查询索引
    INDEX idx_user_id (user_id),
    INDEX idx_game_id (game_id),
    INDEX idx_created_at (created_at),
    
    -- 复合索引
    INDEX idx_user_created (user_id, created_at DESC)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户游戏收藏表';

-- -----------------------------------------------------
-- 3. 创建 game_ratings 用户游戏评分表
-- -----------------------------------------------------
-- 功能描述：记录用户对游戏的评分和评价
-- 页面逻辑：游戏详情页-评分展示、用户个人中心-我的评价
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS game_ratings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '评分ID，主键自增',
    user_id INT UNSIGNED NOT NULL COMMENT '用户ID，关联users表',
    game_id INT UNSIGNED NOT NULL COMMENT '游戏ID，关联games表',
    rating TINYINT UNSIGNED NOT NULL COMMENT '评分(1-5星)',
    comment TEXT NULL COMMENT '评价内容',
    is_anonymous TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否匿名: 0-实名, 1-匿名',
    
    -- 时间字段
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '评分时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    -- 唯一约束：一个用户只能对同一个游戏评分一次
    UNIQUE KEY uk_user_game_rating (user_id, game_id),
    
    -- 查询索引
    INDEX idx_user_id (user_id),
    INDEX idx_game_id (game_id),
    INDEX idx_rating (rating),
    INDEX idx_created_at (created_at),
    INDEX idx_is_anonymous (is_anonymous),
    
    -- 复合索引
    INDEX idx_game_rating (game_id, rating DESC),
    INDEX idx_game_created (game_id, created_at DESC),
    
    -- 检查约束（MySQL 8.0.16+）
    CONSTRAINT chk_rating CHECK (rating BETWEEN 1 AND 5)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户游戏评分表';

-- -----------------------------------------------------
-- 4. 创建 game_tag_rel 游戏标签关联表
-- -----------------------------------------------------
-- 功能描述：游戏与标签的多对多关联关系
-- 页面逻辑：标签筛选游戏、游戏详情页-标签展示
-- 说明：复用现有tags表，通过此表建立关联
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS game_tag_rel (
    game_id INT UNSIGNED NOT NULL COMMENT '游戏ID，关联games表',
    tag_id INT UNSIGNED NOT NULL COMMENT '标签ID，关联tags表',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '关联创建时间',
    
    -- 联合主键
    PRIMARY KEY (game_id, tag_id),
    
    -- 查询索引
    INDEX idx_tag_id (tag_id),
    INDEX idx_created_at (created_at)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='游戏标签关联表';

-- -----------------------------------------------------
-- 5. 创建 game_category_rel 游戏分类关联表
-- -----------------------------------------------------
-- 功能描述：游戏与分类的多对多关联关系
-- 页面逻辑：分类筛选游戏、游戏详情页-分类展示
-- 说明：复用现有categories表，通过此表建立关联
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS game_category_rel (
    game_id INT UNSIGNED NOT NULL COMMENT '游戏ID，关联games表',
    category_id INT UNSIGNED NOT NULL COMMENT '分类ID，关联categories表',
    is_primary TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否主分类: 0-否, 1-是（一个游戏只有一个主分类）',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '关联创建时间',
    
    -- 联合主键
    PRIMARY KEY (game_id, category_id),
    
    -- 查询索引
    INDEX idx_category_id (category_id),
    INDEX idx_is_primary (is_primary),
    INDEX idx_created_at (created_at),
    
    -- 复合索引
    INDEX idx_category_primary (category_id, is_primary)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='游戏分类关联表';

-- =====================================================
-- 第二部分：修改现有表
-- =====================================================

-- -----------------------------------------------------
-- 6. 修改 game_levels 表，添加 game_id 字段
-- -----------------------------------------------------
-- 功能描述：将关卡与游戏关联起来
-- 页面逻辑：游戏详情页-关卡列表、关卡选择页
-- -----------------------------------------------------

-- 6.1 添加 game_id 字段
ALTER TABLE game_levels 
ADD COLUMN game_id INT UNSIGNED NULL COMMENT '所属游戏ID，关联games表' AFTER id;

-- 6.2 添加索引
ALTER TABLE game_levels 
ADD INDEX idx_game_id (game_id);

-- 6.3 添加复合索引（游戏ID+关卡编号，用于查询某个游戏的关卡）
ALTER TABLE game_levels 
ADD INDEX idx_game_level (game_id, level_number);

-- 6.4 添加复合索引（游戏ID+难度，用于按难度筛选）
ALTER TABLE game_levels 
ADD INDEX idx_game_difficulty (game_id, difficulty);

-- =====================================================
-- 第三部分：添加外键约束
-- =====================================================

-- -----------------------------------------------------
-- 7. 添加外键约束
-- -----------------------------------------------------
-- 注意：外键约束确保数据完整性，但会影响性能
-- 生产环境可根据实际情况选择是否启用
-- -----------------------------------------------------

-- 7.1 game_levels 表外键
ALTER TABLE game_levels 
ADD CONSTRAINT fk_level_game 
FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- 7.2 game_favorites 表外键
ALTER TABLE game_favorites 
ADD CONSTRAINT fk_favorite_user 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE game_favorites 
ADD CONSTRAINT fk_favorite_game 
FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- 7.3 game_ratings 表外键
ALTER TABLE game_ratings 
ADD CONSTRAINT fk_rating_user 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE game_ratings 
ADD CONSTRAINT fk_rating_game 
FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- 7.4 game_tag_rel 表外键
ALTER TABLE game_tag_rel 
ADD CONSTRAINT fk_gametag_game 
FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE game_tag_rel 
ADD CONSTRAINT fk_gametag_tag 
FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- 7.5 game_category_rel 表外键
ALTER TABLE game_category_rel 
ADD CONSTRAINT fk_gamecat_game 
FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE game_category_rel 
ADD CONSTRAINT fk_gamecat_category 
FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- =====================================================
-- 第四部分：初始化数据
-- =====================================================

-- -----------------------------------------------------
-- 8. 插入默认游戏数据（停车大闯关）
-- -----------------------------------------------------
-- 功能描述：为现有游戏关卡创建对应的游戏记录
-- 页面逻辑：确保现有数据与新结构兼容
-- -----------------------------------------------------

-- 8.1 插入停车游戏记录
INSERT INTO games (
    name, 
    slug, 
    description, 
    short_desc, 
    image_url, 
    banner_url,
    tags,
    is_published, 
    view_count, 
    sort_order,
    published_at
) VALUES (
    '停车大闯关',
    'parking-rush',
    '一款经典的停车闯关益智游戏。玩家需要通过移动车辆，将目标车辆开出停车场。游戏包含经典模式和疏散模式，难度从简单到困难，挑战你的逻辑思维！\n\n## 游戏特色\n\n- 经典模式：传统华容道玩法，最少步数通关\n- 疏散模式：车辆会自动移动，考验反应速度\n- 多难度等级：从简单到困难，适合各年龄段\n- 精美画面：简洁清新的游戏界面\n- 成就系统：收集星星，挑战最高分',
    '经典停车闯关益智游戏，挑战你的逻辑思维',
    'https://picsum.photos/800/600?random=game1',
    'https://picsum.photos/1920/400?random=game1',
    '["益智", "休闲", "闯关", "华容道", "停车"]',
    1,
    0,
    1,
    NOW()
);

-- 8.2 获取刚插入的游戏ID并更新现有关卡
-- 使用变量存储游戏ID
SET @parking_game_id = LAST_INSERT_ID();

-- 更新所有现有关卡，关联到停车游戏
UPDATE game_levels SET game_id = @parking_game_id WHERE game_id IS NULL;

-- 8.3 为停车游戏添加标签关联
INSERT INTO game_tag_rel (game_id, tag_id, created_at)
SELECT @parking_game_id, id, NOW() FROM tags WHERE slug IN ('frontend', 'vue');

-- 8.4 为停车游戏添加分类关联（假设分类ID为1是未分类）
INSERT INTO game_category_rel (game_id, category_id, is_primary, created_at)
VALUES (@parking_game_id, 1, 1, NOW());

-- =====================================================
-- 第五部分：创建触发器（可选）
-- =====================================================

-- -----------------------------------------------------
-- 9. 创建触发器自动更新 games 表的统计字段
-- -----------------------------------------------------
-- 功能描述：当用户收藏或评分时，自动更新游戏的统计字段
-- 页面逻辑：确保统计数据的实时性和准确性
-- -----------------------------------------------------

DELIMITER //

-- 9.1 收藏触发器：添加收藏时更新 favorite_count
CREATE TRIGGER trg_after_favorite_insert 
AFTER INSERT ON game_favorites
FOR EACH ROW
BEGIN
    UPDATE games 
    SET favorite_count = favorite_count + 1
    WHERE id = NEW.game_id;
END//

-- 9.2 收藏触发器：取消收藏时更新 favorite_count
CREATE TRIGGER trg_after_favorite_delete 
AFTER DELETE ON game_favorites
FOR EACH ROW
BEGIN
    UPDATE games 
    SET favorite_count = favorite_count - 1
    WHERE id = OLD.game_id;
END//

-- 9.3 评分触发器：添加评分时更新 rating_avg 和 rating_count
CREATE TRIGGER trg_after_rating_insert 
AFTER INSERT ON game_ratings
FOR EACH ROW
BEGIN
    UPDATE games 
    SET 
        rating_count = rating_count + 1,
        rating_avg = (rating_avg * rating_count + NEW.rating) / (rating_count + 1)
    WHERE id = NEW.game_id;
END//

-- 9.4 评分触发器：更新评分时更新 rating_avg
CREATE TRIGGER trg_after_rating_update 
AFTER UPDATE ON game_ratings
FOR EACH ROW
BEGIN
    IF OLD.rating != NEW.rating THEN
        UPDATE games 
        SET rating_avg = (rating_avg * rating_count - OLD.rating + NEW.rating) / rating_count
        WHERE id = NEW.game_id;
    END IF;
END//

-- 9.5 评分触发器：删除评分时更新 rating_avg 和 rating_count
CREATE TRIGGER trg_after_rating_delete 
AFTER DELETE ON game_ratings
FOR EACH ROW
BEGIN
    UPDATE games 
    SET 
        rating_count = rating_count - 1,
        rating_avg = CASE 
            WHEN rating_count <= 1 THEN 5.0
            ELSE (rating_avg * rating_count - OLD.rating) / (rating_count - 1)
        END
    WHERE id = OLD.game_id;
END//

DELIMITER ;

-- =====================================================
-- 第六部分：验证和清理
-- =====================================================

-- 恢复会话参数
SET FOREIGN_KEY_CHECKS = 1;
SET UNIQUE_CHECKS = 1;
COMMIT;

-- 验证表创建结果
SELECT 
    'games' as table_name, 
    COUNT(*) as record_count 
FROM games
UNION ALL
SELECT 
    'game_favorites', 
    COUNT(*) 
FROM game_favorites
UNION ALL
SELECT 
    'game_ratings', 
    COUNT(*) 
FROM game_ratings
UNION ALL
SELECT 
    'game_tag_rel', 
    COUNT(*) 
FROM game_tag_rel
UNION ALL
SELECT 
    'game_category_rel', 
    COUNT(*) 
FROM game_category_rel;

-- 验证 game_levels 更新结果
SELECT 
    'game_levels with game_id' as check_item,
    COUNT(*) as count
FROM game_levels 
WHERE game_id IS NOT NULL;
