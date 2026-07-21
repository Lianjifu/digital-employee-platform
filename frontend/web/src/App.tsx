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
const Memory = lazy(() => import('./pages/Memory'));
const Skills = lazy(() => import('./pages/Skills'));
const Models = lazy(() => import('./pages/Models'));
const Channels = lazy(() => import('./pages/Channels'));
const Settings = lazy(() => import('./pages/Settings'));
const Governance = lazy(() => import('./pages/Governance'));
const AuditCenter = lazy(() => import('./pages/AuditCenter'));
const ZeroTrust = lazy(() => import('./pages/ZeroTrust'));

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
            <Route path="/home" element={<ProtectedRoute roles={['user', 'admin']}><ErrorBoundary><Home /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/copilot" element={<ProtectedRoute roles={['user', 'admin']}><ErrorBoundary><Copilot /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/copilot/:id" element={<ProtectedRoute roles={['user', 'admin']}><ErrorBoundary><Copilot /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/tasks" element={<ProtectedRoute roles={['user', 'admin']}><ErrorBoundary><Tasks /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/workspaces" element={<ProtectedRoute roles={['admin']}><ErrorBoundary><Workspaces /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/agents" element={<ProtectedRoute roles={['user', 'admin']}><ErrorBoundary><Agents /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/workflows" element={<ProtectedRoute permission="workflow.read" roles={['user', 'admin']}><ErrorBoundary><Workflows /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/knowledge" element={<ProtectedRoute roles={['user', 'admin']}><ErrorBoundary><Knowledge /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/memory" element={<ProtectedRoute roles={['user', 'admin']}><ErrorBoundary><Memory /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/skills" element={<ProtectedRoute roles={['user', 'admin']}><ErrorBoundary><Skills /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/models" element={<ProtectedRoute permission="model.read" roles={['admin']}><ErrorBoundary><Models /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/channels" element={<ProtectedRoute permission="channel.read" roles={['admin']}><ErrorBoundary><Channels /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/governance" element={<ProtectedRoute roles={['admin']}><ErrorBoundary><Governance /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/zero-trust" element={<ProtectedRoute roles={['admin', 'auditor']}><ErrorBoundary><ZeroTrust /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/audit-center" element={<ProtectedRoute roles={['admin', 'auditor']}><ErrorBoundary><AuditCenter /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/settings/*" element={<ProtectedRoute roles={['admin']}><ErrorBoundary><Settings /></ErrorBoundary></ProtectedRoute>} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <ToastHost />
    </ErrorBoundary>
  );
}
