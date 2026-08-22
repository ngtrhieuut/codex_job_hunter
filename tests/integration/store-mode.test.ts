import { afterEach, describe, expect, it } from 'vitest';
import { getStore, resetStoreForTests } from '@/src/lib/store';

const previousMode = process.env.APP_STORE;
const previousDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  resetStoreForTests();
  if (previousMode === undefined) delete process.env.APP_STORE;
  else process.env.APP_STORE = previousMode;
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

describe('explicit runtime store selection', () => {
  it('fails clearly instead of falling back when postgres mode lacks DATABASE_URL', () => {
    process.env.APP_STORE = 'postgres';
    delete process.env.DATABASE_URL;
    expect(() => getStore()).toThrow('requires DATABASE_URL');
  });

  it('uses JSON only when explicitly selected for tests/local development', () => {
    process.env.APP_STORE = 'json';
    const store = getStore();
    expect(store.constructor.name).toBe('JsonAppStore');
  });
});
