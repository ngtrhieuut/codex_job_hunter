import Link from 'next/link';

export default function LoginPage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Owner login</h1>
          <p>
            Required when APP_OWNER_TOKEN is configured. The token is checked server-side and never
            stored in the repository.
          </p>
        </div>
        <Link className="button secondary" href="/">
          Dashboard
        </Link>
      </div>
      <section className="panel" style={{ maxWidth: 520 }}>
        <form action="/api/auth/login" method="post" className="form-grid">
          <div className="field full">
            <label htmlFor="token">APP_OWNER_TOKEN</label>
            <input
              id="token"
              name="token"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>
          <div className="form-actions field full">
            <button type="submit">Sign in</button>
          </div>
        </form>
      </section>
    </>
  );
}
