import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useApiMutation } from '@/services/query';
import { Button, Input, Badge, toast } from '@de/web-ui';
import { useUiStore } from '@/stores/uiStore';
import { Bot, ShieldCheck, KeyRound, Sun, Moon } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuthStore();
  const { theme, toggleTheme } = useUiStore();
  const [email, setEmail] = useState('admin@acme.com');
  const [password, setPassword] = useState('demo123456');
  const [mfa, setMfa] = useState('');

  const mut = useApiMutation<{ token: string; user: any }, { email: string; password: string }>(
    '/api/auth/login',
    {
      onSuccess: (data) => {
        login(data.user, data.token);
        toast.success(`欢迎回来，${data.user.name}`);
        const from = (location.state as any)?.from?.pathname ?? '/home';
        navigate(from, { replace: true });
      },
      onError: (err: any) => {
        toast.error(err?.message ?? '登录失败');
      },
    },
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return toast.warn('请输入邮箱和密码');
    mut.mutate({ email, password });
  };

  return (
    <div className="grid h-screen w-screen place-items-center bg-[var(--bg-elevated)] px-4">
      {/* 主题切换按钮 */}
      <button
        onClick={toggleTheme}
        className="absolute right-6 top-6 grid h-9 w-9 place-items-center rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] shadow-sm"
        title={theme === 'light' ? '切换到深色' : '切换到浅色'}
      >
        {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </button>

      <div className="grid w-full max-w-[920px] grid-cols-1 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] shadow-xl md:grid-cols-2">
        {/* 左侧品牌 */}
        <div className="relative hidden flex-col justify-between bg-gradient-to-br from-[var(--brand)] via-[#5b4cdb] to-[var(--purple)] p-10 text-white md:flex">
          <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-16 -left-8 h-56 w-56 rounded-full bg-white/10 blur-3xl" />

          <div className="relative">
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-white/15 backdrop-blur">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <div className="text-lg font-bold">数字员工平台</div>
                <div className="text-xs opacity-80 font-mono">Digital Employee v3.3</div>
              </div>
            </div>

            <h1 className="mb-3 text-[28px] font-bold leading-tight tracking-tight">
              让 AI 成为
              <br />
              你的<span className="bg-gradient-to-r from-white via-yellow-100 to-white bg-clip-text text-transparent"> 数字员工</span>
            </h1>
            <p className="text-sm opacity-90 leading-relaxed">
              8 家模型 · 24 技能 · 等保 3 + ISO 27001 双合规
              <br />
              RAG + 工作流 + Agent 三位一体
            </p>
          </div>

          <div className="relative space-y-2 text-xs opacity-95">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> 数据不出境 · 双签复核 · SignedLog 审计
            </div>
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> Authentik + OIDC + MFA
            </div>
            <div className="mt-4 flex gap-1.5">
              <Badge tone="brand" className="bg-white/20 text-white">等保 3</Badge>
              <Badge tone="brand" className="bg-white/20 text-white">ISO 27001</Badge>
              <Badge tone="brand" className="bg-white/20 text-white">cn-east-1</Badge>
            </div>
          </div>
        </div>

        {/* 右侧表单 */}
        <form className="flex flex-col justify-center p-8 md:p-10" onSubmit={submit}>
          <div className="mb-1 flex items-center gap-2 md:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br from-[var(--brand)] to-[var(--purple)] text-sm font-bold text-white">DE</div>
            <span className="text-base font-bold">数字员工平台</span>
          </div>

          <h2 className="mb-1 text-xl font-bold text-[var(--text)]">欢迎登录</h2>
          <p className="mb-6 text-xs text-[var(--text-muted)]">使用企业账号 + MFA 二次验证</p>

          <label className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">邮箱</label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@acme.com" className="mb-4" />

          <label className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">密码</label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="mb-4" />

          <label className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">MFA 验证码 <span className="text-[var(--text-muted)] font-normal">（演示可空）</span></label>
          <Input value={mfa} onChange={(e) => setMfa(e.target.value)} placeholder="6 位数字" className="mb-4" />

          <div className="mb-5 flex items-center justify-between text-xs">
            <label className="flex items-center gap-1.5 text-[var(--text-muted)] cursor-pointer">
              <input type="checkbox" defaultChecked className="accent-[var(--brand)]" /> 7 天内自动登录
            </label>
            <a className="text-[var(--brand)] hover:underline" href="#">忘记密码？</a>
          </div>

          <Button type="submit" loading={mut.isPending} className="w-full">
            登录
          </Button>

          <div className="mt-5 text-center text-[11px] text-[var(--text-muted)]">
            登录即代表同意 <a className="text-[var(--brand)] hover:underline" href="#">《用户协议》</a> 与 <a className="text-[var(--brand)] hover:underline" href="#">《隐私政策》</a>
          </div>
        </form>
      </div>
    </div>
  );
}