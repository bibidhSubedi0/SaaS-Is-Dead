import { Pool } from 'pg';

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://flashmind:flashmind@127.0.0.1:5432/flashmind',
  max: 10,
});