import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { I18nProvider } from './i18n';
import './styles/global.css';
import 'reactflow/dist/style.css';
import { setApiClient, ApiClient, mockHandler } from '@de/web-api';
import { useWorkspaceStore } from './stores/workspaceStore';
import { useAuthStore } from './stores/authStore';
import { apiBaseURL, isMockApiMode } from './lib/api-mode';

function installApiClient() {
  // 默认真实 de-core；开发态走同源 /api（Vite proxy）。仅 VITE_USE_MOCK=true 时注入 Mock。
  setApiClient(
    new ApiClient(
      apiBaseURL(),
      () => localStorage.getItem('token'),
      isMockApiMode() ? mockHandler : undefined,
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
}

installApiClient();

if (import.meta.hot) {
  import.meta.hot.accept('./lib/api-mode', () => {
    installApiClient();
  });
}

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
