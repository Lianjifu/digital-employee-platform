package vetter

import "regexp"

// credential patterns: reading or leaking secrets. All SevBlock.
func init() {
	// AWS access keys / secrets — env var references and JSON shape.
	registerRe("aws-credential", SevBlock, CatCredential,
		"script 不应直接读取 AWS_* 凭据；如需调用请用声明的 tool。",
		regexp.MustCompile(`\$\{?(?:AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|AWS_SESSION_TOKEN)\}?`))

	// GitHub tokens — env or PAT-style literal.
	registerRe("github-token", SevBlock, CatCredential,
		"script 不应直接读取 GITHUB_TOKEN；请用声明的 tool。",
		regexp.MustCompile(`\$\{?(?:GITHUB_TOKEN|GH_TOKEN|GITHUB_PAT)\}?`))

	// OpenAI / Anthropic / Google API keys.
	registerRe("openai-key", SevBlock, CatCredential,
		"script 不应直接读取 OPENAI_API_KEY；请用声明的 tool。",
		regexp.MustCompile(`\$\{?(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|VERTEX_API_KEY)\}?`))

	// Reading the AWS credentials file — direct secret exfiltration.
	registerRe("aws-credentials-file", SevBlock, CatCredential,
		"script 不应读取 ~/.aws/credentials；凭据应通过声明的 tool 注入。",
		regexp.MustCompile(`(?:\bcat\b|\bcp\b|\bcp\s+-r\b|\bcurl\b)[^\n]*\.aws/credentials`))

	// Reading .env / .envrc / .npmrc / .netrc — all carry secrets. The keyword
	// (cat|cp|curl|node|env) must be followed by whitespace so JS object keys
	// (`env: { ...process.env, ... }`) don't false-positive. The enumerated
	// terminator after `.env` prevents `.env.WINDIR` style property access
	// from sneaking through. (Go's RE2 has no negative lookahead.)
	registerRe("dotenv-read", SevBlock, CatCredential,
		"script 不应读取 .env / .envrc / .npmrc / .netrc 等凭据文件。",
		regexp.MustCompile(`(?:\bcat\b|\bcp\b|\bcurl\b|\bnode\b|\benv\b)\s+[^\n]*\.(?:env|envrc|npmrc|netrc|pgpass|pypirc)(?:[\s'"\\);,<>|]|$)`))

	// ssh private key access.
	registerRe("ssh-private-key", SevBlock, CatCredential,
		"script 不应读取 ~/.ssh/id_* 私钥；远程操作请走声明的 tool。",
		regexp.MustCompile(`(?:\bcat\b|\bcp\b|\bscp\b)[^\n]*\.ssh/id_(?:rsa|ed25519|ecdsa)`))

	// Generic bearer/authorization header construction — high signal for token smuggling.
	registerRe("auth-bearer-header", SevBlock, CatCredential,
		"脚本里手写 Authorization: Bearer ... 通常意味着窃取/注入凭据，请改用声明的 tool。",
		regexp.MustCompile(`Authorization\s*:\s*Bearer\s+[A-Za-z0-9._\-]{16,}`))

	// Hard-coded API key literals in source (sk-..., ghp_..., AKIA...).
	registerRe("hardcoded-key-literal", SevBlock, CatCredential,
		"出现形如 sk-.../ghp_.../AKIA... 的字面量通常是硬编码的密钥，请改用环境变量或声明 tool。",
		regexp.MustCompile(`\b(?:sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[bpars]-[A-Za-z0-9-]{10,})\b`))
}