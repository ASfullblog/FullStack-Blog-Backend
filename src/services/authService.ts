import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database';

/**
 * 认证服务
 * 处理用户注册和登录的业务逻辑
 */
export class AuthService {
  /**
   * 用户注册
   * @param username 用户名
   * @param password 密码
   * @param email 邮箱
   * @returns 注册成功的用户信息
   */
  async register(username: string, password: string, email: string): Promise<any> {
    // 检查用户是否已存在
    const [existingUsers] = await pool.query('SELECT * FROM users WHERE username = ? OR email = ?', [username, email]) as any[];

    if (existingUsers.length > 0) {
      throw new Error('Username or email already exists');
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(password, 10);

    // 创建用户
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, 'user']
    ) as any[];

    // 返回用户信息
    return {
      id: result.insertId,
      username,
      email,
      role: 'user',
      avatar: null,
      createdAt: new Date()
    };
  }

  /**
   * 用户登录
   * @param username 账号
   * @param password 密码
   * @returns 用户信息和JWT token
   */
  async login(username: string, password: string): Promise<{ user: any; token: string }> {
    // 查找用户
    const [users] = await pool.query('SELECT * FROM users WHERE username = ?', [username]) as any[];

    if (users.length === 0) {
      throw new Error('Invalid username or password');
    }

    const user = users[0];

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      throw new Error('Invalid username or password');
    }

    // 禁用拦截：必须在密码校验通过之后才检查 status，避免向未通过密码的人泄露"该账号存在且已被禁用"
    // status 为 NULL 的老数据视为 active（等价于 SQL 的 COALESCE(status,'active') <> 'disabled'），不把存量用户/管理员锁在门外
    if ((user.status ?? 'active') === 'disabled') {
      throw new Error('账号已被禁用，请联系管理员');
    }

    // 记录最近活跃时间：fire-and-forget，不进登录关键路径（Neon HTTP 驱动一次往返几百毫秒），失败静默
    pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]).catch(() => {});

    // 生成JWT token
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      secret,
      {
        expiresIn: '7d' // 7天过期
      }
    );

    // 返回用户信息和token
    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        createdAt: user.created_at
      },
      token
    };
  }

  /**
   * 重置密码（账号内自助重置，不依赖邮件/短信）
   * 用「用户名 + 注册邮箱」两项同时匹配来确认身份，再写入新密码。
   * @param username 用户名
   * @param email 注册邮箱
   * @param newPassword 新密码
   */
  async resetPassword(username: string, email: string, newPassword: string): Promise<void> {
    const name = String(username || '').trim();
    const mail = String(email || '').trim().toLowerCase();
    const pwd = String(newPassword || '');

    if (!name || !mail) {
      throw new Error('用户名和注册邮箱不能为空');
    }
    if (pwd.length < 6) {
      throw new Error('新密码至少 6 位');
    }

    // 用户名与邮箱必须同时匹配，任一不符都不提示是哪一项错了，避免被枚举账号
    const [users] = await pool.query(
      'SELECT id, status FROM users WHERE username = ? AND LOWER(email) = ? LIMIT 1',
      [name, mail]
    ) as any[];

    if (users.length === 0) {
      throw new Error('用户名与该邮箱不匹配');
    }

    const user = users[0];

    if ((user.status ?? 'active') === 'disabled') {
      throw new Error('账号已被禁用，请联系管理员');
    }

    const passwordHash = await bcrypt.hash(pwd, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user.id]);
  }

}

export const authService = new AuthService();