/**
 * 访问统计接口（公开、只读、只返回聚合）
 *
 * 隐私：三个接口的返回体只有「省份名 + 人次」「日期 + 人次」和几个总数，
 * 不含 ip / ip_hash / user_agent / referrer / path 等任何明细字段，也没有写接口。
 *
 * 时间口径：visit_logs.created_at 存的是 UTC 无时区 timestamp（Neon 服务器时区）。
 *   为摆脱对 session TimeZone 的依赖，这里统一用 `created_at + INTERVAL '8 hours'`
 *   换算北京时间日期，日期/时间边界由 JS 侧算好后作为参数传入。
 *
 * Lead 需要注册：app.use('/api/stats', statsRouter)
 */
import express, { Request, Response } from 'express';
import pool from '../config/database';

/** 统计时区相对 UTC 的小时数（默认东八区，中国大陆无夏令时，固定偏移即可） */
const TZ_OFFSET_HOURS = (() => {
  const raw = Number(process.env.VISIT_TZ_OFFSET_HOURS ?? 8);
  return Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), -12), 14) : 8;
})();

/** 常见占位值：既不是真实省份也不该出现在地球上 */
const FILTERED_PROVINCES = ['', '未知', '本地'];

/** 进程内微缓存：公开接口 + Neon HTTP 驱动（一次 query 一次往返），30s 缓存足够 */
const microCache = new Map<string, { value: any; expiresAt: number }>();
const CACHE_TTL_MS = Number(process.env.STATS_CACHE_TTL_MS ?? 30 * 1000);

const cached = async (key: string, loader: () => Promise<any>): Promise<any> => {
  const now = Date.now();
  const hit = microCache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;
  const value = await loader();
  if (CACHE_TTL_MS > 0) microCache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
};

const ok = (res: Response, data: any) => res.json({ code: 200, message: 'Success', data });
const fail = (res: Response, error: any, api: string) => {
  console.error(`[stats:${api}]`, error?.message || error);
  res.status(500).json({ code: 500, message: error?.message || `Failed to load ${api}`, data: null });
};

const parseDays = (raw: any, fallback = 30): number => {
  const n = parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(n, 1), 365);
};

/* ------------------------------------------------------------------ *
 * 北京时间相关的时间工具
 * ------------------------------------------------------------------ */

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

/** 把 UTC 时间戳平移成「北京时间的各字段」 */
const shiftedParts = (utcMs: number, offsetHours = TZ_OFFSET_HOURS) => {
  const d = new Date(utcMs + offsetHours * 3600 * 1000);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    h: d.getUTCHours(),
    min: d.getUTCMinutes(),
    s: d.getUTCSeconds()
  };
};

/** 北京时间日期字符串 YYYY-MM-DD */
const localDate = (utcMs: number): string => {
  const p = shiftedParts(utcMs);
  return `${p.y}-${pad(p.m)}-${pad(p.day)}`;
};

/** 北京时间当天 00:00:00 对应的 UTC 时间字符串（用于和 created_at 比较） */
const localMidnightUtc = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcMs = Date.UTC(y, m - 1, d) - TZ_OFFSET_HOURS * 3600 * 1000;
  const u = new Date(utcMs);
  return `${u.getUTCFullYear()}-${pad(u.getUTCMonth() + 1)}-${pad(u.getUTCDate())} ${pad(
    u.getUTCHours()
  )}:${pad(u.getUTCMinutes())}:${pad(u.getUTCSeconds())}`;
};

/** 往前 N 天的北京时间日期 */
const localDateMinusDays = (days: number, fromUtcMs = Date.now()): string =>
  localDate(fromUtcMs - days * 86400 * 1000);

/* ------------------------------------------------------------------ *
 * SQL（每条一次往返即出全部结果）
 * ------------------------------------------------------------------ */

/**
 * 地理分布：按「国家 + 一级行政区」两级聚合，返回带 country 字段。
 * - 中国访问：province=省简称，country='中国'
 * - 海外访问：province=中文国名，country=中文国名（非中国）
 * 前端据此把「中国省份」打到省坐标、「海外国家」打到国家坐标，并算访问率。
 * 一条 SQL 带出总人次（COUNT(*) OVER()），避免前端二次请求或循环。
 */
const GEO_SQL = `
  SELECT
    country,
    province,
    COUNT(*)::int AS count,
    SUM(COUNT(*)) OVER ()::int AS total
  FROM visit_logs
  WHERE province IS NOT NULL
    AND province NOT IN ('', '未知', '本地')
  GROUP BY country, province
  ORDER BY count DESC, province ASC
`;

/** 每日访问量：generate_series 生成完整日期序列再 LEFT JOIN，缺失日期补 0 */
const TREND_SQL = `
  WITH days AS (
    SELECT generate_series(?::date, ?::date, INTERVAL '1 day')::date AS day
  ),
  agg AS (
    SELECT (created_at + INTERVAL '${TZ_OFFSET_HOURS} hours')::date AS day, COUNT(*)::int AS views
    FROM visit_logs
    WHERE created_at >= ?::timestamp
    GROUP BY 1
  )
  SELECT TO_CHAR(days.day, 'YYYY-MM-DD') AS date, COALESCE(agg.views, 0)::int AS views
  FROM days LEFT JOIN agg ON agg.day = days.day
  ORDER BY days.day
`;

/** 概览：总访问量 / 独立 IP / 今日 / 近 7 天 / 近 30 天 / 覆盖省份数 */
const OVERVIEW_SQL = `
  SELECT
    COUNT(*)::int AS total_views,
    COUNT(DISTINCT COALESCE(ip_hash, ip))::int AS unique_ips,
    COUNT(*) FILTER (WHERE (created_at + INTERVAL '${TZ_OFFSET_HOURS} hours')::date = ?::date)::int AS today_views,
    COUNT(*) FILTER (WHERE created_at >= ?::timestamp)::int AS last7_views,
    COUNT(*) FILTER (WHERE created_at >= ?::timestamp)::int AS last30_views,
    COUNT(DISTINCT province) FILTER (
      WHERE province IS NOT NULL AND province NOT IN ('', '未知', '本地')
    )::int AS province_count,
    MAX(created_at)::timestamp AS last_visit_at
  FROM visit_logs
`;

const router = express.Router();

/** GET /api/stats/geo → [{ country, province, count, total }, ...] */
router.get('/geo', async (_req: Request, res: Response) => {
  try {
    const data = await cached('geo', async () => {
      const [rows] = (await pool.query(GEO_SQL)) as any[];
      return (rows || [])
        .map((r: any) => ({
          country: String(r.country ?? ''),
          province: String(r.province ?? ''),
          count: Number(r.count) || 0,
          total: Number(r.total) || 0
        }))
        .filter((x: any) => !FILTERED_PROVINCES.includes(x.province));
    });
    ok(res, data);
  } catch (e: any) {
    fail(res, e, 'geo');
  }
});

/** GET /api/stats/trend?days=30 → [{ date: '2026-10-28', views: 34 }, ...]（长度恒等于 days） */
router.get('/trend', async (req: Request, res: Response) => {
  const days = parseDays(req.query?.days, 30);
  try {
    const data = await cached(`trend:${days}`, async () => {
      const endDay = localDate(Date.now());
      const startDay = localDateMinusDays(days - 1);
      const [rows] = (await pool.query(TREND_SQL, [startDay, endDay, localMidnightUtc(startDay)])) as any[];
      const out = (rows || []).map((r: any) => ({ date: String(r.date), views: Number(r.views) || 0 }));
      // 兜底：万一 generate_series 少给日期（时区/夏令时异常），补齐成 days 长度
      if (out.length !== days) {
        const map = new Map<string, number>(out.map((x: any) => [String(x.date), Number(x.views) || 0]));
        const full: Array<{ date: string; views: number }> = [];
        for (let i = 0; i < days; i++) {
          const dd = localDate(Date.now() - (days - 1 - i) * 86400 * 1000);
          full.push({ date: dd, views: map.get(dd) ?? 0 });
        }
        return full;
      }
      return out;
    });
    ok(res, data);
  } catch (e: any) {
    fail(res, e, 'trend');
  }
});

/** GET /api/stats/overview → 卡片数字 */
router.get('/overview', async (_req: Request, res: Response) => {
  try {
    const data = await cached('overview', async () => {
      const today = localDate(Date.now());
      const [rows] = (await pool.query(OVERVIEW_SQL, [
        today,
        localMidnightUtc(localDateMinusDays(6)),
        localMidnightUtc(localDateMinusDays(29))
      ])) as any[];
      const r = rows?.[0] || {};
      return {
        totalViews: Number(r.total_views) || 0,
        uniqueIps: Number(r.unique_ips) || 0,
        todayViews: Number(r.today_views) || 0,
        last7Views: Number(r.last7_views) || 0,
        last30Views: Number(r.last30_views) || 0,
        provinceCount: Number(r.province_count) || 0,
        timezone: `UTC+${TZ_OFFSET_HOURS}`
      };
    });
    ok(res, data);
  } catch (e: any) {
    fail(res, e, 'overview');
  }
});

/** GET /api/stats/health 开发排查用：只有缓存元信息，无任何明细 */
router.get('/health', (_req: Request, res: Response) => {
  ok(res, { cachedKeys: microCache.size, cacheTtlMs: CACHE_TTL_MS, tzOffsetHours: TZ_OFFSET_HOURS });
});

export default router;
export { GEO_SQL, TREND_SQL, OVERVIEW_SQL, FILTERED_PROVINCES };
