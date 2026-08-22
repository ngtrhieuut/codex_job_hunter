import Link from 'next/link';
import { getStore } from '@/src/lib/store';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const settings = await getStore().getSettings();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>
            Owner-editable thresholds. Changes affect future ingestion/scoring; historical snapshots
            remain immutable.
          </p>
        </div>
        <Link className="button secondary" href="/">
          Dashboard
        </Link>
      </div>
      <section className="panel">
        <form action="/api/settings" method="post" className="form-grid">
          <div className="field">
            <label htmlFor="minimumBudget">Minimum budget (USD)</label>
            <input
              id="minimumBudget"
              name="minimumBudget"
              type="number"
              min="0"
              step="1"
              defaultValue={settings.minimumBudget}
            />
          </div>
          <div className="field">
            <label htmlFor="shortlistScoreThreshold">Shortlist score threshold</label>
            <input
              id="shortlistScoreThreshold"
              name="shortlistScoreThreshold"
              type="number"
              min="0"
              max="100"
              step="1"
              defaultValue={settings.shortlistScoreThreshold}
            />
          </div>
          <div className="field">
            <label htmlFor="maximumEstimatedAiMinutes">Maximum estimated AI minutes</label>
            <input
              id="maximumEstimatedAiMinutes"
              name="maximumEstimatedAiMinutes"
              type="number"
              min="1"
              defaultValue={settings.maximumEstimatedAiMinutes}
            />
          </div>
          <div className="field">
            <label htmlFor="maximumEstimatedHumanMinutes">Maximum human minutes</label>
            <input
              id="maximumEstimatedHumanMinutes"
              name="maximumEstimatedHumanMinutes"
              type="number"
              min="1"
              defaultValue={settings.maximumEstimatedHumanMinutes}
            />
          </div>
          <div className="field">
            <label htmlFor="minimumCompletionProbability">
              Minimum completion probability (0–1)
            </label>
            <input
              id="minimumCompletionProbability"
              name="minimumCompletionProbability"
              type="number"
              min="0"
              max="1"
              step="0.01"
              defaultValue={settings.minimumCompletionProbability}
            />
          </div>
          <div className="field">
            <label htmlFor="maxActiveJobs">Max IN_PROGRESS jobs (1–3)</label>
            <input
              id="maxActiveJobs"
              name="maxActiveJobs"
              type="number"
              min="1"
              max="3"
              defaultValue={settings.maxActiveJobs}
            />
          </div>
          <div className="field">
            <label htmlFor="riskTolerance">Risk tolerance</label>
            <select id="riskTolerance" name="riskTolerance" defaultValue={settings.riskTolerance}>
              <option>LOW</option>
              <option>MEDIUM</option>
              <option>HIGH</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="githubPerPage">GitHub results per discovery</label>
            <input
              id="githubPerPage"
              name="githubPerPage"
              type="number"
              min="1"
              max="100"
              defaultValue={settings.githubPerPage}
            />
          </div>
          <div className="field full">
            <label htmlFor="allowedCategories">
              Allowed categories (comma-separated; blank = all)
            </label>
            <input
              id="allowedCategories"
              name="allowedCategories"
              defaultValue={settings.allowedCategories.join(', ')}
            />
          </div>
          <div className="field full">
            <label htmlFor="excludedCategories">Excluded categories</label>
            <input
              id="excludedCategories"
              name="excludedCategories"
              defaultValue={settings.excludedCategories.join(', ')}
            />
          </div>
          <div className="field">
            <label htmlFor="preferredSources">Preferred sources</label>
            <input
              id="preferredSources"
              name="preferredSources"
              defaultValue={settings.preferredSources.join(', ')}
            />
          </div>
          <div className="field">
            <label htmlFor="preferredCurrencies">Preferred currencies</label>
            <input
              id="preferredCurrencies"
              name="preferredCurrencies"
              defaultValue={settings.preferredCurrencies.join(', ')}
            />
          </div>
          <div className="field full">
            <label htmlFor="githubSearchQuery">Default GitHub search query</label>
            <input
              id="githubSearchQuery"
              name="githubSearchQuery"
              defaultValue={settings.githubSearchQuery}
            />
          </div>
          <div className="form-actions field full">
            <button type="submit">Save settings</button>
          </div>
        </form>
      </section>
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="callout warning">
          <strong>Security:</strong> set <span className="code">APP_OWNER_TOKEN</span> before
          exposing the app outside a private local environment. Set{' '}
          <span className="code">GITHUB_TOKEN</span> only through environment configuration; never
          commit it.
        </div>
      </section>
    </>
  );
}
