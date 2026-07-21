import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { I18nProvider } from './i18n';
import './styles/global.css';
import 'reactflow/dist/style.css';
import { setApiClient, ApiClient } from '@de/web-api';
import { mockHandler } from '@de/web-api';
import { useWorkspaceStore } from './stores/workspaceStore';
import { useAuthStore } from './stores/authStore';

// 初始化 API 客户端（mock 模式 — 前端可独立运行）
setApiClient(
  new ApiClient(
    import.meta.env.VITE_API_BASE ?? '/api',
    () => localStorage.getItem('token'),
    import.meta.env.VITE_USE_MOCK !== 'false' ? mockHandler : undefined,
    () => {
      const user = useAuthStore.getState().user;
      return {
        'x-workspace-id': useWorkspaceStore.getState().currentWorkspaceId ?? user?.workspaceId ?? 'w1',
        ...(user ? {
          'x-tenant-id': user.tenantId,
          'x-mock-role': user.role,
          'x-mock-actor': user.name,
          'x-mock-user-id': user.id,
          'x-mock-permissions': user.permissions.join(','),
        } : {}),
      };
    },
  ),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </I18nProvider>
  </React.StrictMode>,
);
