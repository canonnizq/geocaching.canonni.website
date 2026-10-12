import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CacheDetails, CacheLookupFailure } from '../types/cache';
import type { CacheItemState } from '../hooks/useSeriesCaches';
import { buildMeta } from '../lib/cacheMeta';
import '../styles/CacheTimelineItem.css';

/** Descriptions longer than this start collapsed so the series stays scannable. */
const CLAMP_THRESHOLD = 420;

const FAILURE_MESSAGES: Record<CacheLookupFailure, string> = {
  'not-found': 'This code could not be found. It may have been archived, or the code may be mistyped.',
  'premium-only': 'This geocache is for Premium members only, so its details are not publicly available.',
  network: 'coord.info could not be reached. Check your connection and try again.',
  unknown: 'Something went wrong while loading this geocache.',
};

function coordInfoUrl(code: string): string {
  return `https://coord.info/${encodeURIComponent(code)}`;
}

interface CardPositionProps {
  position: number;
  total: number;
}

interface LoadingCardProps extends CardPositionProps {
  code: string;
}

function LoadingCard({ code, position, total }: LoadingCardProps) {
  return (
    <div className="timeline-card timeline-card--loading" aria-busy="true">
      <p className="visually-hidden">
        Loading cache {code}, number {position} of {total}
      </p>
      <span className="cache-position">
        Cache {position} of {total}
      </span>
      <span className="skeleton skeleton--title" />
      <span className="skeleton skeleton--meta" />
      <span className="skeleton skeleton--line" />
      <span className="skeleton skeleton--line skeleton--short" />
    </div>
  );
}

interface FailureCardProps extends CardPositionProps {
  code: string;
  reason: CacheLookupFailure;
  onRetry: () => void;
}

function FailureCard({ code, position, total, reason, onRetry }: FailureCardProps) {
  return (
    <div className="timeline-card timeline-card--failed">
      <p className="cache-position">
        Cache {position} of {total}
      </p>
      <h3 className="cache-title">{code}</h3>
      <p className="cache-failure">{FAILURE_MESSAGES[reason]}</p>
      <div className="cache-failure-actions">
        <button type="button" className="cache-retry" onClick={onRetry}>
          Try again
        </button>
        <a className="cache-link" href={coordInfoUrl(code)} target="_blank" rel="noreferrer noopener">
          Open on coord.info ↗
        </a>
      </div>
    </div>
  );
}

interface LoadedCardProps extends CardPositionProps {
  cache: CacheDetails;
  chapterPath?: string;
}

function LoadedCard({ cache, position, total, chapterPath }: LoadedCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const description = cache.description?.trim() ?? '';
  const isLong = description.length > CLAMP_THRESHOLD;
  const meta = buildMeta(cache);

  return (
    <div className="timeline-card">
      <p className="cache-position">
        Cache {position} of {total}
      </p>
      <h3 className="cache-title">{cache.name}</h3>

      <div className="cache-identifiers">
        <span className="cache-code">{cache.code}</span>
        <a className="cache-link" href={cache.url} target="_blank" rel="noreferrer noopener">
          View on geocaching.com ↗
        </a>
        {chapterPath && (
          <Link className="cache-link cache-link--chapter" to={chapterPath}>
            Chapter {position} card →
          </Link>
        )}
      </div>

      {meta.length > 0 && (
        <ul className="cache-meta">
          {meta.map(({ label, value }) => (
            <li key={label} className="cache-meta-item">
              {label}
              <span className="cache-meta-value">{value}</span>
            </li>
          ))}
        </ul>
      )}

      {description ? (
        <>
          <p className={`cache-description${isLong && !isExpanded ? ' cache-description--clamped' : ''}`}>
            {description}
          </p>
          {isLong && (
            <button
              type="button"
              className="cache-description-toggle"
              aria-expanded={isExpanded}
              onClick={() => setIsExpanded((expanded) => !expanded)}
            >
              {isExpanded ? 'Show less' : 'Read full description'}
            </button>
          )}
        </>
      ) : (
        <p className="cache-note">No description was provided for this cache.</p>
      )}

      {cache.hint && (
        <details className="cache-hint">
          <summary>Show hint</summary>
          <p>{cache.hint}</p>
        </details>
      )}
    </div>
  );
}

interface CacheTimelineItemProps {
  code: string;
  position: number;
  total: number;
  state: CacheItemState;
  /** Link to this chapter's shareable page, when the parent series has one. */
  chapterPath?: string;
  onRetry: () => void;
}

export default function CacheTimelineItem({
  code,
  position,
  total,
  state,
  chapterPath,
  onRetry,
}: CacheTimelineItemProps) {
  return (
    <li className={`timeline-item timeline-item--${state.status}`}>
      <span className="timeline-node" aria-hidden="true">
        {position}
      </span>
      {state.status === 'loading' && <LoadingCard code={code} position={position} total={total} />}
      {state.status === 'failed' && (
        <FailureCard
          code={code}
          position={position}
          total={total}
          reason={state.reason}
          onRetry={onRetry}
        />
      )}
      {state.status === 'loaded' && (
        <LoadedCard cache={state.cache} position={position} total={total} chapterPath={chapterPath} />
      )}
    </li>
  );
}
