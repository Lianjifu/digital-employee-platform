/**
 * 当前工作区状态 — 多工作区切换
 */
import { create } from 'zustand';
import type { Workspace } from '@de/web-types';

interface WorkspaceState {
  current: Workspace | null;
  list: Workspace[];
  setCurrent: (w: Workspace) => void;
  setList: (list: Workspace[]) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  current: null,
  list: [],
  setCurrent: (w) => set({ current: w }),
  setList: (list) => set({ list }),
}));