---
name: CKB DB lib rebuild requirement
description: When adding new tables to lib/db/src/schema/, must run typecheck:libs before api-server sees the exports
---

**Rule:** After adding or modifying `lib/db/src/schema/*.ts`, always run `pnpm run typecheck:libs` before typechecking `@workspace/api-server`.

**Why:** `@workspace/db` is a composite TypeScript lib. Its declaration files (.d.ts) are only emitted by `tsc --build`. Until rebuilt, the api-server's TypeScript sees the stale declarations and reports "Module '@workspace/db' has no exported member 'newTable'" even though the source file exists.

**How to apply:** In any session that adds DB schema tables, run `pnpm run typecheck:libs` before running `pnpm --filter @workspace/api-server run typecheck`. The codegen step (`pnpm --filter @workspace/api-spec run codegen`) already runs `typecheck:libs` internally so it handles the lib rebuild automatically.
