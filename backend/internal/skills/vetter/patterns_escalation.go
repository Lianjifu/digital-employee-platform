package vetter

import "regexp"

// escalation patterns: privilege or permission manipulation. All SevBlock.
func init() {
	// sudo — direct privilege escalation. Suppressed inside quotes so install-
	// hint strings (`printf 'sudo apt-get install ...'`) don't false-positive.
	registerReSuppressInQuotes("sudo-priv", SevBlock, CatEscalation,
		"skill 脚本不应调用 sudo；运行时容器已经以受限身份运行。",
		regexp.MustCompile(`\bsudo\b`))

	// chmod 777 / chmod -R 777 / chmod a+rwx.
	registerRe("chmod-777", SevBlock, CatEscalation,
		"chmod 777 会让所有用户可写；请使用最小权限（600/700）。",
		regexp.MustCompile(`\bchmod\b[^\n]*\b(?:777|a\+rwx|o\+rwx)\b`))

	// chmod +s — setuid/setgid bit.
	registerRe("chmod-setuid", SevBlock, CatEscalation,
		"chmod +s 会设置 setuid/setgid 位；skill 不应给文件加特权位。",
		regexp.MustCompile(`\bchmod\b[^\n]*\+s\b`))

	// chown root — transferring ownership to root, common prep for setuid exploits.
	registerRe("chown-root", SevBlock, CatEscalation,
		"把文件 chown 给 root 通常是为 setuid 做铺垫；skill 不应改属主为 root。",
		regexp.MustCompile(`\bchown\b[^\n]*\broot\b`))

	// setuid / setgid binaries called directly.
	registerRe("setuid-binary", SevBlock, CatEscalation,
		"skill 不应调用 setuid/setgid 二进制；如确需特权操作应改用声明的 tool。",
		regexp.MustCompile(`\b(?:setuid|setgid)\s*\(`))

	// doas / run0 — BSD and modern Linux privilege escalation.
	registerRe("doas-priv", SevBlock, CatEscalation,
		"doas / run0 是特权升级工具，skill 不应使用。",
		regexp.MustCompile(`\b(?:doas|run0)\b`))

	// Capability grant (Linux capabilities).
	registerRe("capability-grant", SevBlock, CatEscalation,
		"setcap 给二进制加 capability 是 privilege 升级；skill 不应使用。",
		regexp.MustCompile(`\bsetcap\b`))

	// pip install --user / npm -g / apt install — packages that install to system scope.
	// Suppressed inside quotes so install-hint strings (`brew install node` in
	// SKILL.md error messages) don't false-positive.
	registerReSuppressInQuotes("system-install", SevBlock, CatEscalation,
		"skill 不应执行系统级安装（apt/yum/pip --user 等）；如需依赖请预装或走声明的 tool。",
		regexp.MustCompile(`\b(?:apt-get\s+install|yum\s+install|pacman\s+-S|brew\s+install|npm\s+install\s+-g|pip\s+install\s+--user)\b`))
}