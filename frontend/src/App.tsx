import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider } from "./lib/theme";
import { StyleThemeProvider } from "./lib/style-theme";
import { BrainProvider } from "./lib/brain-context";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import { Sidebar, QiParticles, PageTransition } from "./components";
import BrainSwitcher from "./components/BrainSwitcher";
import { sidebarCopy, useCopy } from "./lib/copywriting";

const SearchPage = lazy(() => import("./pages/search"));
const SettingsPage = lazy(() => import("./pages/settings"));
const ContentsPage = lazy(() => import("./pages/contents"));
const ContentsDetail = lazy(() => import("./pages/contents/detail"));
const TagsPage = lazy(() => import("./pages/tags"));
const CategoriesPage = lazy(() => import("./pages/categories"));
const FavoritesPage = lazy(() => import("./pages/favorites"));
const NotesPage = lazy(() => import("./pages/notes"));
const AnalyticsPage = lazy(() => import("./pages/analytics"));
const BackupPage = lazy(() => import("./pages/backup"));
const CollectionsPage = lazy(() => import("./pages/collections"));
const RecyclePage = lazy(() => import("./pages/recycle"));
const BrainsPage = lazy(() => import("./pages/brains"));
const LogsPage = lazy(() => import("./pages/logs"));
const QuizPage = lazy(() => import("./pages/quiz"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-[var(--space-20)]">
      <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
    </div>
  );
}

function Header() {
  const location = useLocation();
  const s = useCopy(sidebarCopy);

  return (
    <header className="sticky top-0 z-30 bg-[var(--bg-primary)]/80 backdrop-blur-md border-b border-[var(--border-subtle)]">
      <div className="h-12 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <BrainSwitcher />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-secondary">
            {location.pathname === "/" && s.contents}
            {location.pathname === "/search" && s.search}
            {location.pathname === "/notes" && s.notes}
            {location.pathname === "/tags" && s.tags}
            {location.pathname === "/categories" && s.categories}
            {location.pathname === "/favorites" && s.favorites}
            {location.pathname === "/collections" && s.collections}
            {location.pathname === "/brains" && s.brains}
            {location.pathname === "/analytics" && s.analytics}
            {location.pathname === "/logs" && s.logs}
            {location.pathname === "/backup" && s.backup}
            {location.pathname === "/settings" && s.settings}
            {location.pathname === "/recycle" && s.recycle}
            {location.pathname === "/quiz" && s.quiz}
          </span>
        </div>
      </div>
    </header>
  );
}

function Layout() {
  return (
    <>
      <QiParticles />
      <div className="min-h-screen relative z-10">
        <Sidebar />
        <div className="ml-16">
          <Header />
          <main className="dao-page-enter">
            <Suspense fallback={<PageLoader />}>
              <PageTransition>
                <Routes>
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/" element={<ContentsPage />} />
                  <Route path="/contents" element={<ContentsPage />} />
                  <Route path="/contents/:id" element={<ContentsDetail />} />
                  <Route path="/tags" element={<TagsPage />} />
                  <Route path="/categories" element={<CategoriesPage />} />
                  <Route path="/favorites" element={<FavoritesPage />} />
                  <Route path="/notes" element={<NotesPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/collections" element={<CollectionsPage />} />
                  <Route path="/backup" element={<BackupPage />} />
                  <Route path="/recycle" element={<RecyclePage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/brains" element={<BrainsPage />} />
                  <Route path="/logs" element={<LogsPage />} />
                  <Route path="/quiz" element={<QuizPage />} />
                </Routes>
              </PageTransition>
            </Suspense>
          </main>
        </div>
      </div>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <StyleThemeProvider>
          <BrainProvider>
            <Layout />
          </BrainProvider>
        </StyleThemeProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
