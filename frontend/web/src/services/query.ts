/**
 * 通用 TanStack Query 封装 — 统一错误处理 / 鉴权注入
 */
import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseMutationOptions } from '@tanstack/react-query';
import { getApiClient } from '@de/web-api';

export function useApiQuery<T>(
  key: readonly unknown[],
  path: string,
  params?: { query?: Record<string, any>; body?: unknown; method?: 'GET' | 'POST' },
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>,
) {
  const q = useQuery<T>({
    queryKey: key,
    queryFn: async () => {
      const c = getApiClient();
      return c.request<T>(path, {
        method: params?.method ?? 'GET',
        query: params?.query,
        body: params?.body,
      });
    },
    ...options,
  });
  return {
    data: q.data,
    error: q.error,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    isError: q.isError,
    refetch: q.refetch,
  };
}

type MutationOpts<TData, TVar> = {
  onSuccess?: (data: TData, vars: TVar) => void;
  onError?: (err: unknown, vars: TVar) => void;
};

export function useApiMutation<TData, TVar>(
  path: string | ((vars: TVar) => string),
  options?: MutationOpts<TData, TVar>,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
) {
  const qc = useQueryClient();
  // 4 个泛型让 TanStack Query 类型完整
  return useMutation<TData, unknown, TVar>({
    mutationFn: async (vars: TVar) => {
      const c = getApiClient();
      const p = typeof path === 'function' ? path(vars) : path;
      return c.request<TData>(p, { method, body: vars });
    },
    onSuccess: (data, vars) => {
      options?.onSuccess?.(data, vars);
      qc.invalidateQueries();
    },
    onError: (err, vars) => {
      options?.onError?.(err, vars);
    },
  } as UseMutationOptions<TData, unknown, TVar>);
}