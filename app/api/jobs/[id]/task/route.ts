import { redirect } from 'next/navigation';
import { requestHasOwnerToken } from '@/src/lib/auth';
import { updateTaskStatus } from '@/src/lib/operations';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!requestHasOwnerToken(request))
    return Response.json({ error: 'Owner authentication required.' }, { status: 401 });
  const { id } = await context.params;
  const form = await request.formData();
  const taskId = String(form.get('taskId') || '');
  const status = String(form.get('status') || '') as 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';
  const notes = String(form.get('notes') || '');
  if (!taskId || !['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'].includes(status)) {
    return Response.json({ error: 'Invalid task update.' }, { status: 400 });
  }
  try {
    await updateTaskStatus(id, taskId, status, notes);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 409 });
  }
  redirect(`/jobs/${id}`);
}
