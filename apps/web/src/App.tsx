import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppLayout } from './layouts/AppLayout';
import { ProtectedRoute } from './router/ProtectedRoute';
import { ToastHost, Spinner } from '@de/web-ui';

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
    <div className="flex h-full items-center justify-center">
      <Spinner size={28} className="text-[var(--color-primary)]" />
    </div>
  );
}

export default function App() {
  return (
    <>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<Home />} />
            <Route path="/copilot" element={<Copilot />} />
            <Route path="/copilot/:id" element={<Copilot />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/workspaces" element={<Workspaces />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/workflows" element={<Workflows />} />
            <Route path="/knowledge" element={<Knowledge />} />
            <Route path="/skills" element={<Skills />} />
            <Route path="/models" element={<Models />} />
            <Route path="/channels" element={<Channels />} />
            <Route path="/settings/*" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </Suspense>
      <ToastHost />
    </>
  );
}