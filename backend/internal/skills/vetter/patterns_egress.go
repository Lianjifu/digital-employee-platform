package vetter

import "regexp"

// egress patterns: outbound network primitives that may exfiltrate data or
// reach C2 endpoints. All SevBlock — even local-loopback curl calls should be
// reviewed because skill packages shouldn't be issuing HTTP from arbitrary
// subprocess shells (their work goes through declared tool APIs).
func init() {
	// curl http(s)://... — the most common exfiltration vector.
	registerRe("curl-egress", SevBlock, CatEgress,
		"skill 脚本不应直接 curl 外部地址；如需网络请走声明的 tool（如 knowledge.retrieve）。",
		regexp.MustCompile(`\bcurl\b[^\n]*https?://`))

	// wget ... — same vector via a different binary.
	registerRe("wget-egress", SevBlock, CatEgress,
		"skill 脚本不应直接 wget 外部地址。",
		regexp.MustCompile(`\bwget\b[^\n]*https?://`))

	// nc -e / ncat -e — exec through reverse shell.
	registerRe("netcat-exec", SevBlock, CatEgress,
		"nc -e/ncat -e 是反弹 shell 经典手法；skill 不应使用。",
		regexp.MustCompile(`\b(?:nc|ncat|netcat)\b[^\n]*-(?:e|-exec)\b`))

	// bash one-liner piped from network — /dev/tcp on bash, $IFS bypass.
	registerRe("bash-dev-tcp", SevBlock, CatEgress,
		"bash /dev/tcp/* 是反弹 shell 的常见写法；skill 不应使用。",
		regexp.MustCompile(`/dev/tcp/`))

	// python -c with urllib/requests — covered via AST in v2; here we catch
	// the most obvious one-liner form.
	registerRe("python-urllib-one-liner", SevBlock, CatEgress,
		"python -c 调 urllib/requests 会绕过声明；请改用声明的 HTTP tool。",
		regexp.MustCompile(`python[23]?\s+-c[^\n]*(?:urllib|requests|http\.client)`))

	// PowerShell Invoke-WebRequest / iwr / iex — Windows egress pattern.
	registerRe("powershell-iwr", SevBlock, CatEgress,
		"PowerShell IWR/Invoke-WebRequest 是常见外联手法；skill 不应使用。",
		regexp.MustCompile(`\b(?:Invoke-WebRequest|iwr|Invoke-RestMethod|irm)\b`))
}