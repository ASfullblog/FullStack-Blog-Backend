/**
 * 建表脚本（幂等）：visit_logs 访问日志表 + ip_cache 解析缓存表
 *
 * 用法：
 *   npx ts-node scripts/init-visit-logs.ts          # 建表（幂等，重复执行安全）
 *   npx ts-node scripts/init-visit-logs.ts --check  # 只查现状，不写入
 *
 * DDL 的唯一来源是 src/middleware/visitTracker.ts 导出的 VISIT_LOGS_DDL，
 * 应用启动时也可以安全执行（见 visitTracker.ts 的 ensureVisitSchema()）。
 */
import pool from '../src/config/database';
import { VISIT_LOGS_DDL } from '../src/middleware/visitTracker';

const checkOnly = process.argv.includes('--check');

async function main() {
  console.log('[init-visit-logs] 连接数据库成功，开始检查表结构');

  // 1) 现状
  const [tables] = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('visit_logs', 'ip_cache')
     ORDER BY table_name`
  ) as any[];
  const existing = (tables || []).map((r: any) => r.table_name);
  console.log('[init-visit-logs] 已存在目标表:', existing.length ? existing.join(', ') : '（无）');

  if (existing.includes('visit_logs')) {
    const [cnt] = await pool.query('SELECT COUNT(*)::int AS n FROM visit_logs') as any[];
    console.log(`[init-visit-logs] visit_logs 现有行数 = ${cnt?.n}`);
  }

  if (checkOnly) {
    console.log('[init-visit-logs] --check 模式，未执行任何写入');
    return;
  }

  // 2) 逐条执行幂等 DDL（Neon HTTP 驱动无事务，一条一次往返）
  for (const ddl of VISIT_LOGS_DDL) {
    const head = ddl.replace(/\s+/g, ' ').slice(0, 72);
    try {
      await pool.query(ddl);
      console.log('[DDL OK]', head, '...');
    } catch (e: any) {
      console.error('[DDL FAIL]', head, '...', e?.message || e);
      throw e;
    }
  }

  // 3) 复核
  const [cols] = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'visit_logs' ORDER BY ordinal_position`
  ) as any[];
  console.log('[init-visit-logs] visit_logs 列:', (cols || []).map((c: any) => `${c.column_name}:${c.data_type}`).join(', '));

  const [idx] = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE tablename IN ('visit_logs','ip_cache') ORDER BY indexname`
  ) as any[];
  console.log('[init-visit-logs] 索引:', (idx || []).map((i: any) => i.indexname).join(', '));
  console.log('[init-visit-logs] 完成 ✅');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[init-visit-logs] 失败:', e?.message || e);
    process.exit(1);
  });
