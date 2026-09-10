import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

type QueryResult = {
  insertId?: number;
  affectedRows: number;
  rowCount: number;
};

type QueryResponse = [any[], QueryResult];

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl || !databaseUrl.startsWith('postgres')) {
  throw new Error(
    'DATABASE_URL must be a PostgreSQL/Neon connection string. Configure it in the environment before starting the backend.'
  );
}

const sql = neon(databaseUrl, { fullResults: true });

const replacePlaceholders = (query: string, params: any[]): string => {
  let parameterIndex = 0;
  let result = '';
  let quote: string | null = null;

  for (let index = 0; index < query.length; index += 1) {
    const character = query[index];

    if (quote) {
      result += character;
      if (character === quote && query[index - 1] !== '\\') {
        quote = null;
      }
      continue;
    }

    if (character === '\'' || character === '"') {
      quote = character;
      result += character;
      continue;
    }

    if (character === '?' && parameterIndex < params.length) {
      parameterIndex += 1;
      result += `$${parameterIndex}`;
      continue;
    }

    result += character;
  }

  return result;
};

const appendReturningId = (query: string): string => {
  if (!/^\s*insert\s+into/i.test(query) || /\breturning\b/i.test(query)) {
    return query;
  }

  const tableMatch = query.match(/^\s*insert\s+into\s+([a-z_]+)/i);
  const tablesWithIds = new Set([
    'users',
    'categories',
    'tags',
    'posts',
    'comments',
    'notifications',
    'games',
    'game_favorites',
    'game_ratings',
    'game_levels',
    'user_level_records',
    'game_stage_configs',
    'sensitive_words',
    'sensitive_word_whitelist',
    'sensitive_word_logs'
  ]);

  if (!tableMatch || !tablesWithIds.has(tableMatch[1].toLowerCase())) {
    return query;
  }

  return `${query.trim()}\nRETURNING id`;
};

const normalizeQuery = (query: string, params: any[]): string => {
  const normalized = replacePlaceholders(query, params);
  return appendReturningId(normalized);
};

const query = async (queryText: string, params: any[] = []): Promise<QueryResponse> => {
  const normalized = normalizeQuery(queryText, params);
  const response = await sql.query(normalized, params);
  const rows = response.rows as any[];
  const result: QueryResult = {
    affectedRows: response.rowCount,
    rowCount: response.rowCount
  };

  if (response.command === 'INSERT' && rows.length > 0 && rows[0]?.id !== undefined) {
    result.insertId = Number(rows[0].id);
  }

  if (response.command === 'SELECT' || response.command === 'SHOW' || response.command === 'WITH') {
    return [rows as any[], result];
  }

  return [result as any, result];
};

const pool = {
  query,
  async getConnection() {
    return {
      query,
      async beginTransaction() {},
      async commit() {},
      async rollback() {},
      release() {}
    };
  }
};

export default pool;
