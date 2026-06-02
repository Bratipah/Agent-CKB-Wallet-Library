# CKB Agent Wallet Library

A full-stack programmable wallet system for AI agents on the Nervos CKB blockchain. Agents can manage Cells, sign transactions, open Fiber payment channels, mint DOBs (digital objects/NFTs), and compose OTX intents — all gated behind configurable safety rails.
Any developer or business to deploy AI agents that can manage assets programmatically without risking catastrophic financial loss


![Wallet Library](https://github.com/Bratipah/Agent-CKB-Wallet-Library/blob/main/assets/Screenshot%20from%202026-06-02%2004-34-03.png)


## Customers 
- **Trading Firms**: Algorithmic trading bots requiring secure key management
- **Game Studios**: In-game AI characters managing virtual economies
- **DAO Treasuries**: Automated treasury management with spending controls
- **Enterprise Blockchain Teams**: Supply chain, payments, or identity solutions
- **CKB Power Users**: Users wanting their own trading or automation bots
- **NFT Artists**: Agents that mint DOBs autonomously
- **DeFi Yield Farmers**: Automated yield optimization agents

## Product

- **Wallets**: Create/delete agent wallets with secp256k1 key generation. View live cells and CKB balance from the node.
- **Safety Rails**: Per-wallet spending limits (per-tx and daily), action whitelist (transfer/sign/fiber/dob/otx), address whitelist, on/off toggle, kill switch.
- **Transactions**: Transfer CKB, sign raw transactions — all safety-rail enforced with full audit trail.
- **Fiber Channels**: Open/close Fiber payment channels, make off-chain payments.
- **DOBs**: Mint digital objects (NFTs) on CKB with metadata, content type, and cluster association.
- **OTX Intents**: Compose and finalize Open Transaction intents for composable on-chain operations.
- **Audit Log**: Complete timestamped record of every operation — success, blocked (with reason), or failed.
- **Dashboard**: System-wide stats, wallet health at a glance, quick actions.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 8080)
- Frontend: React + Vite + Tailwind + shadcn/ui (dark theme)
- DB: PostgreSQL + Drizzle ORM
- CKB: `@noble/curves` (secp256k1), `@noble/hashes` (blake2b), `@scure/base` (bech32m) `@ckb-lumos/ckb-indexer`
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)


[![Current Project Snapshot]](https://github.com/Bratipah/Agent-CKB-Wallet-Library/blob/main/assets/Screencast%20from%202026-06-02%2004-34-19.webm)   

