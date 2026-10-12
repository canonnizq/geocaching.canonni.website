import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <section className="page">
      <header className="page-header">
        <p className="page-eyebrow">Page not found</p>
        <h1 className="page-title">404 sorry :(</h1>
        <p className="page-lede">
          ...how did you get here?
        </p>
      </header>

      <div className="page-placeholder">
        <p>
          <Link to="/">Get back Jojo!</Link>
        </p>
      </div>
    </section>
  );
}
