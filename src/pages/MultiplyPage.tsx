import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchCacheDetails } from '../data/caches';
import { MULTIPLY_EXAMPLE_CODES } from '../data/toolCaches';
import { lettersWithoutStep, parseMultiCache, requiredLetters, solveMultiCache } from '../lib/multiCache';
import type { CacheDetails, CacheLookupFailure, CacheLookupResult } from '../types/cache';
import '../styles/MultiplyPage.css';

type CacheState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; cache: CacheDetails }
  | { status: 'error'; code: string; reason: CacheLookupFailure };

/** The most recently resolved lookup, tagged with the code it answered. */
interface LookupEntry {
  code: string;
  result: CacheLookupResult;
}

function describeFailure(code: string, reason: CacheLookupFailure): string {
  if (reason === 'premium-only') {
    return `${code} is Premium Member Only, so its description is not publicly readable.`;
  }
  if (reason === 'network') {
    return `${code} could not be read from coord.info. Try again in a moment.`;
  }
  if (reason === 'not-found') {
    return `${code} could not be found. It may have been archived, or the code may be mistyped.`;
  }
  return `Something went wrong while reading ${code}.`;
}

export default function MultiplyPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const requested = code?.trim().toUpperCase() ?? '';

  const [draft, setDraft] = useState(requested);
  const [entry, setEntry] = useState<LookupEntry | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  // Adjusting state during render when the route moves to another code, so the
  // input and any entered values never carry over from the previous cache.
  const [lastRequested, setLastRequested] = useState(requested);
  if (lastRequested !== requested) {
    setLastRequested(requested);
    setDraft(requested);
    setValues({});
  }

  useEffect(() => {
    if (requested === '') return;

    let cancelled = false;
    void fetchCacheDetails(requested).then((result) => {
      if (!cancelled) setEntry({ code: requested, result });
    });

    return () => {
      cancelled = true;
    };
  }, [requested]);

  const cacheState: CacheState =
    requested === ''
      ? { status: 'idle' }
      : entry === null || entry.code !== requested
        ? { status: 'loading' }
        : entry.result.ok
          ? { status: 'ready', cache: entry.result.cache }
          : { status: 'error', code: requested, reason: entry.result.reason };

  const description = cacheState.status === 'ready' ? cacheState.cache.description : null;
  const parsed = description === null ? null : parseMultiCache(description);
  const solved = parsed === null ? null : solveMultiCache(parsed, values);

  useEffect(() => {
    if (!copied) return;

    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const next = draft.trim().toUpperCase();
    if (next !== '') navigate(`/tools/multiply/${encodeURIComponent(next)}`);
  };

  const handleCopy = async () => {
    if (!solved) return;

    try {
      await navigator.clipboard.writeText(solved.solutions.map((s) => s.display).join(' '));
      setCopied(true);
    } catch {
      // Clipboard access can be blocked; the coordinates stay selectable by hand.
    }
  };

  const isMultiCache =
    cacheState.status === 'ready' && (cacheState.cache.type ?? '').toLowerCase().includes('multi');

  const issues: string[] = [];
  if (cacheState.status === 'ready' && parsed) {
    if (parsed.steps.length === 0) issues.push('No stages could be read from the description.');
    if (parsed.expressions.length === 0) {
      issues.push('No final-coordinate formula could be read from the description.');
    }
    const unpaired = lettersWithoutStep(parsed);
    if (unpaired.length > 0) {
      issues.push(`The formula also uses ${unpaired.join(', ')}, which no stage accounts for.`);
    }
    // Mystery caches often carry a multi's formula, so only flag the type when
    // there is nothing else to show.
    if (!isMultiCache && parsed.steps.length === 0 && parsed.expressions.length === 0) {
      issues.push(`${cacheState.cache.type ?? 'This cache'} is not a multi-cache, so it has no stages to solve.`);
    }
  }

  const hasTool = parsed !== null && (parsed.steps.length > 0 || parsed.expressions.length > 0);
  const letters = parsed ? requiredLetters(parsed) : [];

  return (
    <section className="page page--wide">
      <header className="page-header">
        <p className="page-eyebrow">Tools</p>
        <h1 className="page-title">MultiPly</h1>
        <p className="page-lede">
          Automatically parses a multi-cache's steps and formula. Enter its GC Code and we'll take care of the rest.
        </p>
        <p className="multiply-back">
          <Link to="/tools">← All tools</Link>
        </p>
      </header>

      <form className="multiply-form" onSubmit={handleSubmit}>
        <label className="multiply-form-label" htmlFor="multiply-code">
          Geocache code
        </label>
        <div className="multiply-form-row">
          <input
            id="multiply-code"
            className="multiply-form-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="GCXXXXX"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="multiply-form-note"
          />
          <button type="submit" className="btn" disabled={draft.trim() === ''}>
            Fetch
          </button>
        </div>
        <p className="multiply-form-note" id="multiply-form-note">
          Need demos? Try{' '}
          {MULTIPLY_EXAMPLE_CODES.map((example, index) => (
            <span key={example}>
              {index > 0 && ', '}
              <Link className="multiply-example" to={`/tools/multiply/${example}`}>
                {example}
              </Link>
            </span>
          ))}
          .
        </p>
      </form>

      {cacheState.status === 'loading' && <p className="result-progress">Reading {requested}…</p>}

      {cacheState.status === 'error' && (
        <div className="notice">
          <p className="notice-text">{describeFailure(cacheState.code, cacheState.reason)}</p>
          {cacheState.reason !== 'premium-only' && (
            <p className="notice-hint">
              Read it on{' '}
              <a
                href={`https://coord.info/${cacheState.code}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                coord.info ↗
              </a>{' '}
              to check the code, or try {MULTIPLY_EXAMPLE_CODES[0]}.
            </p>
          )}
        </div>
      )}

      {cacheState.status === 'ready' && (
        <p className="multiply-cache-meta">
          <span className="multiply-code">{cacheState.cache.code}</span>
          <span className="multiply-cache-name">{cacheState.cache.name}</span>
          {cacheState.cache.type && <span className="multiply-cache-type">{cacheState.cache.type}</span>}
          {cacheState.cache.difficulty !== null && (
            <span className="multiply-cache-type">
              D {cacheState.cache.difficulty} / T {cacheState.cache.terrain}
            </span>
          )}
        </p>
      )}

      {issues.map((issue) => (
        <p className="notice" key={issue}>
          <span className="notice-text">{issue}</span>
        </p>
      ))}

      {cacheState.status === 'ready' && !hasTool && (
        <details className="multiply-description">
          <summary>Show the description we read</summary>
          <p>{cacheState.cache.description ?? 'This cache has no description.'}</p>
        </details>
      )}

      {parsed && solved && hasTool && (
        <div className="multiply-layout">
          <ol className="multiply-steps">
            {parsed.steps.map((step) => {
              const value = values[step.letter] ?? '';
              const isDone = value.trim() !== '';

              return (
                <li key={`${step.index}-${step.letter}`} className={`step${isDone ? ' step--done' : ''}`}>
                  <div className="step-info">
                    <div className="step-heading">
                      <span className="step-id">{step.letter}</span>
                      <span className="step-label">{step.title ?? step.label}</span>
                      {step.title && <span className="step-tag">{step.label}</span>}
                    </div>
                    <p className="step-description">{step.description}</p>
                  </div>

                  <div className="step-input">
                    <label className="step-field-label" htmlFor={`value-${step.letter}`}>
                      Value
                    </label>
                    <input
                      id={`value-${step.letter}`}
                      className="step-field"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="—"
                      value={value}
                      onChange={(event) =>
                        setValues((previous) => ({ ...previous, [step.letter]: event.target.value }))
                      }
                      aria-describedby={`hint-${step.letter}`}
                    />
                    <p className="step-hint" id={`hint-${step.letter}`}>
                      {step.valueHint}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          <aside className="multiply-result">
            <p className="result-label">Final coordinates</p>

            {solved.solutions.length > 0 ? (
              <ul className="result-coords">
                {solved.solutions.map((solution) => (
                  <li
                    key={`${solution.hemisphere}${solution.degrees}`}
                    className={`result-coord result-coord--${solution.status}`}
                  >
                    <span className="result-value" aria-live="polite">
                      {solution.display}
                    </span>
                    {solution.detail && <span className="result-detail">{solution.detail}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="result-detail">No formula to solve.</p>
            )}

            <p className="result-progress">
              {solved.ready
                ? 'All values entered.'
                : solved.missing.length > 0
                  ? `Waiting on ${solved.missing.join(', ')}`
                  : 'Check the values above — the formula did not work out.'}
            </p>

            <div className="result-actions">
              <button type="button" className="btn" onClick={handleCopy} disabled={!solved.ready}>
                {copied ? 'Copied' : 'Copy coordinates'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setValues({})}
                disabled={solved.missing.length === letters.length}
              >
                Reset
              </button>
            </div>

            {parsed.expressions.length > 0 && (
              <>
                <p className="result-label result-label--spaced">Formula</p>
                <ul className="result-formula-list">
                  {parsed.expressions.map((expression) => (
                    <li key={`${expression.hemisphere}${expression.degrees}`}>
                      <span className="formula-prefix">
                        {expression.hemisphere}
                        {expression.degrees}°
                      </span>
                      <span className="formula-body">
                        {expression.minutes}.{expression.expression}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
