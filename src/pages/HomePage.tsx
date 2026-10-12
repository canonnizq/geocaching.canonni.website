import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <section className="page">
      <header className="page-header">
        <p className="page-eyebrow">Geocaching by CanonNi</p>
        <h1 className="page-title">Home</h1>
        <p className="page-lede">Placeholder for the landing page.</p>
      </header>

      <div className="page-placeholder">
        <p>
          Jump to the <Link to="/series">series timeline</Link>, or read{' '}
          <Link to="/about">about this project</Link>.
        </p>
      </div>
    </section>
  );
}
