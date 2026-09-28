# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The full project context (architecture, domain rules, API, design system, runtime modes) lives in `AGENTS.md` and is the source of truth. Keep `AGENTS.md` updated when you change behavior or structure it describes, instead of duplicating it here.

@AGENTS.md

## Notes specific to Claude Code

- Claude Code runs here in **WSL (bash)** on `/mnt/d/...`, while the user runs the app on Windows + PowerShell. Use plain `curl` in your own shell; when giving the user commands, use `curl.exe` / `Invoke-RestMethod`. `npm run package:win` works only on Windows.
- `node_modules` is installed from Windows, so native binaries (esbuild → `tsx`, `vite`, rollup) don't run in WSL. What works in WSL: `npm run typecheck` (plain `tsc`), running the API with `node server/index.ts` (Node's built-in type stripping) and `npm run snapshot`. For Vite/browser checks use a separate Linux install outside the repo; never reinstall the project's `node_modules`.
- There are no automated tests or linter. Verify server changes with a before/after `npm run snapshot -- --out <dir> [--compare <baseline>]` (works on a scratch copy of the DB) plus `npm run typecheck`.
- `data/wydatki.db` is the user's real data (a backup `data/wydatki.backup-2026-09-27.db` exists). Don't run destructive endpoints (`DELETE /data`, account deletion, `replaceCsv`) against it; point the server at a copy via `WYDATKI_ROOT=<dir containing data/>`.
- Working-tree files use CRLF line endings; keep CRLF in files you edit or create.
- UI texts in Polish, identifiers in English.
