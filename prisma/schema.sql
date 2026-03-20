-- FullStack-Blog Database Schema
-- MySQL 8.0+

-- 创建数据库
CREATE DATABASE IF NOT EXISTS fullstack_blog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fullstack_blog;

-- ================================
-- 用户表
-- ================================
CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名',
    password_hash VARCHAR(255) NOT NULL COMMENT '密码哈希',
    role VARCHAR(20) NOT NULL DEFAULT 'user' COMMENT '角色: admin, user',
    avatar VARCHAR(255) NULL COMMENT '头像URL',
    email VARCHAR(100) NULL COMMENT '邮箱',
    bio TEXT NULL COMMENT '个人简介',
    github_url VARCHAR(255) NULL COMMENT 'GitHub链接',
    qq_number VARCHAR(20) NULL COMMENT 'QQ号',
    tech_stack JSON NULL COMMENT '技术栈JSON数组',
    visited_provinces JSON NULL COMMENT '去过的省市JSON数组',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_username (username),
    INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- ================================
-- 分类表
-- ================================
CREATE TABLE IF NOT EXISTS categories (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL COMMENT '分类名称',
    slug VARCHAR(100) NOT NULL UNIQUE COMMENT '分类slug',
    parent_id INT UNSIGNED NULL COMMENT '父分类ID',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_slug (slug),
    INDEX idx_parent_id (parent_id),
    CONSTRAINT fk_category_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='分类表';

-- ================================
-- 标签表
-- ================================
CREATE TABLE IF NOT EXISTS tags (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL COMMENT '标签名称',
    slug VARCHAR(100) NOT NULL UNIQUE COMMENT '标签slug',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='标签表';

-- ================================
-- 文章表
-- ================================
CREATE TABLE IF NOT EXISTS posts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL COMMENT '文章标题',
    slug VARCHAR(200) NOT NULL UNIQUE COMMENT '文章slug',
    content TEXT NOT NULL COMMENT '文章内容(Markdown)',
    excerpt VARCHAR(500) NULL COMMENT '文章摘要',
    cover_image VARCHAR(255) NULL COMMENT '封面图片URL',
    author_id INT UNSIGNED NOT NULL COMMENT '作者ID',
    category_id INT UNSIGNED NOT NULL COMMENT '分类ID',
    status VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT '状态: draft, published',
    view_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '浏览量',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_slug (slug),
    INDEX idx_author_id (author_id),
    INDEX idx_category_id (category_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    CONSTRAINT fk_post_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_post_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文章表';

-- ================================
-- 评论表
-- ================================
CREATE TABLE IF NOT EXISTS comments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    post_id INT UNSIGNED NOT NULL COMMENT '文章ID',
    user_id INT UNSIGNED NOT NULL COMMENT '用户ID',
    content TEXT NOT NULL COMMENT '评论内容',
    parent_id INT UNSIGNED NULL COMMENT '父评论ID',
    status VARCHAR(20) NOT NULL DEFAULT 'approved' COMMENT '状态: approved, pending, spam',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_post_id (post_id),
    INDEX idx_user_id (user_id),
    INDEX idx_parent_id (parent_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    CONSTRAINT fk_comment_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    CONSTRAINT fk_comment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_comment_parent FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='评论表';

-- ================================
-- 文章标签关联表
-- ================================
CREATE TABLE IF NOT EXISTS post_tags (
    post_id INT UNSIGNED NOT NULL COMMENT '文章ID',
    tag_id INT UNSIGNED NOT NULL COMMENT '标签ID',
    PRIMARY KEY (post_id, tag_id),
    INDEX idx_post_id (post_id),
    INDEX idx_tag_id (tag_id),
    CONSTRAINT fk_post_tags_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    CONSTRAINT fk_post_tags_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文章标签关联表';

-- ================================
-- 系统配置表
-- ================================
CREATE TABLE IF NOT EXISTS sys_config (
    config_key VARCHAR(100) PRIMARY KEY,
    config_value TEXT NULL COMMENT '配置值',
    config_description VARCHAR(255) NULL COMMENT '配置描述',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_config_key (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置表';

-- ================================
-- 种子数据
-- ================================

-- 插入默认管理员用户）
INSERT INTO users (username, password_hash, role, avatar, email, bio, github_url, qq_number, tech_stack, visited_provinces) VALUES
('admin', '$2a$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'admin', NULL, 'admin@example.com', 
'热爱技术，喜欢分享。专注于全栈开发，尤其擅长 Vue.js 和 Node.js 技术栈。', 
'https://github.com/asfre', 
'414898182',
'["Vue.js", "Node.js", "TypeScript", "MySQL", "Tailwind CSS", "Element Plus"]',
'["北京市", "上海市", "广东省-广州市", "浙江省-杭州市", "江苏省-南京市", "四川省-成都市"]'
);

-- 插入默认分类
INSERT INTO categories (name, slug, parent_id) VALUES
('未分类', 'uncategorized', NULL),
('技术', 'technology', NULL),
('生活', 'life', NULL),
('学习', 'study', NULL);

-- 插入默认标签
INSERT INTO tags (name, slug) VALUES
('前端', 'frontend'),
('后端', 'backend'),
('数据库', 'database'),
('Vue', 'vue'),
('Node.js', 'nodejs');

-- 插入系统配置
INSERT INTO sys_config (config_key, config_value, config_description) VALUES
('site_title', 'FullStack-Blog', '网站标题'),
('site_description', '基于 Vue 3 + Node.js + MySQL 的全栈博客系统', '网站描述'),
('site_copyright', '© 2026 FullStack-Blog. All rights reserved.', '网站版权'),
('comment_approval', 'true', '评论是否需要审核'),
('posts_per_page', '10', '每页显示文章数量');

-- 插入示例文章
INSERT INTO posts (title, slug, content, excerpt, cover_image, author_id, category_id, status, view_count) VALUES
('欢迎使用 FullStack-Blog', 'welcome-to-fullstack-blog', 
'# 欢迎使用 FullStack-Blog\n\n这是一个基于 Vue 3 + Node.js + MySQL 的全栈博客系统。\n\n## 功能特点\n\n- 前后端分离架构\n- 支持文章分类和标签\n- 支持评论系统\n- 管理后台\n- 响应式设计\n\n## 开始使用\n\n1. 登录管理后台\n2. 创建分类和标签\n3. 发布你的第一篇文章\n\n祝使用愉快！',
'欢迎使用 FullStack-Blog，这是一个基于 Vue 3 + Node.js + MySQL 的全栈博客系统。',
'https://picsum.photos/1200/600?random=1',
1, 2, 'published', 100);

-- 为示例文章添加标签
INSERT INTO post_tags (post_id, tag_id) VALUES (1, 1), (1, 4);
