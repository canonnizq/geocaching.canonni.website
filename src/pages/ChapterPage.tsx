import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SERIES, defaultSeries } from '../data/series';
import { chapterImagePath, chapterPath, chapterSvgPath, getChapter, listChapters } from '../data/chapters';
import { useSeriesCaches } from '../hooks/useSeriesCaches';
import { buildMeta } from '../lib/cacheMeta';
import { describeChapter } from '../lib/chapterCard';
import type { CacheLookupFailure } from '../types/cache';
import '../styles/ChapterPage.css';

/** Where embeds should point. Absolute, because the snippet is pasted elsewhere. */
const SITE_ORIGIN = 'https://geocaching.canonni.website';

const FAILURE_MESSAGES: Record<CacheLookupFailure, string> = {
  'not-found': 'This code could not be found. It may have been archived, or the code may be mistyped.',
  'premium-only': 'This geocache is for Premium members only, so its details are not publicly available.',
  network: 'This cache could not be read just now, either from here or from coord.info. Try again in a moment.',
  unknown: 'Something went wrong while loading this geocache.',
};

function UnknownChapter({ slug, number }: { slug?: string; number?: string }) {
  return (
    <section className="page">
      <header className="page-header">
        <p className="page-eyebrow">Series chapter</p>
        <h1 className="page-title">No chapter {number} here</h1>
        <p className="page-lede">
          {slug ? `The series “${slug}” has no chapter ${number}.` : 'That series does not exist.'}
        </p>
      </header>

      <p className="chapter-note">
        <Link to={`/series/${defaultSeries.slug}`}>← Back to the series</Link>
      </p>
    </section>
  );
}

export default function ChapterPage() {
  const { slug, number: rawNumber } = useParams();
  const chapter = getChapter(slug, rawNumber);

  // Hooks run before the early return below, so an unknown chapter costs nothing
  // and a known one can start loading straight away.
  const { states, retry } = useSeriesCaches(chapter ? [chapter.code] : []);
  const [copied, setCopied] = useState(false);

  const copy = chapter
    ? describeChapter({
        series: chapter.series,
        number: chapter.number,
        total: chapter.total,
        code: chapter.code,
        cache: states[0]?.status === 'loaded' ? states[0].cache : undefined,
      })
    : { title: '', description: '' };

  // Keep the browser tab in step with the chapter, and hand the base title back
  // when the visitor navigates away.
  useEffect(() => {
    if (!copy.title) return;

    const previous = document.title;
    document.title = copy.title;
    return () => {
      document.title = previous;
    };
  }, [copy.title]);

  useEffect(() => {
    if (!copied) return;

    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!chapter) return <UnknownChapter slug={slug} number={rawNumber} />;

  const chapters = listChapters(chapter.series);
  const previous = chapter.number > 1 ? chapters[chapter.number - 2] : undefined;
  const next = chapter.number < chapter.total ? chapters[chapter.number] : undefined;

  const state = states[0] ?? { status: 'loading' as const };
  const snippet = `<a href="${SITE_ORIGIN}${chapterPath(chapter)}" target="_top">
  <img src="${SITE_ORIGIN}${chapterImagePath(chapter)}" width="750" height="250"
    alt="${copy.title}" title="View this series chapter">
</a>`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the snippet stays selectable by hand.
    }
  };

  return (
    <section className="page page--wide">
      <header className="page-header">
        <p className="page-eyebrow">
          <Link to={`/series/${chapter.series.slug}`}>{chapter.series.title}</Link>
        </p>
        <h1 className="page-title">Chapter {chapter.number} of {chapter.total}</h1>
        <p className="page-lede">
          Geocache <code>{chapter.code}</code>
          {chapter.series.summary ? ` — ${chapter.series.summary}` : ''}
        </p>
      </header>

      <figure className="chapter-card">
        <img
          src={chapterImagePath(chapter)}
          width={750}
          height={250}
          alt={copy.title}
        />
        <figcaption>
          The card for this chapter, drawn on request from the series definition and this cache's
          details. Also available as <a href={chapterSvgPath(chapter)}>SVG</a>.
        </figcaption>
      </figure>

      <nav className="chapter-nav" aria-label="Chapter navigation">
        {previous ? (
          <Link className="chapter-nav-key" to={chapterPath(previous)}>
            ← Chapter {previous.number}
          </Link>
        ) : (
          <span className="chapter-nav-key chapter-nav-key--empty">Start of series</span>
        )}
        {next ? (
          <Link className="chapter-nav-key" to={chapterPath(next)}>
            Chapter {next.number} →
          </Link>
        ) : (
          <span className="chapter-nav-key chapter-nav-key--empty">End of series</span>
        )}
      </nav>

      <section className="chapter-embed">
        <h2>Embed this card</h2>
        <p className="chapter-embed-lede">
          Paste this wherever HTML is allowed — a profile, a forum signature, a blog. The image is
          served straight from this site, with no scripts, cookies or tracking, so it works on its own.
        </p>
        <pre className="chapter-snippet">
          <code>{snippet}</code>
        </pre>
        <div className="chapter-actions">
          <button type="button" className="btn" onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy embed code'}
          </button>
          <a className="btn btn--ghost" href={chapterImagePath(chapter)} download>
            Download PNG
          </a>
        </div>
      </section>

      <section className="chapter-details">
        <h2>Cache details</h2>

        {state.status === 'loading' && <p className="chapter-note">Reading {chapter.code}…</p>}

        {state.status === 'failed' && (
          <div className="chapter-note chapter-note--panel">
            <p>{FAILURE_MESSAGES[state.reason]}</p>
            <div className="chapter-actions">
              <button type="button" className="btn btn--ghost" onClick={() => retry(0)}>
                Try again
              </button>
              <a
                className="btn btn--ghost"
                href={`https://coord.info/${chapter.code}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                Open on coord.info ↗
              </a>
            </div>
          </div>
        )}

        {state.status === 'loaded' && (
          <>
            <h3 className="chapter-cache-title">{state.cache.name}</h3>
            <ul className="chapter-meta">
              {buildMeta(state.cache).map(({ label, value }) => (
                <li key={label} className="chapter-meta-item">
                  {label}
                  <span className="chapter-meta-value">{value}</span>
                </li>
              ))}
            </ul>
            {state.cache.description ? (
              <p className="chapter-description">{state.cache.description}</p>
            ) : (
              <p className="chapter-note">No description was provided for this cache.</p>
            )}
          </>
        )}
      </section>

      <p className="chapter-note chapter-note--spaced">
        Other series:{' '}
        {SERIES.filter((series) => series.slug !== chapter.series.slug).map((series, index) => (
          <span key={series.slug}>
            {index > 0 && ' · '}
            <Link to={`/series/${series.slug}`}>{series.title}</Link>
          </span>
        ))}
      </p>
    </section>
  );
}
