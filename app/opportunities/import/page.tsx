import Link from 'next/link';

export default function ImportPage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Import opportunities</h1>
          <p>
            Upload is intentionally paste-based in the MVP: CSV or JSON is validated server-side and
            never executed.
          </p>
        </div>
        <Link className="button secondary" href="/opportunities">
          Back to inbox
        </Link>
      </div>
      <section className="panel">
        <form action="/api/opportunities/import" method="post" className="form-grid">
          <div className="field">
            <label htmlFor="format">Format</label>
            <select id="format" name="format">
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="source">Default source</label>
            <input id="source" name="source" defaultValue="manual" />
          </div>
          <div className="field full">
            <label htmlFor="payload">CSV / JSON payload *</label>
            <textarea
              id="payload"
              name="payload"
              required
              style={{ minHeight: 330 }}
              placeholder={
                'CSV example:\ntitle,description,budget_min,budget_max,currency,source_url\nFix parser,"Fix the parser and add tests",150,300,USD,https://example.com/job\n\nJSON example:\n[{"title":"Fix parser","description":"Add tests","budget_max":300}]'
              }
            ></textarea>
          </div>
          <div className="form-actions field full">
            <Link className="button secondary" href="/opportunities">
              Cancel
            </Link>
            <button type="submit">Validate, dedupe and score</button>
          </div>
        </form>
      </section>
      <section className="panel" style={{ marginTop: 18 }}>
        <h2>Accepted fields</h2>
        <p className="small muted">
          title, description/original_description, source, external_id, source_url, budget_min,
          budget_max, currency, category, technologies, deadline/explicit_deadline, posted_at.
          Unknown JSON fields are retained in raw metadata.
        </p>
      </section>
    </>
  );
}
