/**
 * 极简 i18n 工具 — 字典 + Provider + useT hook
 * 支持中英双语，localStorage 持久化
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Locale = 'zh-CN' | 'en-US';

type Dict = Record<string, string>;

const zh: Dict = {
  'app.title': '数字员工平台',
  'app.shortName': 'DE',
  'nav.home': '首页',
  'nav.copilot': '会话',
  'nav.tasks': '任务',
  'nav.agents': '智能体',
  'nav.workflows': '工作流',
  'nav.knowledge': '知识',
  'nav.skills': '技能',
  'nav.models': '模型',
  'nav.channels': '渠道',
  'common.search': '搜索',
  'common.cancel': '取消',
  'common.confirm': '确认',
  'common.save': '保存',
  'common.delete': '删除',
  'common.loading': '加载中...',
  'common.theme.light': '浅色',
  'common.theme.dark': '深色',
  'common.lang.zh': '简体中文',
  'common.lang.en': 'English',
  'home.title': '业务总览',
  'home.subtitle': 'ACME 生产环境 · 11 模块运行中',
  'home.kpi.tasks': '今日任务',
  'home.kpi.health': '系统健康度',
  'tasks.title': '任务',
  'tasks.col.todo': '进行中',
  'tasks.col.review': '待复核',
  'tasks.col.done': '已完成',
  'settings.title': '设置',
  'settings.menu.tenant': '租户信息',
  'settings.menu.security': '安全 & 认证',
  'error.title': '页面遇到问题',
  'error.desc': '抱歉，组件渲染时发生错误。',
  'error.retry': '重试',
  'error.home': '返回首页',
  'notfound.title': '页面不存在',
  'notfound.desc': '路径不存在于 11 个模块中。',
  'notfound.back': '返回上页',
  'notfound.home': '返回首页',
  'search.placeholder': '搜索任务、Agent、文档...',
  'search.empty': '没有找到相关结果',
};

const en: Dict = {
  'app.title': 'Digital Employee',
  'app.shortName': 'DE',
  'nav.home': 'Home',
  'nav.copilot': 'Copilot',
  'nav.tasks': 'Tasks',
  'nav.agents': 'Agents',
  'nav.workflows': 'Workflows',
  'nav.knowledge': 'Knowledge',
  'nav.skills': 'Skills',
  'nav.models': 'Models',
  'nav.channels': 'Channels',
  'common.search': 'Search',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.loading': 'Loading...',
  'common.theme.light': 'Light',
  'common.theme.dark': 'Dark',
  'common.lang.zh': '简体中文',
  'common.lang.en': 'English',
  'home.title': 'Business Overview',
  'home.subtitle': 'ACME Production · 11 modules running',
  'home.kpi.tasks': 'Tasks Today',
  'home.kpi.health': 'System Health',
  'tasks.title': 'Tasks',
  'tasks.col.todo': 'In Progress',
  'tasks.col.review': 'In Review',
  'tasks.col.done': 'Done',
  'settings.title': 'Settings',
  'settings.menu.tenant': 'Tenant Info',
  'settings.menu.security': 'Security & Auth',
  'error.title': 'Something went wrong',
  'error.desc': 'Sorry, a component rendering error occurred.',
  'error.retry': 'Retry',
  'error.home': 'Back Home',
  'notfound.title': 'Page Not Found',
  'notfound.desc': 'The path does not exist in 11 modules.',
  'notfound.back': 'Go Back',
  'notfound.home': 'Back Home',
  'search.placeholder': 'Search tasks, agents, docs...',
  'search.empty': 'No results found',
};

const DICTS: Record<Locale, Dict> = { 'zh-CN': zh, 'en-US': en };

interface I18nCtx {
  locale: Locale;
  t: (key: string) => string;
  setLocale: (l: Locale) => void;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    try {
      const stored = localStorage.getItem('de-locale');
      return (stored === 'en-US' || stored === 'zh-CN') ? stored : 'zh-CN';
    } catch {
      return 'zh-CN';
    }
  });

  useEffect(() => {
    try { localStorage.setItem('de-locale', locale); } catch {}
  }, [locale]);

  const t = (key: string): string => {
    return DICTS[locale][key] ?? key;
  };

  return <Ctx.Provider value={{ locale, t, setLocale }}>{children}</Ctx.Provider>;
}

export function useT() {
  const ctx = useContext(Ctx);
  if (!ctx) return { locale: 'zh-CN' as Locale, t: (k: string) => k, setLocale: () => {} };
  return ctx;
}
