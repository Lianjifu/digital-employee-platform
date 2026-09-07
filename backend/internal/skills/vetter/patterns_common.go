package vetter

import (
	"bufio"
	"bytes"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf8"
)

// pattern is one compiled regex rule with metadata that flows into Finding.
type pattern struct {
	Name       string
	Re         compiledPattern
	Severity   Severity
	Category   Category
	Suggestion string
	// suppressInsideQuotes drops a match whose position falls inside a '...'
	// or "..." region. Used for command-name patterns (sudo, brew install,
	// npm install -g) that are routinely shown in echo/printf install-hint
	// strings and would otherwise false-positive. Off by default — credential
	// patterns like $AWS_SECRET must NEVER be suppressed, even inside quotes.
	suppressInsideQuotes bool
}

// compiledPattern is a thin wrapper over a regex so we can swap in fast
// literal-prefix matching later without touching call sites. For now it is
// just a name + matcher function.
type compiledPattern struct {
	match func(line string) (int, int) // returns [start, end] of match or nil
}

// allPatterns is the registry scanned for every line. Order is irrelevant —
// each rule is independent and we record one Finding per rule per line.
var allPatterns []pattern

func registerPattern(p pattern) {
	allPatterns = append(allPatterns, p)
}

// registerRe is a convenience wrapper that wraps a compiled regexp into the
// compiledPattern match func. Pattern files call this from init() — keeps the
// per-pattern call sites to one line each.
func registerRe(name string, sev Severity, cat Category, suggestion string, re *regexp.Regexp) {
	registerPattern(pattern{
		Name:       name,
		Re:         compiledPattern{match: matchFromRegexp(re)},
		Severity:   sev,
		Category:   cat,
		Suggestion: suggestion,
	})
}

// registerReSuppressInQuotes is like registerRe but additionally drops matches
// whose position falls inside a single- or double-quoted region. Reserved for
// command-name patterns (sudo / brew install / apt-get install / npm -g)
// that are commonly shown as install-hint strings in echo/printf calls and
// would otherwise false-positive. Never enable for credential patterns —
// $AWS_SECRET inside an echo argument is exactly what we want to flag.
func registerReSuppressInQuotes(name string, sev Severity, cat Category, suggestion string, re *regexp.Regexp) {
	registerPattern(pattern{
		Name:                 name,
		Re:                   compiledPattern{match: matchFromRegexp(re)},
		Severity:             sev,
		Category:             cat,
		Suggestion:           suggestion,
		suppressInsideQuotes: true,
	})
}

// matchFromRegexp adapts regexp.Regexp into the (line) -> (start, end) shape
// scanFile expects. Returns (-1, -1) on no match — mirror of regex semantics.
func matchFromRegexp(re *regexp.Regexp) func(string) (int, int) {
	return func(line string) (int, int) {
		loc := re.FindStringIndex(line)
		if loc == nil {
			return -1, -1
		}
		return loc[0], loc[1]
	}
}

// scanFile scans a single file body and appends findings. It honors a 1MB
// per-line ceiling so a pathological binary disguised as text won't blow up
// memory; lines beyond the limit are recorded as a single file-level finding
// and skipped thereafter.
//
// Matches that fall inside a single- or double-quoted region are suppressed
// when the matching pattern declared suppressInsideQuotes — typically
// command-name patterns (sudo / brew install / apt-get install / npm -g)
// that are commonly shown as install-hint strings in echo/printf calls.
// Credential patterns never opt in.
//
// The override map (sourced from .vetter-allow.json) drops matching pattern
// names from the scan entirely. Used by skills that legitimately need a
// flagged primitive (frontend-slides installs vercel globally).
func scanFile(relPath string, body []byte, out *[]Finding, override map[string]bool) {
	const maxLine = 1 << 20 // 1MB
	sc := bufio.NewScanner(bytes.NewReader(body))
	sc.Buffer(make([]byte, 64*1024), maxLine)
	line := 0
	for sc.Scan() {
		line++
		text := sc.Text()
		for _, p := range allPatterns {
			if override[p.Name] {
				continue
			}
			start, end := p.Re.match(text)
			if start < 0 {
				continue
			}
			if p.suppressInsideQuotes && insideQuoted(text, start, end) {
				continue
			}
			*out = append(*out, Finding{
				Category:   p.Category,
				Severity:   p.Severity,
				Pattern:    p.Name,
				File:       relPath,
				Line:       line,
				Snippet:    truncateRunes(text, 120),
				Suggestion: p.Suggestion,
			})
		}
	}
	if err := sc.Err(); err != nil && err != bufio.ErrTooLong {
		// partial scan; ignore but mark the file
	}
}

// quotedSingle and quotedDouble enumerate positions of single- and double-
// quoted regions in a line. Used by insideQuoted to decide whether a match
// position is enclosed in a string literal.
var (
	quotedSingle = regexp.MustCompile(`'(?:[^'\\]|\\.)*'`)
	quotedDouble = regexp.MustCompile(`"(?:[^"\\]|\\.)*"`)
)

// insideQuoted reports whether the byte range [start, end) in line falls
// inside a single- or double-quoted string region. False positives the vetter
// suppresses include install-hint echo strings and printf error messages.
func insideQuoted(line string, start, end int) bool {
	return encloses(quotedSingle.FindAllStringIndex(line, -1), start, end) ||
		encloses(quotedDouble.FindAllStringIndex(line, -1), start, end)
}

func encloses(ranges [][]int, start, end int) bool {
	for _, r := range ranges {
		if start >= r[0] && end <= r[1] {
			return true
		}
	}
	return false
}

// isScannable returns true for text files we want to inspect. Binary files
// (images, archives, compiled artifacts) are skipped to avoid regex noise.
// Markdown is skipped too: SKILL.md and references/*.md are documentation
// prose — example commands shown to readers (curl .../api, brew install ...)
// shouldn't trip the vetter. Real dangerous code lives in scripts/*.sh and
// *.py.
func isScannable(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".sh", ".bash", ".zsh",
		".py", ".rb", ".pl",
		".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
		".yaml", ".yml",
		".json",
		".toml", ".ini", ".cfg", ".conf",
		".txt", ".env",
		"":
		// empty extension is included (e.g. Dockerfile, Makefile-likes).
		// Filtered further by basename below.
		return true
	}
	return false
}

// shouldSkipDir returns true for directories whose contents should never be
// scanned: vendored deps, VCS metadata, build outputs.
func shouldSkipDir(name string) bool {
	switch name {
	case ".git", ".svn", ".hg",
		"node_modules", "venv", ".venv", "__pycache__",
		"dist", "build", "target", ".cache",
		".idea", ".vscode":
		return true
	}
	return false
}

// readFileLimited reads up to limit bytes; if the file is larger it returns
// the first limit bytes plus an error (caller may still scan the head).
func readFileLimited(path string, limit int64) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	buf := &bytes.Buffer{}
	_, err = io.CopyN(buf, f, limit)
	if err == io.EOF {
		err = nil
	}
	if buf.Len() == 0 && err != nil {
		return nil, err
	}
	// Reject obviously binary content (NUL byte in first 8KB).
	head := buf.Bytes()
	if len(head) > 8192 {
		head = head[:8192]
	}
	if bytes.IndexByte(head, 0) >= 0 {
		return nil, nil
	}
	if !utf8.Valid(head) {
		return nil, nil
	}
	return buf.Bytes(), nil
}

// relPath returns path with rootDir trimmed and normalized to forward slashes.
// If path is not under rootDir it returns the original path (caller's bug).
func relPath(rootDir, path string) string {
	r, err := filepath.Rel(rootDir, path)
	if err != nil {
		return filepath.ToSlash(path)
	}
	return filepath.ToSlash(r)
}

// truncateRunes returns s trimmed to at most n runes, with a "…" suffix when
// truncation occurred. Used to keep Finding.Snippet compact.
func truncateRunes(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	var b strings.Builder
	count := 0
	for _, r := range s {
		if count >= n {
			b.WriteString("…")
			return b.String()
		}
		b.WriteRune(r)
		count++
	}
	return b.String()
}
