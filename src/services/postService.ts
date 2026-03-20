import pool from '../config/database';

export class PostService {
  public pool = pool;
  async getPosts(params: any): Promise<any> {
    const { page = 1, limit = 10, categoryId, tagId, keyword, status, sortBy = 'created_at', order = 'desc' } = params;
    const offset = (page - 1) * limit;
    
    // 验证排序字段和顺序
    const allowedSortFields = ['created_at', 'view_count', 'updated_at'];
    const allowedOrders = ['asc', 'desc'];
    const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const finalOrder = allowedOrders.includes(order.toLowerCase()) ? order.toLowerCase() : 'desc';

    let query = `
      SELECT 
        p.*,
        u.username as author_username,
        u.avatar as author_avatar,
        u.role as author_role,
        c.name as category_name,
        c.slug as category_slug
      FROM posts p
      LEFT JOIN users u ON p.author_id = u.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    
    let queryParams: any[] = [];

    // 状态筛选
    if (status) {
      query += ' AND p.status = ?';
      queryParams.push(status);
    }

    if (categoryId) {
      query += ' AND p.category_id = ?';
      queryParams.push(categoryId);
    }

    if (tagId) {
      query += ' AND p.id IN (SELECT post_id FROM post_tags WHERE tag_id = ?)';
      queryParams.push(tagId);
    }

    // 关键词搜索（标题和内容）
    if (keyword) {
      query += ' AND (p.title LIKE ? OR p.content LIKE ?)';
      queryParams.push(`%${keyword}%`, `%${keyword}%`);
    }

    query += ` ORDER BY p.${finalSortBy} ${finalOrder.toUpperCase()} LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    const [posts] = await pool.query(query, queryParams) as any[];

    // 获取总数
    let countQuery = 'SELECT COUNT(*) as total FROM posts p WHERE 1=1';
    let countParams: any[] = [];

    // 状态筛选
    if (status) {
      countQuery += ' AND p.status = ?';
      countParams.push(status);
    }

    if (categoryId) {
      countQuery += ' AND p.category_id = ?';
      countParams.push(categoryId);
    }

    if (tagId) {
      countQuery += ' AND p.id IN (SELECT post_id FROM post_tags WHERE tag_id = ?)';
      countParams.push(tagId);
    }

    // 关键词搜索
    if (keyword) {
      countQuery += ' AND (p.title LIKE ? OR p.content LIKE ?)';
      countParams.push(`%${keyword}%`, `%${keyword}%`);
    }

    const [countResult] = await pool.query(countQuery, countParams) as any[];
    const total = countResult[0].total;

    // 格式化文章数据
    const formattedPosts = await Promise.all(posts.map(async (post: any) => {
      // 获取文章标签
      const [tagsResult] = await pool.query(
        `SELECT t.id, t.name, t.slug FROM tags t 
         JOIN post_tags pt ON t.id = pt.tag_id 
         WHERE pt.post_id = ?`,
        [post.id]
      ) as any[];
      
      const tags = tagsResult.map((tag: any) => ({
        id: tag.id,
        name: tag.name,
        slug: tag.slug
      }));
      
      return {
        id: post.id,
        title: post.title,
        slug: post.slug,
        content: post.content,
        excerpt: post.excerpt,
        coverImage: post.cover_image,
        categoryId: post.category_id,
        authorId: post.author_id,
        status: post.status,
        viewCount: post.view_count,
        createdAt: post.created_at,
        updatedAt: post.updated_at,
        author: {
          id: post.author_id,
          username: post.author_username,
          email: '',
          name: post.author_username,
          avatar: post.author_avatar,
          role: post.author_role
        },
        category: {
          id: post.category_id,
          name: post.category_name,
          slug: post.category_slug
        },
        tags
      };
    }));

    return {
      posts: formattedPosts,
      total,
      page,
      limit
    };
  }

  async getPostBySlug(slug: string): Promise<any> {
    const query = `
      SELECT 
        p.*,
        u.username as author_username,
        u.avatar as author_avatar,
        u.role as author_role,
        c.name as category_name,
        c.slug as category_slug
      FROM posts p
      LEFT JOIN users u ON p.author_id = u.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.slug = ? AND p.status = 'published'
    `;

    const [posts] = await pool.query(query, [slug]) as any[];

    if (posts.length === 0) {
      return null;
    }

    const post = posts[0];

    // 增加浏览量
    await pool.query('UPDATE posts SET view_count = view_count + 1 WHERE id = ?', [post.id]);

    // 获取文章标签
    const [tagsResult] = await pool.query(
      `SELECT t.id, t.name, t.slug FROM tags t 
       JOIN post_tags pt ON t.id = pt.tag_id 
       WHERE pt.post_id = ?`,
      [post.id]
    ) as any[];
    
    const tags = tagsResult.map((tag: any) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug
    }));
    
    // 格式化文章数据
    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      content: post.content,
      excerpt: post.excerpt,
      coverImage: post.cover_image,
      categoryId: post.category_id,
      authorId: post.author_id,
      status: post.status,
      viewCount: post.view_count,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
      author: {
        id: post.author_id,
        username: post.author_username,
        email: '',
        name: post.author_username,
        avatar: post.author_avatar,
        role: post.author_role
      },
      category: {
        id: post.category_id,
        name: post.category_name,
        slug: post.category_slug
      },
      tags,
      comments: []
    };
  }

  async createPost(params: any): Promise<any> {
    const { title, slug, content, excerpt, coverImage, categoryId, authorId, status = 'draft', tags } = params;

    // 生成slug：分类slug-序号（如 tech-001, life-002）
    let finalSlug = slug;
    if (!slug) {
      // 获取分类slug
      const [categories] = await pool.query('SELECT slug FROM categories WHERE id = ?', [categoryId]) as any[];
      const categorySlug = categories.length > 0 ? categories[0].slug : 'uncategorized';
      
      // 获取该分类下已有文章数量
      const [countResult] = await pool.query('SELECT COUNT(*) as count FROM posts WHERE category_id = ?', [categoryId]) as any[];
      const count = countResult[0].count + 1;
      
      // 生成序号（3位数字，不足补0）
      const sequence = String(count).padStart(3, '0');
      finalSlug = `${categorySlug}-${sequence}`;
    }

    const query = `
      INSERT INTO posts (title, slug, content, excerpt, cover_image, author_id, category_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(query, [
      title,
      finalSlug,
      content,
      excerpt || content.substring(0, 200),
      coverImage,
      authorId,
      categoryId,
      status
    ]) as any[];

    const postId = result.insertId;

    // 添加标签关联
    if (tags && tags.length > 0) {
      const tagValues = tags.map((tagId: number) => [postId, tagId]);
      await pool.query(
        'INSERT INTO post_tags (post_id, tag_id) VALUES ' + tags.map(() => '(?, ?)').join(', '),
        tagValues.flat()
      );
    }

    // 获取创建的文章
    return this.getPostById(postId);
  }

  async updatePost(params: any): Promise<any> {
    const { id, title, slug, content, excerpt, coverImage, categoryId, status, tags } = params;

    // 检查文章是否存在
    const [existingPosts] = await pool.query('SELECT * FROM posts WHERE id = ?', [id]) as any[];
    if (existingPosts.length === 0) {
      return null;
    }

    // 处理slug逻辑：优先使用传入的slug，如果为空则使用原slug
    let newSlug = slug;
    if (!newSlug || newSlug === '') {
      newSlug = existingPosts[0].slug;
    }

    // 更新文章
    const query = `
      UPDATE posts 
      SET title = ?, slug = ?, content = ?, excerpt = ?, cover_image = ?, category_id = ?, status = ?
      WHERE id = ?
    `;

    await pool.query(query, [
      title || existingPosts[0].title,
      newSlug || existingPosts[0].slug,
      content || existingPosts[0].content,
      excerpt || (content ? content.substring(0, 200) : existingPosts[0].excerpt),
      coverImage !== undefined ? coverImage : existingPosts[0].cover_image,
      categoryId || existingPosts[0].category_id,
      status || existingPosts[0].status,
      id
    ]);

    // 更新标签关联
    if (tags) {
      await pool.query('DELETE FROM post_tags WHERE post_id = ?', [id]);
      if (tags.length > 0) {
        const tagValues = tags.map((tagId: number) => [id, tagId]);
        await pool.query(
          'INSERT INTO post_tags (post_id, tag_id) VALUES ' + tags.map(() => '(?, ?)').join(', '),
          tagValues.flat()
        );
      }
    }

    return this.getPostById(id);
  }

  async deletePost(id: number, authorId: number): Promise<boolean> {
    const [existingPosts] = await pool.query('SELECT * FROM posts WHERE id = ?', [id]) as any[];
    if (existingPosts.length === 0) {
      return false;
    }

    if (existingPosts[0].author_id !== authorId) {
      throw new Error('You can only delete your own posts');
    }

    await pool.query('DELETE FROM posts WHERE id = ?', [id]);
    return true;
  }

  async getPostById(id: number): Promise<any> {
    const query = `
      SELECT 
        p.*,
        u.username as author_username,
        u.avatar as author_avatar,
        u.role as author_role,
        c.name as category_name,
        c.slug as category_slug
      FROM posts p
      LEFT JOIN users u ON p.author_id = u.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `;

    const [posts] = await pool.query(query, [id]) as any[];

    if (posts.length === 0) {
      return null;
    }

    const post = posts[0];

    // 获取文章标签
    const [tagsResult] = await pool.query(
      `SELECT t.id, t.name, t.slug FROM tags t 
       JOIN post_tags pt ON t.id = pt.tag_id 
       WHERE pt.post_id = ?`,
      [post.id]
    ) as any[];
    
    const tags = tagsResult.map((tag: any) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug
    }));

    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      content: post.content,
      excerpt: post.excerpt,
      coverImage: post.cover_image,
      categoryId: post.category_id,
      authorId: post.author_id,
      status: post.status,
      viewCount: post.view_count,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
      author: {
        id: post.author_id,
        username: post.author_username,
        email: '',
        name: post.author_username,
        avatar: post.author_avatar,
        role: post.author_role
      },
      category: {
        id: post.category_id,
        name: post.category_name,
        slug: post.category_slug
      },
      tags
    };
  }

  async getCategories(): Promise<any> {
    const [categories] = await pool.query('SELECT * FROM categories ORDER BY name ASC') as any[];
    return categories.map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      parentId: cat.parent_id
    }));
  }

  async getTags(): Promise<any> {
    const [tags] = await pool.query('SELECT * FROM tags ORDER BY name ASC') as any[];
    return tags.map((tag: any) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug
    }));
  }
}

const postService = new PostService();
export { postService };
export default postService;
