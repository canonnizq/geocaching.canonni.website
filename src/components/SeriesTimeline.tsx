import CacheTimelineItem from './CacheTimelineItem';
import { useSeriesCaches } from '../hooks/useSeriesCaches';
import { chapterPathFor } from '../data/chapters';
import '../styles/SeriesTimeline.css';

interface SeriesTimelineProps {
  codes: string[];
  /** When set, each card links to its own shareable chapter page. */
  seriesSlug?: string;
}

/**
 * Vertical timeline of a series' caches, always rendered in the order the codes
 * were provided regardless of the order in which lookups resolve.
 */
export default function SeriesTimeline({ codes, seriesSlug }: SeriesTimelineProps) {
  const { states, retry } = useSeriesCaches(codes);

  return (
    <ol className="series-timeline">
      {codes.map((code, index) => (
        <CacheTimelineItem
          key={`${index}-${code}`}
          code={code}
          position={index + 1}
          total={codes.length}
          state={states[index] ?? { status: 'loading' }}
          chapterPath={seriesSlug ? chapterPathFor(seriesSlug, index + 1) : undefined}
          onRetry={() => retry(index)}
        />
      ))}
    </ol>
  );
}
