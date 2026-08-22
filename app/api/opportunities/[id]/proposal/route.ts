import { redirect } from 'next/navigation';
import { requestHasOwnerToken } from '@/src/lib/auth';
import { buildProposalDraft } from '@/src/lib/proposal';
import { getStore } from '@/src/lib/store';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!requestHasOwnerToken(request))
    return Response.json({ error: 'Owner authentication required.' }, { status: 401 });
  const { id } = await context.params;
  const opportunity = await getStore().getOpportunity(id);
  if (!opportunity) return Response.json({ error: 'Opportunity not found.' }, { status: 404 });
  await getStore().saveProposal(buildProposalDraft(opportunity));
  redirect(`/opportunities/${id}`);
}
