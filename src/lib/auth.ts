import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function ownerAuthEnabled(): boolean {
  return Boolean(process.env.APP_OWNER_TOKEN);
}

export async function isOwnerSession(): Promise<boolean> {
  const configured = process.env.APP_OWNER_TOKEN;
  if (!configured) return process.env.NODE_ENV !== 'production';
  const cookie = (await cookies()).get('owner_session')?.value;
  if (!cookie) return false;
  const expected = Buffer.from(digest(configured));
  const actual = Buffer.from(cookie);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function requestHasOwnerToken(request: Request): boolean {
  const configured = process.env.APP_OWNER_TOKEN;
  if (!configured) return process.env.NODE_ENV !== 'production';
  const supplied = request.headers.get('x-owner-token');
  if (supplied && supplied === configured) return true;
  const cookieValue = request.headers
    .get('cookie')
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('owner_session='))
    ?.slice('owner_session='.length);
  if (!cookieValue) return false;
  const expected = Buffer.from(digest(configured));
  const actual = Buffer.from(cookieValue);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function ownerSessionValue(): string {
  if (!process.env.APP_OWNER_TOKEN) throw new Error('APP_OWNER_TOKEN is not configured.');
  return digest(process.env.APP_OWNER_TOKEN);
}
