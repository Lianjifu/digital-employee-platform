# Clean Skill

A benign skill that only shells out to local Python with no network or
destructive operations. Used as the vetter's positive fixture: every scan
must return `pass` with zero findings.

## Usage

```bash
scripts/safe.sh
```