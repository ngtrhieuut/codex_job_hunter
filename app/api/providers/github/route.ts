import { redirect } from 'next/navigation';
import { requestHasOwnerToken } from '@/src/lib/auth';
import { ingestAndPersist } from '@/src/lib/operations';
import { createGithubIssueProvider } from '@/src/providers/github';

export async function POST(request: Request) {
  if (!requestHasOwnerToken(request))
    return Response.json({ error: 'Owner authentication required.' }, { status: 401 });
  const form = await request.formData();
  const query = String(form.get('query') || '').trim();
  const perPage = Math.max(1, Math.min(100, Number(form.get('perPage') || 25)));
  const language = String(form.get('language') || '').trim();
  const effectiveQuery =
    language && !query.toLowerCase().includes('language:')
      ? `${query} language:${language}`
      : query;
  const provider = createGithubIssueProvider(effectiveQuery, perPage);
  try {
    const raw = await provider.discover({ query: effectiveQuery, limit: perPage });
    const result = await ingestAndPersist(raw, 'github');
    redirect(`/opportunities?discovered=${result.records.length}&duplicates=${result.duplicates}`);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
