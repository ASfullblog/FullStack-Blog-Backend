import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const ssl = process.env.DB_SSL === 'true'
  ? { rejectUnauthorized: false }
  : undefined;

const connectionOptions = process.env.DATABASE_URL
  ? (() => {
      const url = new URL(process.env.DATABASE_URL);
      return {
        host: url.hostname,
        port: parseInt(url.port || '3306'),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: decodeURIComponent(url.pathname.replace(/^\//, '')),
        ssl,
        waitForConnections: true,
        connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '5'),
        queueLimit: 0
      };
    })()
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'fullstack_blog',
      ssl,
      waitForConnections: true,
      connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10'),
      queueLimit: 0
    };

const pool = mysql.createPool(connectionOptions);

export default pool;
