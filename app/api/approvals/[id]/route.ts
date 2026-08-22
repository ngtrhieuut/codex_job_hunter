import { redirect } from 'next/navigation';
import { requestHasOwnerToken } from '@/src/lib/auth';
import { decideApproval } from '@/src/lib/operations';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!requestHasOwnerToken(request))
    return Response.json({ error: 'Owner authentication required.' }, { status: 401 });
  const { id } = await context.params;
  const form = await request.formData();
  const decision = String(form.get('decision') || '') as 'APPROVED' | 'REJECTED';
  const note = String(form.get('note') || 'Owner decision recorded.');
  if (!['APPROVED', 'REJECTED'].includes(decision))
    return Response.json({ error: 'Invalid approval decision.' }, { status: 400 });
  try {
    await decideApproval(id, decision, note);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 409 });
  }
  redirect('/');
}
