import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

import authRoutes from './routes/auth';
import postRoutes from './routes/posts';
import categoryRoutes from './routes/categories';
import commentRoutes from './routes/comments';
import settingsRoutes from './routes/settings';
import userRoutes from './routes/users';
import uploadRoutes from './routes/upload';
import quotesRoutes from './routes/quotes';
import aiRoutes from './routes/ai';
import notificationRoutes from './routes/notifications';
import parkingRushRoutes from './routes/parkingRush';
import gameRoutes from './routes/gameRoutes';
import adminGameRoutes from './routes/adminGames';
import gameLevelConfigRoutes from './routes/gameLevelConfigs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
// 增加body大小限制以支持Base64图片上传
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 请求日志中间件 - 使用 console.log 输出到控制台
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  const start = Date.now();
  const timestamp = new Date().toLocaleTimeString();

  // 响应完成时记录
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m'; // 红色或绿色
    const resetColor = '\x1b[0m';
    
    console.log(
      `[${timestamp}] ${req.method} ${req.originalUrl} ${statusColor}${res.statusCode}${resetColor} - ${duration}ms`
    );
  });

  next();
});

// 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 健康检查接口
app.get('/', (_req: express.Request, res: express.Response) => {
  res.json({
    code: 200,
    message: 'Blog Backend API is running',
    data: {
      version: '1.0.0',
      timestamp: new Date().toISOString()
    }
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api', categoryRoutes);
app.use('/api', commentRoutes);
app.use('/api', settingsRoutes);
app.use('/api', userRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api', notificationRoutes);
app.use('/api/parking-rush', parkingRushRoutes);
app.use('/api/games', gameRoutes);
app.use('/api', adminGameRoutes);
app.use('/api', gameLevelConfigRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    code: 500,
    message: 'Internal Server Error',
    data: null
  });
});

app.use('*', (_req: express.Request, res: express.Response) => {
  res.status(404).json({
    code: 404,
    message: 'Route Not Found',
    data: null
  });
});

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
  });
}

export default app;
