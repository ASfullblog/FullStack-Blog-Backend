SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET UNIQUE_CHECKS = 0;
SET AUTOCOMMIT = 0;

USE fullstack_blog;

CREATE TABLE IF NOT EXISTS games (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT NULL,
    short_desc VARCHAR(500) NULL,
    image_url VARCHAR(500) NULL,
    banner_url VARCHAR(500) NULL,
    tags JSON NULL,
    is_published TINYINT(1) NOT NULL DEFAULT 0,
    view_count INT UNSIGNED NOT NULL DEFAULT 0,
    like_count INT UNSIGNED NOT NULL DEFAULT 0,
    favorite_count INT UNSIGNED NOT NULL DEFAULT 0,
    rating_avg DECIMAL(2,1) NOT NULL DEFAULT 5.0,
    rating_count INT UNSIGNED NOT NULL DEFAULT 0,
    sort_order INT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    published_at DATETIME NULL,
    UNIQUE KEY uk_slug (slug),
    INDEX idx_name (name),
    INDEX idx_is_published (is_published),
    INDEX idx_created_at (created_at),
    INDEX idx_view_count (view_count),
    INDEX idx_sort_order (sort_order),
    INDEX idx_published_at (published_at),
    INDEX idx_published_sort (is_published, sort_order, created_at),
    INDEX idx_published_view (is_published, view_count DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_favorites (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    game_id INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_game (user_id, game_id),
    INDEX idx_user_id (user_id),
    INDEX idx_game_id (game_id),
    INDEX idx_created_at (created_at),
    INDEX idx_user_created (user_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_ratings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    game_id INT UNSIGNED NOT NULL,
    rating TINYINT UNSIGNED NOT NULL,
    comment TEXT NULL,
    is_anonymous TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_game_rating (user_id, game_id),
    INDEX idx_user_id (user_id),
    INDEX idx_game_id (game_id),
    INDEX idx_rating (rating),
    INDEX idx_created_at (created_at),
    INDEX idx_is_anonymous (is_anonymous),
    INDEX idx_game_rating (game_id, rating DESC),
    INDEX idx_game_created (game_id, created_at DESC),
    CONSTRAINT chk_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_tag_rel (
    game_id INT UNSIGNED NOT NULL,
    tag_id INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (game_id, tag_id),
    INDEX idx_tag_id (tag_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_category_rel (
    game_id INT UNSIGNED NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    is_primary TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (game_id, category_id),
    INDEX idx_category_id (category_id),
    INDEX idx_is_primary (is_primary),
    INDEX idx_created_at (created_at),
    INDEX idx_category_primary (category_id, is_primary)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE game_levels 
ADD COLUMN game_id INT UNSIGNED NULL AFTER id;

ALTER TABLE game_levels 
ADD INDEX idx_game_id (game_id);

ALTER TABLE game_levels 
ADD INDEX idx_game_level (game_id, level_number);

ALTER TABLE game_levels 
ADD INDEX idx_game_difficulty (game_id, difficulty);

ALTER TABLE game_levels 
ADD CONSTRAINT fk_level_game 
FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE game_favorites 
ADD CONSTRAINT fk_favorite_user 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE game_favorites 
ADD CONSTRAINT fk_favorite_game 
FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE game_ratings 
ADD CONSTRAINT fk_rating_user 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE game_ratings 
ADD CONSTRAINT fk_rating_game 
FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE game_tag_rel 
ADD CONSTRAINT fk_gametag_game 
FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE game_tag_rel 
ADD CONSTRAINT fk_gametag_tag 
FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE game_category_rel 
ADD CONSTRAINT fk_gamecat_game 
FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE game_category_rel 
ADD CONSTRAINT fk_gamecat_category 
FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE ON UPDATE CASCADE;

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
    'Parking Rush',
    'parking-rush',
    'A classic parking puzzle game. Move vehicles to clear the path and get the target car out!',
    'Classic parking puzzle game',
    'https://picsum.photos/800/600?random=game1',
    'https://picsum.photos/1920/400?random=game1',
    '["Puzzle", "Casual", "Logic"]',
    1,
    0,
    1,
    NOW()
);

SET @parking_game_id = LAST_INSERT_ID();

UPDATE game_levels SET game_id = @parking_game_id WHERE game_id IS NULL;

INSERT INTO game_tag_rel (game_id, tag_id, created_at)
SELECT @parking_game_id, id, NOW() FROM tags WHERE slug IN ('frontend', 'vue');

INSERT INTO game_category_rel (game_id, category_id, is_primary, created_at)
VALUES (@parking_game_id, 1, 1, NOW());

DELIMITER //

CREATE TRIGGER trg_after_favorite_insert 
AFTER INSERT ON game_favorites
FOR EACH ROW
BEGIN
    UPDATE games 
    SET favorite_count = favorite_count + 1
    WHERE id = NEW.game_id;
END//

CREATE TRIGGER trg_after_favorite_delete 
AFTER DELETE ON game_favorites
FOR EACH ROW
BEGIN
    UPDATE games 
    SET favorite_count = favorite_count - 1
    WHERE id = OLD.game_id;
END//

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

SET FOREIGN_KEY_CHECKS = 1;
SET UNIQUE_CHECKS = 1;
COMMIT;

SELECT 'Migration completed successfully!' as status;
