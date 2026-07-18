import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppLayout } from './layouts/AppLayout';
import { ProtectedRoute } from './router/ProtectedRoute';
import { ToastHost, Spinner } from '@de/web-ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotFound } from './pages/NotFound';

// 11 个模块按路由懒加载
const Login = lazy(() => import('./pages/Login'));
const Home = lazy(() => import('./pages/Home'));
const Copilot = lazy(() => import('./pages/Copilot'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Workspaces = lazy(() => import('./pages/Workspaces'));
const Agents = lazy(() => import('./pages/Agents'));
const Workflows = lazy(() => import('./pages/Workflows'));
const Knowledge = lazy(() => import('./pages/Knowledge'));
const Skills = lazy(() => import('./pages/Skills'));
const Models = lazy(() => import('./pages/Models'));
const Channels = lazy(() => import('./pages/Channels'));
const Settings = lazy(() => import('./pages/Settings'));

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center" role="status" aria-live="polite">
      <Spinner size={28} className="text-[var(--brand)]" />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary fallbackTitle="应用遇到问题">
      <a href="#main-content" className="skip-link">跳转到主内容</a>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<ErrorBoundary><Login /></ErrorBoundary>} />
          <Route
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <AppLayout />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<ErrorBoundary><Home /></ErrorBoundary>} />
            <Route path="/copilot" element={<ErrorBoundary><Copilot /></ErrorBoundary>} />
            <Route path="/copilot/:id" element={<ErrorBoundary><Copilot /></ErrorBoundary>} />
            <Route path="/tasks" element={<ErrorBoundary><Tasks /></ErrorBoundary>} />
            <Route path="/workspaces" element={<ErrorBoundary><Workspaces /></ErrorBoundary>} />
            <Route path="/agents" element={<ErrorBoundary><Agents /></ErrorBoundary>} />
            <Route path="/workflows" element={<ProtectedRoute permission="workflow.read"><ErrorBoundary><Workflows /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/knowledge" element={<ErrorBoundary><Knowledge /></ErrorBoundary>} />
            <Route path="/skills" element={<ErrorBoundary><Skills /></ErrorBoundary>} />
            <Route path="/models" element={<ErrorBoundary><Models /></ErrorBoundary>} />
            <Route path="/channels" element={<ErrorBoundary><Channels /></ErrorBoundary>} />
            <Route path="/settings/*" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <ToastHost />
    </ErrorBoundary>
  );
}