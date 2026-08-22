import Link from 'next/link';

export default function GitHubProviderPage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>GitHub discovery</h1>
          <p>
            Public issue search only. No comments, PRs, proposals or maintainer contact are
            performed.
          </p>
        </div>
        <Link className="button secondary" href="/">
          Dashboard
        </Link>
      </div>
      <section className="panel">
        <form action="/api/providers/github" method="post" className="form-grid">
          <div className="field full">
            <label htmlFor="query">GitHub search query</label>
            <input
              id="query"
              name="query"
              defaultValue={'is:issue is:open (bounty OR "good first issue") language:TypeScript'}
            />
          </div>
          <div className="field">
            <label htmlFor="perPage">Maximum results</label>
            <input id="perPage" name="perPage" type="number" min="1" max="100" defaultValue="25" />
          </div>
          <div className="field">
            <label htmlFor="language">Extra language hint</label>
            <input id="language" name="language" placeholder="Optional, e.g. Python" />
          </div>
          <div className="form-actions field full">
            <button type="submit">Discover public issues</button>
          </div>
        </form>
      </section>
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="callout warning">
          <strong>Policy boundary:</strong> GitHub issues are not assumed to be paid. Compensation
          evidence is stored and scored as uncertain; discovery never creates comments or external
          commitments.
        </div>
      </section>
    </>
  );
}
