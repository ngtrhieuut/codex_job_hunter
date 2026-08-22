import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;

async function main(): Promise<void> {
  if (!databaseUrl) {
    console.log('DATABASE_URL is not set; local JSON mode does not require migrations.');
    return;
  }
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const migrationPath = path.join(process.cwd(), 'db', 'migrations', '0001_initial.sql');
    const migration = await readFile(migrationPath, 'utf8');
    await sql.unsafe(migration);
    console.log(`Applied ${migrationPath}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main();
