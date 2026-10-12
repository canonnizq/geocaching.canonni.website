import { Link } from 'react-router-dom';
import { TOOLS } from '../data/tools';
import '../styles/ToolsPage.css';

export default function ToolsPage() {
  return (
    <section className="page">
      <header className="page-header">
        <h1 className="page-title">Tools</h1>
        <p className="page-lede">Technologia!</p>
      </header>

      <ul className="tool-list">
        {TOOLS.map((tool) => (
          <li key={tool.slug}>
            <Link className="tool-card" to={tool.path}>
              <span className="tool-name">{tool.name}</span>
              <span className="tool-summary">{tool.summary}</span>
              <span className="tool-open">Open tool →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
