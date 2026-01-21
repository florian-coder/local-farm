import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="page-section">
      <h1>Page not found</h1>
      <p className="muted">The page you requested does not exist.</p>
      <Link className="button primary" to="/">
        Back to home
      </Link>
    </div>
  );
}
