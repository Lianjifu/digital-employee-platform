import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useApiMutation } from '@/services/query';
import { Button, Input, Badge, toast } from '@de/web-ui';
import { Bot, ShieldCheck, KeyRound } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuthStore();
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
    <div className="grid h-screen w-screen place-items-center bg-gradient-to-br from-[#0b1220] via-[#0e1a32] to-[#1a2540]">
      <div className="grid w-[920px] grid-cols-2 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-2xl">
        {/* 左侧品牌 */}
        <div className="relative flex flex-col justify-between bg-gradient-to-br from-[var(--color-primary)] to-purple-600 p-10 text-white">
          <div>
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-white/15 backdrop-blur">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <div className="text-lg font-bold">数字员工平台</div>
                <div className="text-xs opacity-80">Digital Employee v3.0</div>
              </div>
            </div>
            <h1 className="mb-3 text-3xl font-bold leading-tight">
              让 AI 成为 <br />
              你的<span className="text-gradient"> 数字员工</span>
            </h1>
            <p className="text-sm opacity-90">
              8 家模型 · 24 技能 · 等保 3 + ISO 27001 双合规
              <br />
              RAG + 工作流 + Agent 三位一体
            </p>
          </div>

          <div className="space-y-2 text-xs opacity-90">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> 数据不出境 · 双签复核 · SignedLog 审计
            </div>
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> Authentik + OIDC + MFA
            </div>
            <div className="mt-4 text-[10px] opacity-70">© 2026 ACME Corp · cn-east-1 · cn-south-1</div>
          </div>
        </div>

        {/* 右侧表单 */}
        <form className="flex flex-col justify-center p-10" onSubmit={submit}>
          <h2 className="mb-1 text-xl font-semibold">登录</h2>
          <p className="mb-6 text-xs text-[var(--color-text-muted)]">使用企业账号 + MFA 二次验证</p>

          <label className="mb-1 text-xs text-[var(--color-text-muted)]">邮箱</label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@acme.com" className="mb-4" />

          <label className="mb-1 text-xs text-[var(--color-text-muted)]">密码</label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="mb-4" />

          <label className="mb-1 text-xs text-[var(--color-text-muted)]">MFA 验证码（演示可空）</label>
          <Input value={mfa} onChange={(e) => setMfa(e.target.value)} placeholder="6 位数字" className="mb-2" />

          <div className="mb-4 flex items-center justify-between text-xs">
            <label className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
              <input type="checkbox" defaultChecked /> 7 天内自动登录
            </label>
            <a className="text-[var(--color-primary)] hover:underline" href="#">忘记密码？</a>
          </div>

          <Button type="submit" loading={mut.isPending} className="w-full">
            登录
          </Button>

          <div className="mt-5 flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
            <Badge tone="success">等保 3</Badge>
            <Badge tone="success">ISO 27001</Badge>
            <Badge tone="info">cn-east-1</Badge>
          </div>
        </form>
      </div>
    </div>
  );
}