import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import type { ThemePreference } from '../hooks/useTheme';
import Wordmark from '../assets/wordmark.svg?react';
import '../styles/Header.css';

const GITHUB_URL = 'https://github.com/canonnizq/geocaching.canonni.website';

// Subpage links.
const NAV_LINKS = [
  { label: 'Series', href: '/series' },
  { label: 'Tools', href: '/tools' },
  { label: 'About', href: '/about' },
];

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function Header() {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { preference, setPreference } = useTheme();
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isNavOpen && !isSettingsOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (settingsRef.current?.contains(event.target as Node)) return;
      setIsSettingsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isSettingsOpen && settingsRef.current?.contains(document.activeElement)) {
        settingsButtonRef.current?.focus();
      }
      setIsSettingsOpen(false);
      setIsNavOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNavOpen, isSettingsOpen]);

  const toggleSettings = () => {
    setIsSettingsOpen((open) => !open);
    setIsNavOpen(false);
  };

  const toggleNav = () => {
    setIsNavOpen((open) => !open);
    setIsSettingsOpen(false);
  };

  return (
    <header className="hdr">
      <Link className="hdr-brand" to="/" aria-label="Geocaching by CanonNi — home">
        <Wordmark className="hdr-brand-logo" />
        <span className="hdr-brand-name">.canonni.website</span>
      </Link>

      <nav id="hdr-nav" className={`hdr-nav${isNavOpen ? ' is-open' : ''}`} aria-label="Main">
        <ul>
          {NAV_LINKS.map(({ label, href }) => (
            <li key={href}>
              <NavLink to={href} onClick={() => setIsNavOpen(false)}>
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="hdr-actions">
        <a
          className="hdr-icon-btn"
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer noopener"
          title="Source & stuff"
          aria-label="Source & stuff"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
        </a>

        <div className="hdr-settings" ref={settingsRef}>
          <button
            ref={settingsButtonRef}
            type="button"
            className="hdr-icon-btn"
            title="Settings"
            aria-label="Settings"
            aria-haspopup="true"
            aria-expanded={isSettingsOpen}
            aria-controls="hdr-settings-menu"
            onClick={toggleSettings}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M4 7h9M17.5 7H20M4 17h3M11.5 17H20" />
              <circle cx="15" cy="7" r="2.5" />
              <circle cx="9" cy="17" r="2.5" />
            </svg>
          </button>

          {isSettingsOpen && (
            <div id="hdr-settings-menu" className="hdr-menu" role="group" aria-label="Settings">
              <p className="hdr-menu-label" id="hdr-theme-label">
                Theme
              </p>
              <div className="hdr-theme-group" role="radiogroup" aria-labelledby="hdr-theme-label">
                {THEME_OPTIONS.map(({ value, label }) => (
                  <label key={value} className="hdr-theme-option">
                    <input
                      type="radio"
                      name="hdr-theme"
                      value={value}
                      checked={preference === value}
                      onChange={() => setPreference(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className="hdr-menu-btn"
          aria-label={isNavOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={isNavOpen}
          aria-controls="hdr-nav"
          onClick={toggleNav}
        >
          <span className="hdr-bar" />
          <span className="hdr-bar" />
          <span className="hdr-bar" />
        </button>
      </div>
    </header>
  );
}
