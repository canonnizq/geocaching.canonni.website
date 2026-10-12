import { Route, Routes } from 'react-router-dom';
import { Header } from './components';
import { AboutPage, ChapterPage, HomePage, MultiplyPage, NotFoundPage, SeriesPage, ToolsPage } from './pages';

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/series" element={<SeriesPage />} />
          <Route path="/series/:slug" element={<SeriesPage />} />
          <Route path="/series/:slug/:number" element={<ChapterPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/tools/multiply" element={<MultiplyPage />} />
          <Route path="/tools/multiply/:code" element={<MultiplyPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </>
  );
}
