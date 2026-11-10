# CLAUDE.md

All agent instructions for this repository live in AGENTS.md (shared with Codex and other agents).

@AGENTS.md

## Model selection (Claude Code only)

Kept here and out of the shared `AGENTS.md`. `opus` for work on the engine code; `sonnet` for running the workflow.

## Session start: sync with origin/main (Claude Code only)

JP works from two computers, so `origin` is the source of truth. The SessionStart hook `.claude/hooks/sync-main.sh` fetches `origin`, fast-forwards only when that is safe, and prints `SYNC:` lines. Read them before anything else. If they report behind, diverged, dirty or offline, stop and tell JP before working. On a branch other than `main`, continue only if JP said so. New work branches from `origin/main`. Before ending a session with local commits or unpushed branches, remind JP to push.
