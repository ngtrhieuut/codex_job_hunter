import { redirect } from 'next/navigation';
import { requestHasOwnerToken } from '@/src/lib/auth';
import { ingestAndPersist } from '@/src/lib/operations';

export async function POST(request: Request) {
  if (!requestHasOwnerToken(request))
    return Response.json({ error: 'Owner authentication required.' }, { status: 401 });
  const form = await request.formData();
  const metadataText = String(form.get('metadata') || '').trim();
  let metadata: unknown = {};
  if (metadataText) {
    try {
      metadata = JSON.parse(metadataText);
    } catch {
      return Response.json({ error: 'Raw metadata must be valid JSON.' }, { status: 400 });
    }
  }
  const result = await ingestAndPersist([
    {
      source: String(form.get('source') || 'manual'),
      externalId: String(form.get('externalId') || '').trim() || undefined,
      sourceUrl: String(form.get('sourceUrl') || '').trim() || undefined,
      title: String(form.get('title') || ''),
      description: String(form.get('description') || ''),
      budgetMin: String(form.get('budgetMin') || '').trim() || undefined,
      budgetMax: String(form.get('budgetMax') || '').trim() || undefined,
      currency: 'USD',
      category: String(form.get('category') || '').trim() || undefined,
      deadline: String(form.get('deadline') || '').trim() || undefined,
      technologies: String(form.get('technologies') || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      metadata,
    },
  ]);
  if (result.errors.length) return Response.json(result, { status: 400 });
  redirect('/opportunities');
}
