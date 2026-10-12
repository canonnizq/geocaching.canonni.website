import { Link, Navigate, useParams } from 'react-router-dom';
import SeriesPicker from '../components/SeriesPicker';
import SeriesTimeline from '../components/SeriesTimeline';
import { SERIES, defaultSeries, getSeries } from '../data/series';

function UnknownSeries({ slug }: { slug: string }) {
  return (
    <section className="page">
      <header className="page-header">
        <p className="page-eyebrow">Series</p>
        <h1 className="page-title">No series named “{slug}”</h1>
        <p className="page-lede">Pick one of the series below.</p>
      </header>

      <SeriesPicker series={SERIES} />

      <p className="page-meta">
        <Link to={`/series/${defaultSeries.slug}`}>← Back to {defaultSeries.title}</Link>
      </p>
    </section>
  );
}

export default function SeriesPage() {
  const { slug } = useParams();

  // Keep the URL in step with what is shown, so the picker always has something
  // marked and every series view is linkable.
  if (!slug) return <Navigate to={`/series/${defaultSeries.slug}`} replace />;

  const series = getSeries(slug);
  if (!series) return <UnknownSeries slug={slug} />;

  return (
    <section className="page">
      <header className="page-header">
        <p className="page-eyebrow">Series</p>
        <h1 className="page-title">{series.title}</h1>
        <p className="page-lede">{series.summary}</p>
        <p className="page-meta">{series.codes.length} caches in this series</p>
      </header>

      <SeriesPicker series={SERIES} />

      <SeriesTimeline codes={series.codes} seriesSlug={series.slug} />
    </section>
  );
}
