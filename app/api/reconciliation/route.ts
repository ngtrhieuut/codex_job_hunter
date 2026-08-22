import { NextResponse } from 'next/server';
import { reconcileOperationalState } from '@/src/lib/reconciliation';
import { requestHasOwnerToken } from '@/src/lib/auth';

export async function GET(): Promise<Response> {
  const conflicts = await reconcileOperationalState();
  return NextResponse.json({ conflicts, count: conflicts.length });
}

export async function POST(request: Request): Promise<Response> {
  if (!requestHasOwnerToken(request)) {
    return NextResponse.json({ error: 'Owner authorization required.' }, { status: 401 });
  }
  const conflicts = await reconcileOperationalState({ persist: true });
  return NextResponse.json({ conflicts, count: conflicts.length });
}
