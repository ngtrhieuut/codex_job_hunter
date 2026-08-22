import { redirect } from 'next/navigation';
import { requestHasOwnerToken } from '@/src/lib/auth';
import {
  markLost,
  markWon,
  recordManualApplication,
  rejectOpportunity,
  requestApplyApproval,
  shortlistOpportunity,
} from '@/src/lib/operations';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!requestHasOwnerToken(request))
    return Response.json({ error: 'Owner authentication required.' }, { status: 401 });
  const { id } = await context.params;
  const action = String((await request.formData()).get('action') || '');
  try {
    if (action === 'shortlist') await shortlistOpportunity(id);
    else if (action === 'reject') await rejectOpportunity(id);
    else if (action === 'request_apply') await requestApplyApproval(id);
    else if (action === 'record_application') await recordManualApplication(id);
    else if (action === 'lost') await markLost(id);
    else if (action === 'won') await markWon(id);
    else return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 409 });
  }
  redirect(`/opportunities/${id}`);
}
