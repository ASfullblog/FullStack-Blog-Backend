/**
 * Redis 缓存工具模块
 * 功能：提供 Redis 连接和缓存操作方法
 */
import { createClient, RedisClientType } from 'redis'

// Redis 客户端实例
let client: RedisClientType | null = null

/**
 * 获取 Redis 客户端
 * 功能：初始化并返回 Redis 客户端实例
 * @returns RedisClientType Redis 客户端
 */
export const getRedisClient = async (): Promise<RedisClientType> => {
  if (!client) {
    client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('Redis 重连次数过多，放弃连接')
            return false
          }
          return Math.min(retries * 100, 3000)
        }
      }
    })

    client.on('error', (err) => {
      console.error('Redis 连接错误:', err)
    })

    client.on('connect', () => {
      console.log('Redis 连接成功')
    })

    await client.connect()
  }

  return client
}

/**
 * 设置缓存
 * 功能：将数据存入 Redis，可设置过期时间
 * @param key 缓存键
 * @param value 缓存值
 * @param expireSeconds 过期时间（秒）
 */
export const setCache = async (
  key: string,
  value: string | object,
  expireSeconds?: number
): Promise<void> => {
  const redis = await getRedisClient()
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value)

  if (expireSeconds) {
    await redis.setEx(key, expireSeconds, stringValue)
  } else {
    await redis.set(key, stringValue)
  }
}

/**
 * 获取缓存
 * 功能：从 Redis 获取缓存数据
 * @param key 缓存键
 * @returns 缓存值或 null
 */
export const getCache = async (key: string): Promise<string | null> => {
  const redis = await getRedisClient()
  return await redis.get(key)
}

/**
 * 获取 JSON 缓存
 * 功能：获取缓存并解析为 JSON 对象
 * @param key 缓存键
 * @returns JSON 对象或 null
 */
export const getCacheJSON = async <T>(key: string): Promise<T | null> => {
  const value = await getCache(key)
  if (!value) return null

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

/**
 * 删除缓存
 * 功能：删除指定的缓存键
 * @param key 缓存键
 */
export const deleteCache = async (key: string): Promise<void> => {
  const redis = await getRedisClient()
  await redis.del(key)
}

/**
 * 批量删除缓存
 * 功能：根据模式批量删除缓存
 * @param pattern 匹配模式，如 "user:*"
 */
export const deleteCachePattern = async (pattern: string): Promise<void> => {
  const redis = await getRedisClient()
  const keys = await redis.keys(pattern)
  if (keys.length > 0) {
    await redis.del(keys)
  }
}

/**
 * 检查缓存是否存在
 * 功能：检查指定键是否存在于缓存中
 * @param key 缓存键
 * @returns 是否存在
 */
export const existsCache = async (key: string): Promise<boolean> => {
  const redis = await getRedisClient()
  const result = await redis.exists(key)
  return result === 1
}

/**
 * 设置缓存过期时间
 * 功能：为已存在的键设置过期时间
 * @param key 缓存键
 * @param seconds 过期秒数
 */
export const expireCache = async (key: string, seconds: number): Promise<void> => {
  const redis = await getRedisClient()
  await redis.expire(key, seconds)
}

/**
 * 关闭 Redis 连接
 * 功能：优雅地关闭 Redis 客户端连接
 */
export const closeRedis = async (): Promise<void> => {
  if (client) {
    await client.quit()
    client = null
    console.log('Redis 连接已关闭')
  }
}
