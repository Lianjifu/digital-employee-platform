// check_skill is a one-shot CLI used during W1-D1 development to vet a skill
// package on disk. Not part of the runtime; will be removed once the vetter is
// wired into the upload path in a later week.
package main

import (
	"fmt"
	"os"

	"github.com/digital-employee-platform/backend/internal/skills/vetter"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: check_skill <root>")
		os.Exit(2)
	}
	r, err := vetter.Run(os.Args[1])
	if err != nil {
		fmt.Printf("err: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("verdict=%s findings=%d\n", r.Verdict, len(r.Findings))
	for _, f := range r.Findings {
		fmt.Printf("  %s %s @%s:%d — %s\n", f.Category, f.Pattern, f.File, f.Line, f.Snippet)
	}
}