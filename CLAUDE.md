# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The full project context (architecture, domain rules, API, design system, runtime modes) lives in `AGENTS.md` and is the source of truth. Keep `AGENTS.md` updated when you change behavior or structure it describes, instead of duplicating it here.

@AGENTS.md

## Notes specific to Claude Code

- Claude Code runs here in **WSL (bash)** on `/mnt/d/...`, while the user runs the app on Windows + PowerShell. Use plain `curl` in your own shell; when giving the user commands, use `curl.exe` / `Invoke-RestMethod`. `npm run package:win` works only on Windows.
- `node_modules` is installed from Windows, so native binaries (esbuild, `vite`, rollup) don't run in WSL. What works in WSL: `npm run typecheck` (plain `tsc`) and `npm run dev:server` / `node server/main.ts` (Node's built-in type stripping). For bundling/browser checks use a separate Linux install outside the repo (e.g. esbuild + playwright-core in the scratchpad; a headless Chromium is in `~/.cache/ms-playwright`); never reinstall the project's `node_modules`.
- There are no automated tests or linter. Logic lives in plain functions over the `Store` document (`frontend/modules/*/[a-z]*.ts`): verify changes by running them in a scratch script on a copy of the data (bundle with esbuild, `--loader:.css=empty`), plus `npm run typecheck` and a browser check against the server on a data copy.
- `data/` holds the user's real data: `wydatki.json` (written by the app; until the first save the server reads the old `wydatki.db`, which stays as a backup next to `wydatki.backup-2026-09-27.db`). Never save, reset or import against it; point the server at a copy via `WYDATKI_ROOT=<dir containing data/>`.
- Working-tree files use CRLF line endings; keep CRLF in files you edit or create.
- UI texts in Polish, identifiers in English.
