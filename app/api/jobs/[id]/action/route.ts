import { redirect } from 'next/navigation';
import { requestHasOwnerToken } from '@/src/lib/auth';
import {
  markAccepted,
  markPaid,
  markReadyForReview,
  requestDeliveryApproval,
  saveQaResult,
  startJob,
} from '@/src/lib/operations';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!requestHasOwnerToken(request))
    return Response.json({ error: 'Owner authentication required.' }, { status: 401 });
  const { id } = await context.params;
  const form = await request.formData();
  const action = String(form.get('action') || '');
  try {
    if (action === 'start') await startJob(id);
    else if (action === 'ready_review') await markReadyForReview(id);
    else if (action === 'qa_pass')
      await saveQaResult(
        id,
        true,
        String(form.get('summary') || 'Independent QA passed.'),
        String(form.get('tests') || '')
          .split('\n')
          .map((value) => value.trim())
          .filter(Boolean),
      );
    else if (action === 'qa_fail')
      await saveQaResult(
        id,
        false,
        String(form.get('summary') || 'Independent QA found changes.'),
        String(form.get('tests') || '')
          .split('\n')
          .map((value) => value.trim())
          .filter(Boolean),
      );
    else if (action === 'request_delivery') await requestDeliveryApproval(id);
    else if (action === 'accepted') await markAccepted(id);
    else if (action === 'paid') await markPaid(id, Number(form.get('revenue') || 0));
    else return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 409 });
  }
  redirect(`/jobs/${id}`);
}
