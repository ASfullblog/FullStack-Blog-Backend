import express from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/database';
import { authMiddleware, optionalAuthMiddleware, adminMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

const PRIVATE_USER_FIELDS = 'id, username, email, role, avatar, bio, github_url, qq_number, contact_emails, tech_stack, visited_provinces, created_at, status, last_login_at';
// 公开字段：只放出“对外的联系方式”，绝不放出登录邮箱（email）与原始 qq_number。
// qq_number 单独用于 tencent:// 之外的手动复制场景，由前端的 QQ 弹层按需展示，
// 但为避免被爬虫直接抓走，这里也不直接公开；需要时由 /users/:id/contact 单独返回。
const PUBLIC_USER_FIELDS = 'id, username, role, avatar, bio, github_url, tech_stack, visited_provinces, contact_emails, created_at';

const canViewPrivateProfile = (requestUser: any, targetUserId: number): boolean => {
  if (!requestUser) {
    return false;
  }

  return requestUser.role === 'admin' || Number(requestUser.id) === targetUserId;
};

// 管理端列表的统计子查询：每个用户附带文章数/评论数/消息数/游戏最高等级。
// 注意：底层 Neon 是 HTTP 驱动，一条 query 一次往返，统计必须放在同一条 SQL 里，严禁循环逐条查。
const USER_STATS_SELECT = `
  (SELECT COUNT(*)::int FROM posts p WHERE p.author_id = u.id) AS "postCount",
  (SELECT COUNT(*)::int FROM comments c WHERE c.user_id = u.id) AS "commentCount",
  (SELECT COUNT(*)::int FROM notifications n WHERE n.user_id = u.id) AS "notificationCount",
  (SELECT MAX(l.level_id)::int FROM user_level_records l WHERE l.user_id = u.id) AS "gameLevel"
`;

export interface UserManageQueryBuildResult {
  sql: string;
  params: any[];
}

/**
 * 构造管理端用户列表 SQL（单条 SQL 同时拿列表 + 统计 + 总数）。
 * 总数用 COUNT(*) OVER() 窗口函数，避免再发一次 COUNT 查询。
 * 导出给验证脚本复用，保证脚本跑的 SQL 和路由实际执行的完全一致。
 */
export const buildUserManageListQuery = (
  keyword: string,
  roleFilter: string,
  limit: number,
  offset: number
): UserManageQueryBuildResult => {
  const conditions: string[] = [];
  const params: any[] = [];

  const kw = (keyword || '').trim();
  if (kw) {
    conditions.push('(u.username ILIKE ? OR u.email ILIKE ?)');
    params.push(`%${kw}%`, `%${kw}%`);
  }

  const role = (roleFilter || '').trim();
  if (role) {
    conditions.push('u.role = ?');
    params.push(role);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 字段列表绝对不包含 password_hash
  const sql = `
    SELECT
      u.id, u.username, u.email, u.role, u.status, u.avatar, u.bio, u.github_url, u.qq_number,
      u.tech_stack, u.visited_provinces, u.created_at, u.last_login_at,
      COALESCE(u.last_login_at, u.created_at) AS "lastActiveAt",
      ${USER_STATS_SELECT},
      COUNT(*) OVER()::int AS "totalCount"
    FROM users u
    ${whereSql}
    ORDER BY u.id ASC
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);

  return { sql, params };
};

/**
 * 用户路由
 * 处理用户信息的CRUD操作
 */

// 获取用户总数
router.get('/users/count', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) as total FROM users') as any[];
    res.json({
      code: 200,
      message: 'Success',
      data: { total: rows[0].total }
    });
  } catch (error: any) {
    console.error('获取用户总数失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

// 获取用户列表
// 管理模式：携带 page / pageSize / keyword / role 任一查询参数时，返回分页结构 { list, total, page, pageSize }（仅管理员）
// 旧模式：以上参数都不传时，保持原有行为（直接返回用户数组），向后兼容现有调用方
router.get('/users', optionalAuthMiddleware, async (req: any, res) => {
  try {
    const { page, pageSize, keyword, role } = req.query;
    const isManageMode = page !== undefined || pageSize !== undefined || keyword !== undefined || role !== undefined;

    if (isManageMode) {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          code: 403,
          message: 'Admin permission required',
          data: null
        });
      }

      const pageNum = Math.max(1, parseInt(String(page ?? '1'), 10) || 1);
      const sizeNum = Math.min(100, Math.max(1, parseInt(String(pageSize ?? '20'), 10) || 20));

      const { sql, params } = buildUserManageListQuery(
        String(keyword ?? ''),
        String(role ?? ''),
        sizeNum,
        (pageNum - 1) * sizeNum
      );

      // 只发一条 SQL：列表 + 三个统计 + 总数（COUNT(*) OVER()）
      const [rows] = await pool.query(sql, params) as any[];
      const total = rows.length > 0 ? Number(rows[0].totalCount) : 0;

      return res.json({
        code: 200,
        message: 'Success',
        data: {
          list: rows,
          total,
          page: pageNum,
          pageSize: sizeNum
        }
      });
    }

    const isAdmin = req.user?.role === 'admin';
    const fields = isAdmin ? PRIVATE_USER_FIELDS : PUBLIC_USER_FIELDS;
    const [rows] = await pool.query(`SELECT ${fields} FROM users`) as any[];
    res.json({
      code: 200,
      message: 'Success',
      data: rows
    });
  } catch (error: any) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

// 获取单个用户（管理端详情：完整字段 + 统计，仅管理员）
router.get('/users/:id/detail', adminMiddleware, async (req: any, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ code: 400, message: 'Invalid user id', data: null });
    }

    const [rows] = await pool.query(
      `SELECT
         u.id, u.username, u.email, u.role, u.status, u.avatar, u.bio, u.github_url, u.qq_number,
         u.tech_stack, u.visited_provinces, u.created_at, u.last_login_at,
         COALESCE(u.last_login_at, u.created_at) AS "lastActiveAt",
         ${USER_STATS_SELECT}
       FROM users u
       WHERE u.id = ?`,
      [userId]
    ) as any[];

    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: 'User not found', data: null });
    }

    res.json({ code: 200, message: 'Success', data: rows[0] });
  } catch (error: any) {
    console.error('获取用户详情失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

// 获取单个用户
/**
 * 站长的公开联系方式（给 /about 的 QQ 弹层用）。
 * 不走 PUBLIC_USER_FIELDS 的原因：qq_number 一旦放进公开字段，任何人都能批量抓；
 * 这里只对 admin 这一个账号按需返回，且不带 email 等私密字段。
 * 必须放在 /users/:id 之前注册，否则会被 :id 吞掉。
 */
router.get('/users/contact/public', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, username, qq_number, contact_emails, github_url FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`
    ) as any[];
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: 'Contact not found', data: null });
    }
    const row = rows[0];
    const rawEmails = row.contact_emails;
    let contactEmails: any[] = [];
    if (Array.isArray(rawEmails)) {
      contactEmails = rawEmails;
    } else if (typeof rawEmails === 'string') {
      try { contactEmails = JSON.parse(rawEmails); } catch { contactEmails = []; }
    }
    res.json({
      code: 200,
      message: 'Success',
      data: {
        qqNumber: row.qq_number || '',
        githubUrl: row.github_url || '',
        contactEmails: Array.isArray(contactEmails) ? contactEmails : []
      }
    });
  } catch (error: any) {
    console.error('获取公开联系方式失败:', error);
    res.status(500).json({ code: 500, message: 'Failed to fetch contact', data: null });
  }
});

router.get('/users/:id', optionalAuthMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = Number(id);
    const fields = canViewPrivateProfile(req.user, userId) ? PRIVATE_USER_FIELDS : PUBLIC_USER_FIELDS;
    const [rows] = await pool.query(`SELECT ${fields} FROM users WHERE id = ?`, [id]) as any[];
    if (rows.length === 0) {
      return res.status(404).json({
        code: 404,
        message: 'User not found',
        data: null
      });
    }
    res.json({
      code: 200,
      message: 'Success',
      data: rows[0]
    });
  } catch (error: any) {
    console.error('获取用户失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

// 删除用户（仅管理员）
// 规则：禁止删除 username='admin' 的账号；禁止删除自己；有文章的用户必须先转移/删除文章（不做级联删文章）
// comments.user_id 无外键约束，必须显式清理；其余表靠 ON DELETE CASCADE
router.delete('/users/:id', adminMiddleware, async (req: any, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ code: 400, message: 'Invalid user id', data: null });
    }

    if (Number(req.user.id) === userId) {
      return res.status(400).json({ code: 400, message: '不能删除自己的账号', data: null });
    }

    const [rows] = await pool.query('SELECT id, username FROM users WHERE id = ?', [userId]) as any[];
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: 'User not found', data: null });
    }

    const target = rows[0];
    if (target.username === 'admin') {
      return res.status(400).json({ code: 400, message: '不能删除 admin 账号', data: null });
    }

    const [postRows] = await pool.query('SELECT COUNT(*)::int AS "postCount" FROM posts WHERE author_id = ?', [userId]) as any[];
    const postCount = Number(postRows[0]?.postCount ?? 0);
    if (postCount > 0) {
      return res.status(400).json({
        code: 400,
        message: `该用户还有 ${postCount} 篇文章，请先转移或删除 TA 的文章`,
        data: { postCount }
      });
    }

    // comments.user_id 没有外键，不会级联，先显式删掉
    const [commentResult] = await pool.query('DELETE FROM comments WHERE user_id = ?', [userId]) as any[];
    const removedComments = Number(commentResult?.affectedRows ?? 0);

    // 删用户本体：notifications / user_level_records / game_favorites / game_ratings 由 ON DELETE CASCADE 自动清理
    const [userResult] = await pool.query('DELETE FROM users WHERE id = ?', [userId]) as any[];
    if (!Number(userResult?.rowCount ?? 0)) {
      return res.status(404).json({ code: 404, message: 'User not found', data: null });
    }

    res.json({
      code: 200,
      message: `用户 ${target.username} 已删除`,
      data: { id: userId, removedComments, removedPosts: 0 }
    });
  } catch (error: any) {
    console.error('删除用户失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

// 修改用户角色（仅管理员）
// 规则：禁止改自己的角色（含把自己降级）、禁止改 username='admin' 账号的角色
router.put('/users/:id/role', adminMiddleware, async (req: any, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ code: 400, message: 'Invalid user id', data: null });
    }

    const { role } = req.body ?? {};
    if (role !== 'admin' && role !== 'user') {
      return res.status(400).json({ code: 400, message: "role must be 'admin' or 'user'", data: null });
    }

    if (Number(req.user.id) === userId) {
      return res.status(400).json({ code: 400, message: '不能修改自己的角色', data: null });
    }

    const [rows] = await pool.query('SELECT id, username, role FROM users WHERE id = ?', [userId]) as any[];
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: 'User not found', data: null });
    }

    if (rows[0].username === 'admin') {
      return res.status(400).json({ code: 400, message: '不能修改 admin 账号的角色', data: null });
    }

    await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, userId]);

    const [updated] = await pool.query(`SELECT ${PRIVATE_USER_FIELDS} FROM users WHERE id = ?`, [userId]) as any[];

    res.json({
      code: 200,
      message: '角色更新成功',
      data: updated[0]
    });
  } catch (error: any) {
    console.error('修改用户角色失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

// 修改用户启用/禁用状态（仅管理员）
// 规则：禁止改自己的状态、禁止改 username='admin' 账号的状态（不允许把最高权限账号锁死）
router.put('/users/:id/status', adminMiddleware, async (req: any, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ code: 400, message: 'Invalid user id', data: null });
    }

    const { status } = req.body ?? {};
    if (status !== 'active' && status !== 'disabled') {
      return res.status(400).json({ code: 400, message: "status must be 'active' or 'disabled'", data: null });
    }

    if (Number(req.user.id) === userId) {
      return res.status(400).json({ code: 400, message: '不能修改自己的账号状态', data: null });
    }

    const [rows] = await pool.query('SELECT id, username FROM users WHERE id = ?', [userId]) as any[];
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: 'User not found', data: null });
    }

    if (rows[0].username === 'admin') {
      return res.status(400).json({ code: 400, message: '不能修改 admin 账号的状态', data: null });
    }

    await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, userId]);

    const [updated] = await pool.query(
      'SELECT id, username, email, role, status, avatar, bio, github_url, qq_number, tech_stack, visited_provinces, created_at, last_login_at FROM users WHERE id = ?',
      [userId]
    ) as any[];

    res.json({
      code: 200,
      message: status === 'disabled' ? '用户已禁用' : '用户已启用',
      data: updated[0]
    });
  } catch (error: any) {
    console.error('修改用户状态失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

// 重置用户密码（仅管理员）
// 规则：禁止重置 username='admin' 账号的密码；响应/日志绝不返回哈希或明文
router.put('/users/:id/password', adminMiddleware, async (req: any, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ code: 400, message: 'Invalid user id', data: null });
    }

    const { password } = req.body ?? {};
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ code: 400, message: '密码长度不能少于 6 位', data: null });
    }

    const [rows] = await pool.query('SELECT id, username FROM users WHERE id = ?', [userId]) as any[];
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: 'User not found', data: null });
    }

    if (rows[0].username === 'admin') {
      return res.status(400).json({ code: 400, message: '不能通过该接口重置 admin 账号的密码', data: null });
    }

    // 与注册流程一致：bcryptjs cost=10，否则 authService.login 的 bcrypt.compare 会挂
    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);

    res.json({
      code: 200,
      message: `已重置用户 ${rows[0].username} 的密码`,
      data: { id: userId, username: rows[0].username }
    });
  } catch (error: any) {
    // 日志只打错误对象，绝不打印密码或哈希
    console.error('重置用户密码失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

// 更新用户信息
router.put('/users/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, bio, githubUrl, qqNumber, techStack, visitedProvinces, avatar } = req.body;
    
    // 构建更新字段
    const updates: string[] = [];
    const values: any[] = [];
    
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email);
    }
    if (bio !== undefined) {
      updates.push('bio = ?');
      values.push(bio);
    }
    if (githubUrl !== undefined) {
      updates.push('github_url = ?');
      values.push(githubUrl);
    }
    if (qqNumber !== undefined) {
      updates.push('qq_number = ?');
      values.push(qqNumber);
    }
    if (techStack !== undefined) {
      updates.push('tech_stack = ?');
      values.push(techStack);
    }
    if (visitedProvinces !== undefined) {
      updates.push('visited_provinces = ?');
      values.push(visitedProvinces);
    }
    if (avatar !== undefined) {
      updates.push('avatar = ?');
      values.push(avatar);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        code: 400,
        message: 'No fields to update',
        data: null
      });
    }
    
    values.push(id);
    
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    
    // 获取更新后的用户信息
    const [rows] = await pool.query('SELECT id, username, email, role, avatar, bio, github_url, qq_number, tech_stack, visited_provinces, created_at FROM users WHERE id = ?', [id]) as any[];
    
    res.json({
      code: 200,
      message: 'User updated successfully',
      data: rows[0]
    });
  } catch (error: any) {
    console.error('更新用户失败:', error);
    res.status(500).json({
      code: 500,
      message: error.message || 'Internal Server Error',
      data: null
    });
  }
});

export default router;
