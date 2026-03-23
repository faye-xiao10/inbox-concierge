import { neon } from '@neondatabase/serverless';

/**
 * Run once before migrations to ensure required Postgres extensions exist.
 * Safe to re-run (uses IF NOT EXISTS).
 */
export async function setupExtensions(): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
}
