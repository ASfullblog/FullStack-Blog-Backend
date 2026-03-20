-- 修改cover_image字段类型为TEXT，以支持Base64图片数据
ALTER TABLE fullstack_blog.posts MODIFY cover_image TEXT NULL COMMENT '封面图片URL或Base64数据';
