import express from 'express';
import multer from 'multer';
import path from 'path';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

// 配置存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// 配置上传
const upload = multer({ storage: storage });

/**
 * 上传路由
 * 处理文件上传
 */

// 上传图片（需鉴权）
router.post('/image', authMiddleware, upload.single('file'), (req: any, res: express.Response) => {
  try {
    if (!req.file) {
      res.status(400).json({
        code: 400,
        message: 'No file uploaded',
        data: null
      });
      return;
    }

    // 构建图片URL
    const imageUrl = `http://localhost:3003/uploads/${req.file.filename}`;

    res.status(200).json({
      code: 200,
      message: 'Image uploaded successfully',
      data: {
        url: imageUrl
      }
    });
  } catch (error: any) {
    res.status(500).json({
      code: 500,
      message: error.message || 'Failed to upload image',
      data: null
    });
  }
});

export default router;