#!/usr/bin/env bash
# Install optional external CLIs for heavy-optin / integration skills (macOS-first).
set -euo pipefail

echo "安装技能外部 CLI（可选；平台已内置 shim 供预检与降级运行）…"

if command -v brew >/dev/null 2>&1; then
  for pkg in gh 1password-cli himalaya tmux powershell; do
    if brew list "$pkg" >/dev/null 2>&1; then
      echo "  ✓ $pkg 已安装"
    else
      echo "  → brew install $pkg"
      brew install "$pkg" || echo "  ⚠ $pkg 安装失败，可稍后重试"
    fi
  done
else
  echo "  ⚠ 未找到 Homebrew，跳过 gh / op / himalaya"
fi

if command -v npm >/dev/null 2>&1; then
  if command -v ntn >/dev/null 2>&1; then
    echo "  ✓ ntn 已安装"
  else
    echo "  → npm install -g @notionhq/notion-cli"
    npm install -g @notionhq/notion-cli 2>/dev/null || echo "  ⚠ ntn 安装失败"
  fi
  if command -v trello >/dev/null 2>&1; then
    echo "  ✓ trello 已安装"
  else
    echo "  → npm install -g trello-cli"
    npm install -g trello-cli 2>/dev/null || echo "  ⚠ trello 安装失败"
  fi
else
  echo "  ⚠ 未找到 npm，跳过 Notion CLI (ntn) / Trello CLI (trello)"
fi

if command -v go >/dev/null 2>&1; then
  if command -v gog >/dev/null 2>&1; then
    echo "  ✓ gog 已安装"
  else
    echo "  → go install github.com/stevenleeg/gogcli/cmd/gog@latest"
    go install github.com/stevenleeg/gogcli/cmd/gog@latest 2>/dev/null || echo "  ⚠ gog 安装失败，见 https://gogcli.sh"
  fi
else
  echo "  ⚠ 未找到 go，跳过 gog"
fi

echo ""
echo "Obsidian CLI 需在 Obsidian 应用内启用「命令行界面」并注册 PATH。"
echo "平台 shim 目录: backend/builtin/skills/runtime/bin"
