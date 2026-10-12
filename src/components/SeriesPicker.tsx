import { NavLink } from 'react-router-dom';
import type { Series } from '../data/series';
import '../styles/SeriesPicker.css';

interface SeriesPickerProps {
  series: Series[];
}

/** Switches between series. Renders nothing when there is no choice to make. */
export default function SeriesPicker({ series }: SeriesPickerProps) {
  if (series.length < 2) return null;

  return (
    <nav className="series-picker" aria-label="Choose a series">
      <ul>
        {series.map((entry) => (
          <li key={entry.slug}>
            <NavLink className="series-picker-option" to={`/series/${entry.slug}`}>
              {entry.title}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
