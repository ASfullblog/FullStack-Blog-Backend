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


}

export const authService = new AuthService();