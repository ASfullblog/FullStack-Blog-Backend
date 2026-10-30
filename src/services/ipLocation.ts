/**
 * IP → 省/市/国家 解析服务（可插拔 provider + 缓存 + 超时降级）
 *
 * 设计要点（详见汇报）：
 * - provider 有三种模式，由环境变量 IP_LOCATION_PROVIDER 控制：
 *     offline  仅用 npm 包 ip2region@4.0.1 自带的 xdb 数据（推荐默认：无外网依赖、无限流、微秒级）
 *     online   仅用在线接口（pconline 优先，其次 ip-api）
 *     hybrid   先 offline，未命中再 online（默认值）
 * - 内网 / 回环 IP 直接标记为「本地」，绝不发起解析。
 * - 解析失败 / 超时 → province='未知'，永不抛错、永不阻塞调用方。
 * - 缓存：内存 Map（含负缓存）+ 可选 DB 表 ip_cache（写入 fire-and-forget）。
 * - 同一 IP 并发只解析一次（in-flight 去重）。
 * - 输出统一归一化成前端使用的省级简称（广东 / 内蒙古 / 香港 …），海外则回填国家中文名。
 * - 不依赖 Express 的 trust proxy：请用本文件的 getClientIp(req) 读 X-Forwarded-For。
 */
import type { Request } from 'express';
import pool from '../config/database';

export interface IpLocation {
  province?: string;
  city?: string;
  country?: string;
}

export type IpLocationProviderName = 'offline' | 'online' | 'hybrid' | 'ip-api' | 'pconline';

export interface ResolvedIpLocation extends IpLocation {
  /** 实际命中的 provider，便于排查；未解析时为 none/local-private */
  provider: IpLocationProviderName | 'none' | 'local';
}

/* ------------------------------------------------------------------ *
 * 常量表：34 个省级行政区 + 英文/异名 → 中文简称
 * ------------------------------------------------------------------ */

/** 前端 provinceCoords.ts 使用的规范简称，必须保持一致 */
const CN_PROVINCES = [
  '北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江',
  '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南',
  '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州',
  '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆',
  '香港', '澳门', '台湾'
];

/** 按长度倒序，保证「内蒙古」「黑龙江」优先于短前缀匹配 */
const CN_PROVINCES_BY_LEN = [...CN_PROVINCES].sort((a, b) => b.length - a.length);

/** ip-api / xdb 里可能出现的英文名 → 中文简称 */
const EN_PROVINCE_MAP: Record<string, string> = {
  anhui: '安徽', beijing: '北京', chongqing: '重庆', fujian: '福建', gansu: '甘肃',
  guangdong: '广东', guangxi: '广西', guizhou: '贵州', hainan: '海南', hebei: '河北',
  heilongjiang: '黑龙江', henan: '河南', hong: '香港', 'hong kong': '香港',
  hubei: '湖北', hunan: '湖南', inner: '内蒙古', 'inner mongolia': '内蒙古',
  jiangsu: '江苏', jiangxi: '江西', jilin: '吉林', jilin1: '吉林', jixi: '吉林',
  liaoning: '辽宁', macao: '澳门', 'macau': '澳门', ningxia: '宁夏', qinghai: '青海',
  shaanxi: '陕西', shandong: '山东', shanghai: '上海', shanxi: '山西', sichuan: '四川',
  tianjin: '天津', 'tibet': '西藏', xinjiang: '新疆', yunnan: '云南', zhejiang: '浙江',
  taiwan: '台湾', guangdongprovince: '广东'
};

/** 常见国家英文名 → 中文（海外访问按国家聚合展示） */
const EN_COUNTRY_MAP: Record<string, string> = {
  china: '中国', unitedstates: '美国', 'united states': '美国', usa: '美国', us: '美国',
  japan: '日本', 'south korea': '韩国', korea: '韩国', singapore: '新加坡',
  unitedkingdom: '英国', 'united kingdom': '英国', uk: '英国', england: '英国',
  germany: '德国', france: '法国', canada: '加拿大', australia: '澳大利亚',
  russia: '俄罗斯', india: '印度', brazil: '巴西', thailand: '泰国', vietnam: '越南',
  malaysia: '马来西亚', italy: '意大利', spain: '西班牙', netherlands: '荷兰',
  switzerland: '瑞士', sweden: '瑞典', norway: '挪威', denmark: '丹麦', finland: '芬兰',
  poland: '波兰', turkey: '土耳其', mexico: '墨西哥', argentina: '阿根廷',
  newzealand: '新西兰', 'new zealand': '新西兰', philippines: '菲律宾',
  indonesia: '印度尼西亚', 'unitedarabemirates': '阿联酋', uae: '阿联酋'
};

/** 去掉行政区划后缀，得到规范简称 */
export const normalizeProvince = (raw?: string | null): string | undefined => {
  const s = (raw || '').trim();
  if (!s) return undefined;

  // 1) 直接命中规范简称
  if (CN_PROVINCES.includes(s)) return s;

  // 2) 中文全称 / 带后缀：取最长前缀匹配（广东省→广东，内蒙古自治区→内蒙古）
  for (const p of CN_PROVINCES_BY_LEN) {
    if (s.startsWith(p)) return p;
  }

  // 3) 英文名（去空格/连字符/下划线后查表）
  const en = s.toLowerCase().replace(/[\s._-]/g, '').replace(/province|state|region|prefecture/g, '');
  if (EN_PROVINCE_MAP[en]) return EN_PROVINCE_MAP[en];
  const spaced = s.toLowerCase().trim();
  if (EN_PROVINCE_MAP[spaced]) return EN_PROVINCE_MAP[spaced];

  // 4) 兜底：剥掉常见后缀后再试一次
  const stripped = s
    .replace(/(壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市|地区|盟|自治州|自治县)$/u, '')
    .trim();
  if (stripped && stripped !== s) {
    if (CN_PROVINCES.includes(stripped)) return stripped;
    for (const p of CN_PROVINCES_BY_LEN) {
      if (stripped.startsWith(p)) return p;
    }
  }

  return undefined;
};

/** 国家名归一化：中国 / 英文国家名 → 中文；非中国返回中文国名（未知名原样返回） */
const normalizeCountry = (raw?: string | null): string | undefined => {
  const s = (raw || '').trim();
  if (!s) return undefined;
  if (s.includes('中国') || /^cn$/i.test(s)) return '中国';
  const en = s.toLowerCase().replace(/[\s._-]/g, '');
  if (EN_COUNTRY_MAP[en]) return EN_COUNTRY_MAP[en];
  if (EN_COUNTRY_MAP[s.toLowerCase()]) return EN_COUNTRY_MAP[s.toLowerCase()];
  return s;
};

/* ------------------------------------------------------------------ *
 * 客户端 IP 提取（不依赖 trust proxy）
 * ------------------------------------------------------------------ */

const cleanIp = (raw?: string | null): string => {
  let ip = (raw || '').trim();
  if (!ip) return '';
  // XFF 可能是 "1.2.3.4, 5.6.7.8"
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  // IPv6-mapped IPv4：::ffff:1.2.3.4 → 1.2.3.4
  if (/^::ffff:/i.test(ip)) ip = ip.replace(/^::ffff:/i, '');
  // IPv6 loopback 简写
  if (ip === '::1') ip = '127.0.0.1';
  // 去掉 IPv6 zone id
  ip = ip.replace(/%[0-9a-z]+$/i, '');
  return ip;
};

/** 从请求中取真实客户端 IP（Vercel / Nginx 之后优先 X-Forwarded-For） */
export const getClientIp = (req: Request | any): string => {
  const headers = req?.headers || {};
  const fromHeaders =
    headers['x-forwarded-for'] ||
    headers['x-real-ip'] ||
    headers['cf-connecting-ip'] ||
    headers['x-client-ip'] ||
    headers['true-client-ip'];
  const single = Array.isArray(fromHeaders) ? fromHeaders[0] : fromHeaders;
  const ip = cleanIp(single) || cleanIp(req?.ip) || cleanIp(req?.socket?.remoteAddress);
  return ip;
};

/** 内网 / 回环 / 保留地址：不参与解析，也不作为独立访客统计 */
export const isLocalOrPrivateIp = (ip: string): boolean => {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.')) return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true;
  if (/^(0\.){3}0$/.test(ip) || ip === 'localhost') return true;
  return false;
};

/** 对外展示用的脱敏 IP（接口/日志只用这个，绝不输出明文完整 IP） */
export const maskIp = (ip: string): string => {
  if (!ip) return '未知';
  if (ip.includes(':')) return `${ip.split(':').slice(0, 2).join(':')}:*`;
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.*`;
  return '未知';
};

/* ------------------------------------------------------------------ *
 * provider 抽象
 * ------------------------------------------------------------------ */

interface Provider {
  name: IpLocationProviderName;
  resolve(ip: string): Promise<IpLocation | null>;
}

/** 带超时的 fetch（默认 3s，超时即视为失败并降级） */
const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const TIMEOUT_MS = Number(process.env.IP_GEO_TIMEOUT_MS || 3000);

const fetchJson = async (url: string, asGbk = false): Promise<any> => {
  const res = await withTimeout(
    fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BlogStatsBot/1.0)' }
    }),
    TIMEOUT_MS,
    `fetch ${url.slice(0, 40)}`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await withTimeout(res.arrayBuffer(), TIMEOUT_MS, 'body'));
  if (asGbk) {
    // pconline 返回 GBK；Node 内置 TextDecoder 支持（full-icu），失败退回 utf-8
    try {
      return JSON.parse(new TextDecoder('gbk').decode(buf));
    } catch {
      return JSON.parse(buf.toString('utf8'));
    }
  }
  return JSON.parse(buf.toString('utf8'));
};

/** provider: ip2region 离线库（npm 包内自带 xdb，无外网依赖） */
let xdbInstance: any = null;
let xdbLoadFailed = false;
const offlineProvider: Provider = {
  name: 'offline',
  async resolve(ip: string): Promise<IpLocation | null> {
    if (xdbLoadFailed) return null;
    try {
      if (!xdbInstance) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require('ip2region/node');
        xdbInstance = new mod.IP2Region({ families: [4], mappedIPv6: 'ipv4' });
      }
      const r = xdbInstance.lookup(ip);
      if (!r) return null;
      const country = normalizeCountry(r.country?.name || r.country?.code);
      const rawProvince = r.subdivisions?.[0]?.name;
      const province = normalizeProvince(rawProvince);
      if (country && country !== '中国' && !province) {
        // 海外：以国家作为聚合维度
        return { province: undefined, city: undefined, country };
      }
      if (country && country !== '中国') {
        // 海外：province 用中文国名，前端按「海外·国家」展示
        return { province: country, city: r.city?.name, country };
      }
      if (!province) return null;
      return { province, city: r.city?.name, country: '中国' };
    } catch (e: any) {
      if (e?.code === 'UNSUPPORTED_FAMILY' || e?.code === 'FILE_NOT_FOUND' || e?.code === 'INVALID_DATABASE') {
        xdbLoadFailed = true;
      }
      return null;
    }
  }
};

/** provider: 纯真 whois（返回中文省份，无需英文映射） */
const pconlineProvider: Provider = {
  name: 'pconline',
  async resolve(ip: string): Promise<IpLocation | null> {
    try {
      const data = await fetchJson(`https://whois.pconline.com.cn/ipJson.jsp?ip=${ip}&json=true`, true);
      const province = normalizeProvince(data?.pro);
      if (!province) return null;
      return { province, city: data?.city || undefined, country: normalizeCountry(data?.pro ? '中国' : '') };
    } catch {
      return null;
    }
  }
};

/** provider: ip-api 免费接口（英文省份 → 中文映射；限 45 次/分钟） */
const ipApiProvider: Provider = {
  name: 'ip-api',
  async resolve(ip: string): Promise<IpLocation | null> {
    try {
      const data = await fetchJson(
        `http://ip-api.com/json/${ip}?fields=status,country,regionName,city,countryCode`
      );
      if (data?.status !== 'success') return null;
      const country = normalizeCountry(data.country || data.countryCode);
      const province = normalizeProvince(data.regionName);
      if (country && country !== '中国') return { province: country || undefined, city: data.city, country };
      if (!province) return null;
      return { province, city: data.city, country: '中国' };
    } catch {
      return null;
    }
  }
};

/** online = pconline 优先，其次 ip-api */
const onlineProvider: Provider = {
  name: 'online',
  async resolve(ip: string): Promise<IpLocation | null> {
    return (await pconlineProvider.resolve(ip)) || (await ipApiProvider.resolve(ip));
  }
};

const PROVIDERS: Record<string, Provider> = {
  offline: offlineProvider,
  online: onlineProvider,
  hybrid: {
    name: 'hybrid',
    async resolve(ip: string) {
      return (await offlineProvider.resolve(ip)) || (await onlineProvider.resolve(ip));
    }
  }
};

export const getProviderMode = (): string => {
  const mode = (process.env.IP_LOCATION_PROVIDER || 'hybrid').trim().toLowerCase();
  return PROVIDERS[mode] ? mode : 'hybrid';
};

/* ------------------------------------------------------------------ *
 * 缓存：内存 Map（含负缓存）+ 可选 ip_cache 表
 * ------------------------------------------------------------------ */

const CACHE_TTL_MS = Number(process.env.IP_GEO_CACHE_TTL_MS || 24 * 60 * 60 * 1000);
const NEGATIVE_TTL_MS = Number(process.env.IP_GEO_NEGATIVE_TTL_MS || 10 * 60 * 1000);
const DB_CACHE_ENABLED = String(process.env.IP_GEO_DB_CACHE ?? '1') !== '0';
const MEMORY_MAX = 20000;

interface CacheEntry {
  value: ResolvedIpLocation;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ResolvedIpLocation>>();

const memGet = (ip: string): ResolvedIpLocation | undefined => {
  const hit = memoryCache.get(ip);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    memoryCache.delete(ip);
    return undefined;
  }
  return hit.value;
};

const memSet = (ip: string, value: ResolvedIpLocation) => {
  if (memoryCache.size >= MEMORY_MAX) {
    // 简单防膨胀：淘汰最早插入的一半（Map 保持插入序）
    const cut = Math.floor(MEMORY_MAX / 2);
    let i = 0;
    for (const key of memoryCache.keys()) {
      memoryCache.delete(key);
      if (++i >= cut) break;
    }
  }
  const ttl = value.provider === 'none' ? NEGATIVE_TTL_MS : CACHE_TTL_MS;
  memoryCache.set(ip, { value, expiresAt: Date.now() + ttl });
};

const dbGet = async (ip: string): Promise<ResolvedIpLocation | undefined> => {
  if (!DB_CACHE_ENABLED) return undefined;
  try {
    const [rows] = (await withTimeout(
      pool.query(
        `SELECT province, city, country, provider FROM ip_cache
         WHERE ip = ? AND resolved_at > (NOW() - ($2 || ' days')::interval)`,
        [ip, Math.floor(CACHE_TTL_MS / 86400000) || 1]
      ),
      TIMEOUT_MS + 1000,
      'ip_cache read'
    )) as any[];
    const row = rows?.[0];
    if (!row) return undefined;
    return {
      province: row.province || undefined,
      city: row.city || undefined,
      country: row.country || undefined,
      provider: (row.provider || 'none') as any
    };
  } catch {
    return undefined;
  }
};

/** fire-and-forget 落库，绝不 await、绝不抛错 */
const dbSet = (ip: string, value: ResolvedIpLocation) => {
  if (!DB_CACHE_ENABLED) return;
  void (async () => {
    try {
      await pool.query(
        `INSERT INTO ip_cache (ip, province, city, country, provider, resolved_at)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON CONFLICT (ip) DO UPDATE
         SET province = EXCLUDED.province,
             city = EXCLUDED.city,
             country = EXCLUDED.country,
             provider = EXCLUDED.provider,
             resolved_at = NOW(),
             hits = ip_cache.hits + 1`,
        [ip, value.province ?? null, value.city ?? null, value.country ?? null, value.provider]
      );
    } catch {
      /* 静默：缓存表不可用不影响主流程 */
    }
  })();
};

/* ------------------------------------------------------------------ *
 * 对外主入口
 * ------------------------------------------------------------------ */

const UNKNOWN: ResolvedIpLocation = { province: '未知', provider: 'none' };

const resolveUncached = async (ip: string): Promise<ResolvedIpLocation> => {
  const provider = PROVIDERS[getProviderMode()];
  const loc = await provider.resolve(ip);
  if (!loc) return UNKNOWN;
  const value: ResolvedIpLocation = {
    province: loc.province || '未知',
    city: loc.city,
    country: loc.country,
    provider: loc.province ? provider.name : 'none'
  };
  return value;
};

/**
 * 解析 IP 归属地。永不抛错：失败返回 { province: '未知', provider: 'none' }。
 * 命中缓存（内存 → DB）时不发起任何网络/解析。
 */
export const resolveIpLocation = async (ip: string): Promise<ResolvedIpLocation> => {
  const clean = cleanIp(ip);
  if (!clean || isLocalOrPrivateIp(clean)) {
    return { province: '本地', city: undefined, country: '本地', provider: 'local' };
  }

  const cached = memGet(clean);
  if (cached) return cached;

  const pending = inFlight.get(clean);
  if (pending) return pending;

  const task = (async () => {
    try {
      const fromDb = await dbGet(clean);
      if (fromDb) {
        memSet(clean, fromDb);
        return fromDb;
      }
      const fresh = await resolveUncached(clean);
      memSet(clean, fresh);
      dbSet(clean, fresh);
      return fresh;
    } catch {
      const fallback = UNKNOWN;
      memSet(clean, fallback);
      return fallback;
    }
  })();

  inFlight.set(clean, task);
  try {
    return await task;
  } finally {
    inFlight.delete(clean);
  }
};

/** 便于测试 / 清缓存 */
export const clearIpLocationCache = () => {
  memoryCache.clear();
};

export const getIpLocationCacheSize = () => memoryCache.size;

export default resolveIpLocation;
