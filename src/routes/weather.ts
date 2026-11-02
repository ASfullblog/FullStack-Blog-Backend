import express from 'express';
import { getClientIp, isLocalOrPrivateIp, resolveIpLocation } from '../services/ipLocation';

/**
 * 天气接口 —— 供前端「天气实景」主题使用
 *
 * 设计要点：
 * - 后端代理 Open-Meteo（无需 API Key、免费、支持按 IANA 时区返回 is_day）
 * - 用访问者 IP 解析出的城市/省份查坐标（ipLocation 内部已带缓存），解析不到就用默认坐标
 * - 结果内存缓存 10 分钟，同一城市并发只打一次上游；上游失败返回最近一次成功结果或默认值
 * - 永不抛错：前端拿到的永远是 200 + 可用的天气快照
 */

/** 常用城市中文名 → 坐标（ipLocation 返回的是中文城市名，这里只覆盖高频项） */
const CITY_COORDS: Record<string, [number, number]> = {
  北京: [39.9, 116.4],
  上海: [31.23, 121.47],
  广州: [23.13, 113.26],
  深圳: [22.54, 114.06],
  杭州: [30.27, 120.15],
  南京: [32.06, 118.8],
  成都: [30.57, 104.06],
  重庆: [29.56, 106.55],
  武汉: [30.59, 114.31],
  西安: [34.34, 108.94],
  天津: [39.08, 117.2],
  苏州: [31.3, 120.62],
  郑州: [34.75, 113.63],
  长沙: [28.23, 112.94],
  青岛: [36.07, 120.38],
  沈阳: [41.8, 123.43],
  大连: [38.91, 121.6],
  厦门: [24.48, 118.09],
  福州: [26.07, 119.3],
  济南: [36.65, 117.12],
  合肥: [31.82, 117.23],
  南昌: [28.68, 115.86],
  昆明: [25.04, 102.72],
  贵阳: [26.65, 106.63],
  南宁: [22.82, 108.37],
  海口: [20.04, 110.2],
  哈尔滨: [45.8, 126.53],
  长春: [43.82, 125.32],
  石家庄: [38.04, 114.51],
  太原: [37.87, 112.55],
  兰州: [36.06, 103.83],
  西宁: [36.62, 101.78],
  银川: [38.49, 106.23],
  乌鲁木齐: [43.82, 87.62],
  拉萨: [29.65, 91.13],
  呼和浩特: [40.84, 111.75],
  香港: [22.32, 114.17],
  澳门: [22.2, 113.54],
  台北: [25.03, 121.57]
};

/** 省级行政区中心，按省份兜底（城市匹配不到时更不容易错太远） */
const PROVINCE_CENTERS: Record<string, [number, number]> = {
  北京: [39.9, 116.4],
  天津: [39.08, 117.2],
  河北: [38.04, 114.51],
  山西: [37.87, 112.55],
  内蒙古: [40.84, 111.75],
  辽宁: [41.8, 123.43],
  吉林: [43.82, 125.32],
  黑龙江: [45.8, 126.53],
  上海: [31.23, 121.47],
  江苏: [32.06, 118.8],
  浙江: [30.27, 120.15],
  安徽: [31.82, 117.23],
  福建: [26.07, 119.3],
  江西: [28.68, 115.86],
  山东: [36.65, 117.12],
  河南: [34.75, 113.63],
  湖北: [30.59, 114.31],
  湖南: [28.23, 112.94],
  广东: [23.13, 113.26],
  广西: [22.82, 108.37],
  海南: [20.04, 110.2],
  重庆: [29.56, 106.55],
  四川: [30.57, 104.06],
  贵州: [26.65, 106.63],
  云南: [25.04, 102.72],
  西藏: [29.65, 91.13],
  陕西: [34.34, 108.94],
  甘肃: [36.06, 103.83],
  青海: [36.62, 101.78],
  宁夏: [38.49, 106.23],
  新疆: [43.82, 87.62],
  香港: [22.32, 114.17],
  澳门: [22.2, 113.54],
  台湾: [25.03, 121.57]
};

const DEFAULT_COORD: [number, number] = [29.65, 91.13];
const DEFAULT_CITY = '林芝';

interface WeatherPayload {
  code: number;
  temperature: number | null;
  isDay: boolean;
  city: string;
  cloudCover: number;
  precipitation: number;
  updatedAt: number;
}

interface CacheEntry {
  at: number;
  payload: WeatherPayload;
}

const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<WeatherPayload>>();

const router = express.Router();

function pickCoord(city?: string, province?: string): { coord: [number, number]; label: string } {
  if (city) {
    const c = CITY_COORDS[city];
    if (c) return { coord: c, label: city };
    // ip2region 偶尔给出「XX市」或更长的区县名，做一次前缀匹配
    const short = city.replace(/市$/, '');
    if (CITY_COORDS[short]) return { coord: CITY_COORDS[short], label: short };
  }
  if (province && PROVINCE_CENTERS[province]) {
    return { coord: PROVINCE_CENTERS[province], label: city || province };
  }
  return { coord: DEFAULT_COORD, label: city || province || DEFAULT_CITY };
}

async function fetchOpenMeteo(lat: number, lon: number, tz: string): Promise<Omit<WeatherPayload, 'city' | 'updatedAt'>> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
    `&current=temperature_2m,weather_code,is_day,cloud_cover,precipitation&timezone=${encodeURIComponent(tz)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const json: any = await res.json();
    const cur = json?.current ?? {};
    return {
      code: Number(cur.weather_code ?? 3),
      temperature: cur.temperature_2m == null ? null : Number(cur.temperature_2m),
      isDay: Number(cur.is_day ?? 1) === 1,
      cloudCover: Number(cur.cloud_cover ?? 0),
      precipitation: Number(cur.precipitation ?? 0)
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /api/weather/current?tz=Asia/Shanghai
 * 返回：{ code, temperature, isDay, city, cloudCover, precipitation, updatedAt }
 */
router.get('/current', async (req, res) => {
  const tzRaw = String(req.query.tz || '').trim();
  // 只接受形如 Area/Location 的合法时区，非法值回落到服务器时区
  const tz = /^[A-Za-z]+\/[A-Za-z_+\-0-9]+$/.test(tzRaw) ? tzRaw : Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';

  const ip = getClientIp(req);
  let loc: { city?: string; province?: string } = {};
  if (ip && !isLocalOrPrivateIp(ip)) {
    try {
      const resolved = await resolveIpLocation(ip);
      loc = { city: resolved.city, province: resolved.province };
    } catch {
      // 解析失败就退回默认坐标，不影响天气主题
    }
  }

  const { coord, label } = pickCoord(loc.city, loc.province);
  const key = `${coord[0]},${coord[1]},${tz}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL) {
    return res.json({ code: 200, message: 'success', data: hit.payload });
  }

  let task = inflight.get(key);
  if (!task) {
    task = (async () => {
      const base = await fetchOpenMeteo(coord[0], coord[1], tz);
      return { ...base, city: label, updatedAt: now };
    })();
    inflight.set(key, task);
    task.finally(() => inflight.delete(key));
  }

  try {
    const payload = await task;
    cache.set(key, { at: now, payload });
    return res.json({ code: 200, message: 'success', data: payload });
  } catch {
    // 上游失败：有旧缓存就用旧缓存，否则给一个中性默认快照
    const fallback: WeatherPayload =
      hit?.payload ?? {
        code: 2,
        temperature: null,
        isDay: new Date(tz ? new Date().toLocaleString('en-US', { timeZone: tz }) : Date.now()).getHours() >= 6 &&
          new Date(tz ? new Date().toLocaleString('en-US', { timeZone: tz }) : Date.now()).getHours() < 18,
        city: label,
        cloudCover: 30,
        precipitation: 0,
        updatedAt: now
      };
    return res.json({ code: 200, message: 'success', data: fallback });
  }
});

export default router;
