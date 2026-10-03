import pg from 'pg';
import { env } from '../config/env.js';

let pool = null;

export function isPostgresConfigured() {
  return Boolean(env.postgres.url);
}

export function getDbStatus() {
  return {
    configured: isPostgresConfigured(),
    backend: isPostgresConfigured() ? 'postgres' : 'disabled',
  };
}

function getPool() {
  if (!isPostgresConfigured()) {
    const error = new Error('WhatsApp CRM PostgreSQL connection is not configured');
    error.code = 'WHATSAPP_CRM_POSTGRES_NOT_CONFIGURED';
    error.statusCode = 503;
    throw error;
  }

  if (!pool) {
    pool = new pg.Pool({
      connectionString: env.postgres.url,
      max: env.postgres.poolMax,
      idleTimeoutMillis: env.postgres.idleTimeoutMs,
      connectionTimeoutMillis: env.postgres.connectionTimeoutMs,
    });
  }

  return pool;
}

export async function query(text, params = []) {
  return getPool().query(text, params);
}

export async function transaction(work) {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
