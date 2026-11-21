# Agent Log

A record of changes made by coding agents in this repo: what changed, why, and how it was checked.

---

## 2026-11-21 — Fix scaffold dependency install (npm `edgesOut` crash)

**Problem.** After `npx deepspace app create tutorpulse`, `npm install` failed with
`npm error Cannot read properties of null (reading 'edgesOut')`. Deleting `node_modules` and
`package-lock.json` and running `npm cache verify` didn't fix it.
Environment: Node 22.23.5 (nvm), npm 10.9.9, macOS arm64.

**Cause.** The debug log (`~/.npm/_logs/2026-11-21T18_37_44_792Z-debug-0.log`) shows a
`TypeError` thrown in npm's resolver,
`@npmcli/arborist/lib/arborist/build-ideal-tree.js` → `#loadPeerSet`, while it walked a nested
chain of peer dependencies under `vitest` (the last manifest it fetched was the
`vite@^6 || ^7 || ^8` peer range). This is a bug in npm 10's arborist peer-set resolution, not a
problem with `package.json`, a corrupt cache, or the DeepSpace SDK. So the cache and lockfile
cleanups couldn't help.

**Fix.**
1. Installed with a newer npm: `npx npm@latest install`, which ran npm 12.2.3 on Node 22.23.5.
   The install succeeded: 553 packages, and a fresh `package-lock.json` was written.
   I didn't need `--legacy-peer-deps` (which would hide real peer conflicts) or a switch to bun.
2. npm 12 blocks dependency install scripts unless they're allowlisted. Two packages need theirs:
   `esbuild` (native binary for Vite) and `workerd` (the Workers runtime that `deepspace dev`
   runs on). The scaffold's `pnpm-workspace.yaml` allows the same two for pnpm. I ran
   `npm install-scripts approve esbuild workerd` and then `npm rebuild esbuild workerd`.
   This added an `allowScripts` block to `package.json`. It's the only hand-made change to a
   tracked config file. `fsevents` is still blocked on purpose: it's an optional native file
   watcher and things work without it.
3. I didn't touch anything inside `node_modules`.

**Note on versions.** npm wrote `allowScripts` with exact versions, such as `esbuild@0.28.2`. If
a later install moves esbuild or workerd to a new version, npm 12 will block their scripts
again. Re-run `npx npm@latest install-scripts approve esbuild workerd` when that happens.
Keep using npm ≥ 11 (`npx npm@latest …`, or `npm i -g npm@latest` inside the nvm Node 22.23.5)
so the `edgesOut` crash doesn't come back.

**Verification.**
- `esbuild --version` → 0.27.7. `workerd --version` → 2026-11-17. Both binaries work.
- `npm run type-check` (`tsc --noEmit`) → passes.
- `npm run build` (`vite build`) → passes. The one warning is that the main JS chunk is 569 kB
  (over Vite's 500 kB advisory limit).
- `npm run test:unit` → no test files yet, exits 0.
- `npx deepspace app init` → "Already initialized: app_01M7ZP8D6VYFGEZXFVEZ2HX5YS". The scaffold
  had already registered the app.

**Repo setup.** The git repo already existed (branch `master`, no commits). `.gitignore` already
covers `node_modules`, `.dev.vars`, `.dev.vars.*`, `dist`, `.wrangler` and `.deepspace`. I made
the first commit with the scaffold, `package-lock.json` and this log.

**Open items.** `npm audit` reports 13 vulnerabilities (1 critical, 3 high), all in transitive
dependencies. I left them alone because `npm audit fix --force` may make breaking upgrades. They
need a separate look.
