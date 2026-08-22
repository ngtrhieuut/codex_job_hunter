import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;

async function main(): Promise<void> {
  if (!databaseUrl) {
    console.log('DATABASE_URL is not set; APP_STORE=json local mode does not require migrations.');
    return;
  }
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const migrationDirectory = path.join(process.cwd(), 'db', 'migrations');
    const migrationNames = (await readdir(migrationDirectory))
      .filter((name) => name.endsWith('.sql'))
      .sort();
    for (const migrationName of migrationNames) {
      const migrationPath = path.join(migrationDirectory, migrationName);
      const migration = await readFile(migrationPath, 'utf8');
      await sql.unsafe(migration);
      console.log(`Applied ${migrationPath}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main();
