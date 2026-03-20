/**
 * Winston 日志工具模块
 * 功能：提供多级别日志记录，支持文件轮转和控制台输出
 */
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import path from 'path'

// 日志目录
const logDir = path.join(process.cwd(), 'logs')

// 日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    const msg = `${timestamp} [${level.toUpperCase()}]: ${message}`
    return stack ? `${msg}\n${stack}` : msg
  })
)

// JSON 格式（用于生产环境）
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
)

// 控制台格式（带颜色）
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level}]: ${message}`
  })
)

// 创建日志记录器
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'blog-backend' },
  transports: [
    // 错误日志 - 按天轮转
    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d',
      format: process.env.NODE_ENV === 'production' ? jsonFormat : logFormat
    }),

    // 组合日志 - 按天轮转
    new DailyRotateFile({
      filename: path.join(logDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: process.env.NODE_ENV === 'production' ? jsonFormat : logFormat
    })
  ],

  // 未捕获的异常处理
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d'
    })
  ],

  // 未处理的 Promise 拒绝
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d'
    })
  ]
})

// 开发环境添加控制台输出
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat
    })
  )
}

/**
 * 请求日志中间件
 * 功能：记录 HTTP 请求信息
 */
export const requestLogger = (req: any, res: any, next: any) => {
  const start = Date.now()

  res.on('finish', () => {
    const duration = Date.now() - start
    const message = `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms - ${req.ip}`

    if (res.statusCode >= 400) {
      logger.warn(message)
    } else {
      logger.info(message)
    }
  })

  next()
}

/**
 * 错误日志中间件
 * 功能：记录应用错误信息
 */
export const errorLogger = (err: any, req: any, res: any, next: any) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent')
  })

  next(err)
}

export default logger
