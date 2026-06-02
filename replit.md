# CKB Agent Wallet Library

A full-stack programmable wallet system for AI agents on the Nervos CKB blockchain. Agents can manage Cells, sign transactions, open Fiber payment channels, mint DOBs (digital objects/NFTs), and compose OTX intents — all gated behind configurable safety rails.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/dashboard run dev` — run the dashboard (port 23183, proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional env: `WALLET_ENCRYPTION_KEY` — AES-256-GCM passphrase for private key encryption (falls back to `SESSION_SECRET`)
- Optional env: `CKB_RPC_URL` — override default CKB node URL (defaults: testnet.ckb.dev / mainnet.ckb.dev)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 8080)
- Frontend: React + Vite + Tailwind + shadcn/ui (dark theme)
- DB: PostgreSQL + Drizzle ORM
- CKB crypto: `@noble/curves` (secp256k1), `@noble/hashes` (blake2b), `@scure/base` (bech32m)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — Single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle ORM schema files (wallets, safety, audit, fiber, dobs, otx)
- `lib/api-client-react/src/generated/` — Generated React Query hooks
- `lib/api-zod/src/generated/` — Generated Zod validation schemas
- `artifacts/api-server/src/lib/` — CKB core library (wallet, rpc, safety-checker)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/dashboard/src/pages/` — React pages (dashboard, wallets, wallet-detail, safety, audit, fiber, dobs, otx)

## Architecture decisions

- **Contract-first OpenAPI**: All API shapes defined in `openapi.yaml` first, then generated into typed hooks (React Query) and validators (Zod). No hand-written types that duplicate the spec.
- **AES-256-GCM private key encryption**: Private keys are encrypted at rest with PBKDF2-derived keys (100k iterations). Salt + IV + authTag encoded in a single column. Passphrase from `WALLET_ENCRYPTION_KEY` env var.
- **CKB address format**: Full address (new unified format) — `0x00 || code_hash (32B) || hash_type (1B) || lock_args (20B)` bech32m-encoded with `ckb`/`ckt` prefix.
- **Safety rails at route layer**: Every action is checked by `checkSafetyRules()` before execution. Blocked actions are logged to `audit_log` with reason. Kill switch sets `is_killed=true` and blocks everything.
- **@noble/curves v2 API**: `secp256k1.utils.randomSecretKey()` (not `randomPrivateKey`), `sign()` returns `Uint8Array` directly.

## Product

- **Wallets**: Create/delete agent wallets with secp256k1 key generation. View live cells and CKB balance from the node.
- **Safety Rails**: Per-wallet spending limits (per-tx and daily), action whitelist (transfer/sign/fiber/dob/otx), address whitelist, on/off toggle, kill switch.
- **Transactions**: Transfer CKB, sign raw transactions — all safety-rail enforced with full audit trail.
- **Fiber Channels**: Open/close Fiber payment channels, make off-chain payments.
- **DOBs**: Mint digital objects (NFTs) on CKB with metadata, content type, and cluster association.
- **OTX Intents**: Compose and finalize Open Transaction intents for composable on-chain operations.
- **Audit Log**: Complete timestamped record of every operation — success, blocked (with reason), or failed.
- **Dashboard**: System-wide stats, wallet health at a glance, quick actions.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `@noble/curves` v2.2.0: import as `@noble/curves/secp256k1.js` (with `.js` extension) — exports map requires it
- `@noble/hashes` v2.2.0: blake2b is at `@noble/hashes/blake2.js` (not `blake2b.js`)
- DB lib is composite TypeScript — run `pnpm run typecheck:libs` to rebuild before typechecking api-server
- Safety rules with restricted `allowedActions` will block operations that aren't in the list — seeding with restricted rules will cause 400s on blocked action types

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
