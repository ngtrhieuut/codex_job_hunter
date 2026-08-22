import { redirect } from 'next/navigation';
import { importOpportunities } from '@/src/domain/import';
import { requestHasOwnerToken } from '@/src/lib/auth';
import { ingestAndPersist } from '@/src/lib/operations';

export async function POST(request: Request) {
  if (!requestHasOwnerToken(request))
    return Response.json({ error: 'Owner authentication required.' }, { status: 401 });
  const form = await request.formData();
  const format = String(form.get('format') || 'csv') as 'csv' | 'json';
  const source = String(form.get('source') || 'manual');
  const payload = String(form.get('payload') || '');
  const parsed = importOpportunities(payload, { format, requireDescription: true });
  if (!parsed.valid)
    return Response.json({ format, errors: parsed.errors, imported: 0 }, { status: 400 });
  const result = await ingestAndPersist(parsed.records, source);
  redirect(
    `/opportunities?imported=${result.scored + result.hardRejected}&duplicates=${result.duplicates}`,
  );
}
