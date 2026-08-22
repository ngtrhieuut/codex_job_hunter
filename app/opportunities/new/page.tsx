import Link from 'next/link';

export default function NewOpportunityPage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Add opportunity</h1>
          <p>
            Manual entry remains the safest source. External commitments are never made by this
            form.
          </p>
        </div>
        <Link className="button secondary" href="/opportunities">
          Back to inbox
        </Link>
      </div>
      <section className="panel">
        <form action="/api/opportunities" method="post" className="form-grid">
          <div className="field">
            <label htmlFor="title">Title *</label>
            <input
              id="title"
              name="title"
              required
              placeholder="Fix CSV import validation in a Next.js app"
            />
          </div>
          <div className="field">
            <label htmlFor="source">Source *</label>
            <select id="source" name="source" defaultValue="manual">
              <option value="manual">manual</option>
              <option value="github">github</option>
              <option value="other">other</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="sourceUrl">Source URL</label>
            <input id="sourceUrl" name="sourceUrl" type="url" placeholder="https://..." />
          </div>
          <div className="field">
            <label htmlFor="externalId">External ID</label>
            <input
              id="externalId"
              name="externalId"
              placeholder="Optional stable source identifier"
            />
          </div>
          <div className="field">
            <label htmlFor="budgetMin">Budget min (USD)</label>
            <input id="budgetMin" name="budgetMin" type="number" min="0" step="0.01" />
          </div>
          <div className="field">
            <label htmlFor="budgetMax">Budget max (USD)</label>
            <input id="budgetMax" name="budgetMax" type="number" min="0" step="0.01" />
          </div>
          <div className="field">
            <label htmlFor="category">Category</label>
            <input id="category" name="category" placeholder="python_bugfix" />
          </div>
          <div className="field">
            <label htmlFor="deadline">Deadline</label>
            <input id="deadline" name="deadline" type="date" />
          </div>
          <div className="field full">
            <label htmlFor="description">Original description *</label>
            <textarea
              id="description"
              name="description"
              required
              placeholder="Paste the opportunity description. Imported text is treated as untrusted data."
            ></textarea>
          </div>
          <div className="field">
            <label htmlFor="technologies">Technologies</label>
            <input id="technologies" name="technologies" placeholder="Python, CSV, FastAPI" />
          </div>
          <div className="field">
            <label htmlFor="metadata">Raw metadata (JSON, optional)</label>
            <textarea
              id="metadata"
              name="metadata"
              placeholder='{"client": "public evidence only"}'
            ></textarea>
          </div>
          <div className="form-actions field full">
            <Link className="button secondary" href="/opportunities">
              Cancel
            </Link>
            <button type="submit">Normalize and score</button>
          </div>
        </form>
      </section>
    </>
  );
}
