import { redirect } from 'next/navigation';
import { requestHasOwnerToken } from '@/src/lib/auth';
import { getStore } from '@/src/lib/store';

export async function POST(request: Request) {
  if (!requestHasOwnerToken(request))
    return Response.json({ error: 'Owner authentication required.' }, { status: 401 });
  const form = await request.formData();
  const parseList = (value: FormDataEntryValue | null) =>
    String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  await getStore().updateSettings({
    minimumBudget: Math.max(0, Number(form.get('minimumBudget') || 0)),
    maximumEstimatedAiMinutes: Math.max(1, Number(form.get('maximumEstimatedAiMinutes') || 240)),
    maximumEstimatedHumanMinutes: Math.max(
      1,
      Number(form.get('maximumEstimatedHumanMinutes') || 90),
    ),
    shortlistScoreThreshold: Math.max(
      0,
      Math.min(100, Number(form.get('shortlistScoreThreshold') || 75)),
    ),
    minimumCompletionProbability: Math.max(
      0,
      Math.min(1, Number(form.get('minimumCompletionProbability') || 0.65)),
    ),
    excludedCategories: parseList(form.get('excludedCategories')),
    allowedCategories: parseList(form.get('allowedCategories')),
    preferredSources: parseList(form.get('preferredSources')),
    preferredCurrencies: parseList(form.get('preferredCurrencies')),
    riskTolerance: String(form.get('riskTolerance') || 'MEDIUM') as 'LOW' | 'MEDIUM' | 'HIGH',
    maxActiveJobs: Math.max(1, Math.min(3, Number(form.get('maxActiveJobs') || 3))),
    githubSearchQuery: String(form.get('githubSearchQuery') || ''),
    githubPerPage: Math.max(1, Math.min(100, Number(form.get('githubPerPage') || 25))),
  });
  redirect('/settings?saved=1');
}
