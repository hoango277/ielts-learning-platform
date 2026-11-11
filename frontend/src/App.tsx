import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { Spinner } from './components/ui/primitives';
import { useMe, useUnauthorizedListener } from './hooks/useAuth';

// Tách code theo trang để tải nhanh
const AuthPage = lazy(() => import('./pages/AuthPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Explore = lazy(() => import('./pages/Explore'));
const Channel = lazy(() => import('./pages/Channel'));
const Watch = lazy(() => import('./pages/watch/WatchPage'));
const Library = lazy(() => import('./pages/Library'));
const Notebook = lazy(() => import('./pages/Notebook'));
const Review = lazy(() => import('./pages/Review'));
const PracticeHub = lazy(() => import('./pages/practice/PracticeHub'));
const PracticeSession = lazy(() => import('./pages/practice/PracticeSession'));
const Topics = lazy(() => import('./pages/Topics'));
const TopicDetail = lazy(() => import('./pages/TopicDetail'));
const Settings = lazy(() => import('./pages/Settings'));
const Today = lazy(() => import('./pages/Today'));
const Phrases = lazy(() => import('./pages/Phrases'));
const Speaking = lazy(() => import('./pages/speaking/SpeakingPage'));
const Fluency = lazy(() => import('./pages/fluency/FluencyPage'));
const WordProfilePage = lazy(() => import('./pages/WordProfilePage'));
const NotFound = lazy(() => import('./pages/NotFound'));

function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg text-violet-500" role="status" aria-label="Đang tải">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

/** Chưa đăng nhập → chuyển tới /login, nhớ trang đang mở để quay lại sau khi đăng nhập. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useMe();
  const location = useLocation();
  if (isPending) return <FullScreenLoader />;
  if (!user) {
    const next = location.pathname + location.search;
    return <Navigate to={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  useUnauthorizedListener();
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route path="register" element={<AuthPage mode="register" />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="explore" element={<Explore />} />
          <Route path="channel/:id" element={<Channel />} />
          <Route path="watch/:id" element={<Watch />} />
          <Route path="library" element={<Library />} />
          <Route path="notebook" element={<Notebook />} />
          <Route path="review" element={<Review />} />
          <Route path="practice" element={<PracticeHub />} />
          <Route path="practice/play" element={<PracticeSession />} />
          <Route path="topics" element={<Topics />} />
          <Route path="topics/:slug" element={<TopicDetail />} />
          <Route path="settings" element={<Settings />} />
          <Route path="today" element={<Today />} />
          <Route path="phrases" element={<Phrases />} />
          <Route path="speaking" element={<Speaking />} />
          <Route path="fluency" element={<Fluency />} />
          <Route path="fluency/:id" element={<Fluency />} />
          <Route path="profile/:term" element={<WordProfilePage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
