package vetter

import "regexp"

// persistence patterns: surviving past the skill invocation. All SevBlock —
// a skill that installs itself as a daemon/launch agent/crontab is by
// definition out of scope for the platform's runtime contract.
func init() {
	// crontab - (read stdin and install).
	registerRe("crontab-install", SevBlock, CatPersistence,
		"skill 不应改 cron 表；定时任务超出 skill 的运行时生命周期。",
		regexp.MustCompile(`\bcrontab\b`))

	// systemctl enable / systemctl start / systemctl daemon-reload.
	registerRe("systemctl", SevBlock, CatPersistence,
		"skill 不应直接 systemctl 改服务；守护进程注册超出 skill 的运行时生命周期。",
		regexp.MustCompile(`\bsystemctl\b[^\n]*\b(?:enable|start|daemon-reload|mask)\b`))

	// launchctl load — macOS persistence.
	registerRe("launchctl", SevBlock, CatPersistence,
		"skill 不应使用 launchctl 装载 LaunchAgent/Daemon。",
		regexp.MustCompile(`\blaunchctl\b[^\n]*\b(?:load|bootstrap)\b`))

	// update-rc.d / chkconfig — SysV init persistence.
	registerRe("init-rc", SevBlock, CatPersistence,
		"skill 不应改 SysV init 注册；持久化守护进程超出 skill 的运行时生命周期。",
		regexp.MustCompile(`\b(?:update-rc\.d|chkconfig|rc-update)\b`))

	// systemd unit drop-in — write a *.service file under /etc/systemd/.
	registerRe("systemd-unit-write", SevBlock, CatPersistence,
		"写 /etc/systemd/*.service 是注册守护进程；skill 不应做此事。",
		regexp.MustCompile(`/etc/systemd/(?:system|user)/[A-Za-z0-9_.@:-]+\.service`))

	// macOS LaunchAgents/LauchDaemons plist write.
	registerRe("launch-agent-write", SevBlock, CatPersistence,
		"~/Library/LaunchAgents/*.plist 或 /Library/LaunchDaemons/*.plist 是注册后台进程；skill 不应写。",
		regexp.MustCompile(`/Library/(?:LaunchAgents|LaunchDaemons)/[A-Za-z0-9_.-]+\.plist`))

	// shell rc mutation — appending to ~/.bashrc / ~/.zshrc / ~/.profile.
	registerRe("shell-rc-mutate", SevBlock, CatPersistence,
		"写 ~/.bashrc / ~/.zshrc / ~/.profile 等 shell rc 是悄悄植入 hooks；skill 不应改用户 shell 配置。",
		regexp.MustCompile(`>>\s*~?/\.(?:bashrc|zshrc|profile|bash_profile|bash_login)`))

	// at / batch queue submission — runs later. Anchored to command-position
	// (start-of-line or after `;`, `|`, `&&`, `||`) so prose like "at least"
	// or "at / CatDestructive" doesn't false-positive.
	registerRe("at-job", SevBlock, CatPersistence,
		"at / batch 队列是延迟执行；skill 不应投递延迟任务。",
		regexp.MustCompile(`(?:^|[;|&(]\s*)(?:\bat\b\s+(?:-f\s+\S+|-q|-m\s+\S+|now\b|\d{1,2}:\d{2}|[\d+]+\s+(?:minute|hour|day)s?)|\batq\b|\batrm\b|\bbatch\b\s+\S)`))
}