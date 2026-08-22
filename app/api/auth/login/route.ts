import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { ownerSessionValue } from '@/src/lib/auth';

export async function POST(request: Request) {
  const configured = process.env.APP_OWNER_TOKEN;
  if (!configured)
    return Response.json({ error: 'APP_OWNER_TOKEN is not configured.' }, { status: 400 });
  const token = String((await request.formData()).get('token') || '');
  const actual = Buffer.from(token);
  const expected = Buffer.from(configured);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return Response.json({ error: 'Invalid owner token.' }, { status: 401 });
  (await cookies()).set('owner_session', ownerSessionValue(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return Response.redirect(new URL('/', request.url));
}
