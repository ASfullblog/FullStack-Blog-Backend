/**
 * 测试数据灌入脚本（幂等）：往 visit_logs 写 200~400 条近 30 天的访问
 *
 * 用法：
 *   npx ts-node scripts/seed-visit-logs.ts             # 表非空则跳过
 *   npx ts-node scripts/seed-visit-logs.ts --force     # 忽略已有数据，直接追加
 *   npx ts-node scripts/seed-visit-logs.ts --clear     # 先清空测试数据再灌
 *
 * 清空测试数据（只清 visit_logs / ip_cache，不动业务表）：
 *   npx ts-node scripts/seed-visit-logs.ts --truncate-only
 *
 * 数据口径说明：
 * - created_at 存 UTC naive timestamp（与线上 NOW() 写入一致），统计接口按 +8h 换算北京时间。
 * - 故意混入 province='未知' / '本地' / 海外国名，用来验证 geo 接口只出明确省份。
 */
import pool from '../src/config/database';
import { createHash, randomBytes } from 'crypto';

const ARGS = process.argv.slice(2);
const FORCE = ARGS.includes('--force');
const CLEAR_FIRST = ARGS.includes('--clear');
const TRUNCATE_ONLY = ARGS.includes('--truncate-only');

/** 真实中国省级行政区（简称，与 frontend/src/components/stats/provinceCoords.ts 一致） */
const PROVINCES: Array<{ name: string; weight: number }> = [
  { name: '广东', weight: 14 },
  { name: '江苏', weight: 11 },
  { name: '浙江', weight: 10 },
  { name: '北京', weight: 9 },
  { name: '上海', weight: 9 },
  { name: '湖南', weight: 8 },
  { name: '四川', weight: 7 },
  { name: '湖北', weight: 6 },
  { name: '山东', weight: 6 },
  { name: '福建', weight: 5 },
  { name: '陕西', weight: 4 },
  { name: '辽宁', weight: 3 },
  { name: '河南', weight: 3 },
  { name: '重庆', weight: 2 }
];

const CITY_OF: Record<string, string> = {
  广东: '广州市', 江苏: '南京市', 浙江: '杭州市', 北京: '北京市', 上海: '上海市',
  湖南: '长沙市', 四川: '成都市', 湖北: '武汉市', 山东: '济南市', 福建: '厦门市',
  陕西: '西安市', 辽宁: '沈阳市', 河南: '郑州市', 重庆: '重庆市'
};

/** 海外 / 异常样本：不应出现在 3D 地球上 */
const SPECIAL: Array<{ province: string; country: string }> = [
  { province: '未知', country: '未知' },
  { province: '本地', country: '本地' },
  { province: '美国', country: '美国' },
  { province: '日本', country: '日本' }
];

const PATHS = [
  '/api/posts', '/api/posts/1', '/api/posts/3', '/api/posts/7',
  '/api/categories', '/api/comments', '/api/quotes', '/api/games',
  '/api/parking-rush', '/api/tags', '/api/archive'
];

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/125.0 Mobile',
  'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Safari'
];

const REFERRERS = [
  'https://www.google.com/', 'https://www.baidu.com/', 'https://github.com/',
  'https://juejin.cn/', 'https://www.zhihu.com/', '', ''
];

const pickWeighted = <T>(items: T[], weightOf: (x: T) => number): T => {
  const total = items.reduce((s, x) => s + weightOf(x), 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= weightOf(item);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
};

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** 造一个可复现的公网 IP（只用于测试数据，不是真实归属地） */
const fakeIp = (provinceSeed: string): string => {
  const h = createHash('md5').update(provinceSeed + randomBytes(4).toString('hex')).digest();
  return `${1 + (h[0] % 200)}.${1 + (h[1] % 250)}.${h[2]}.${h[3]}`;
};

/** 北京时间某天的随机时刻 → UTC naive 字符串 */
const randomUtcForBeijingDay = (daysAgo: number): string => {
  const now = Date.now();
  const beijingDay = new Date(now + 8 * 3600 * 1000);
  beijingDay.setUTCDate(beijingDay.getUTCDate() - daysAgo);
  beijingDay.setUTCHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), Math.floor(Math.random() * 60), 0);
  const utcMs = beijingDay.getTime() - 8 * 3600 * 1000;
  const d = new Date(utcMs);
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
};

const truncate = async () => {
  await pool.query('TRUNCATE TABLE visit_logs RESTART IDENTITY');
  await pool.query('TRUNCATE TABLE ip_cache');
  console.log('[seed] 已清空 visit_logs / ip_cache');
};

async function main() {
  const [cntRows] = (await pool.query('SELECT COUNT(*)::int AS n FROM visit_logs')) as any[];
  const existing = Number(cntRows?.[0]?.n ?? 0);

  if (TRUNCATE_ONLY) {
    console.log(`[seed] --truncate-only：当前 ${existing} 行 -> 清空`);
    await truncate();
    const [after] = (await pool.query('SELECT COUNT(*)::int AS n FROM visit_logs')) as any[];
    console.log('[seed] 清空后行数:', after?.[0]?.n);
    return;
  }

  if (existing > 0 && !FORCE && !CLEAR_FIRST) {
    console.log(`[seed] visit_logs 已有 ${existing} 行，跳过灌数据（幂等）。要重灌用 --force 或 --clear`);
    return;
  }
  if (CLEAR_FIRST) await truncate();

  const total = 200 + Math.floor(Math.random() * 200); // 200~400
  const rows: any[] = [];
  for (let i = 0; i < total; i++) {
    const specialRoll = Math.random();
    let province: string;
    let country: string;
    let city: string | null;
    if (specialRoll < 0.06) {
      const s = pick(SPECIAL);
      province = s.province;
      country = s.country;
      city = null;
    } else {
      const p = pickWeighted(PROVINCES, (x) => x.weight);
      province = p.name;
      country = '中国';
      city = CITY_OF[p.name] || null;
    }
    const ip = province === '本地' ? '192.168.' + (1 + Math.floor(Math.random() * 5)) + '.10' : fakeIp(province);
    // 近 30 天，且越近的日期权重越高（更像真实流量）
    const daysAgo = Math.min(29, Math.floor(Math.pow(Math.random(), 1.6) * 30));
    rows.push([
      ip,
      createHash('sha256').update(`${ip}|seed`).digest('hex'),
      province,
      city,
      country,
      pick(PATHS),
      pick(UAS),
      pick(REFERRERS) || null,
      null,
      randomUtcForBeijingDay(daysAgo)
    ]);
  }

  // 一条多值 INSERT 完成（Neon HTTP 一次 query 一次往返，别逐条写）
  const cols = '(ip, ip_hash, province, city, country, path, user_agent, referrer, user_id, created_at)';
  const perChunk = 100;
  for (let start = 0; start < rows.length; start += perChunk) {
    const chunk = rows.slice(start, start + perChunk);
    const placeholders = chunk.map(() => `(?, ?, ?, ?, ?, ?, ?, ?, ?, ?::timestamp)`).join(', ');
    const params: any[] = [];
    for (const r of chunk) params.push(...r);
    await pool.query(`INSERT INTO visit_logs ${cols} VALUES ${placeholders}`, params);
    console.log(`[seed] 已写入 ${Math.min(start + perChunk, rows.length)}/${rows.length} 行`);
  }

  const [stat] = (await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(DISTINCT province)::int AS provinces,
            COUNT(DISTINCT ip_hash)::int AS ips,
            MIN(created_at)::timestamp AS first_at,
            MAX(created_at)::timestamp AS last_at
     FROM visit_logs`
  )) as any[];
  console.log('[seed] 结果:', JSON.stringify(stat?.[0] ?? stat));
  console.log('[seed] 完成 ✅  清理方式: npx ts-node scripts/seed-visit-logs.ts --truncate-only');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[seed] 失败:', e?.message || e);
    process.exit(1);
  });
