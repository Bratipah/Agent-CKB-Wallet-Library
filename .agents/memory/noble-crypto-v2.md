---
name: Noble crypto v2 import quirks
description: @noble/curves and @noble/hashes v2.x require .js extension in imports and have renamed APIs
---

**Rule:** When using `@noble/curves` v2.x and `@noble/hashes` v2.x, always use `.js` extension in imports.

**Why:** The package exports map only lists `"./secp256k1.js"` keys (not `"./secp256k1"`), so extensionless imports fail with TS2307 even though the `.d.ts` files exist at the right paths.

**How to apply:**
- `import { secp256k1 } from "@noble/curves/secp256k1.js"` (not `"@noble/curves/secp256k1"`)
- `import { blake2b } from "@noble/hashes/blake2.js"` (not `"@noble/hashes/blake2b"` — the file is `blake2.js` not `blake2b.js`)
- `secp256k1.utils.randomSecretKey()` (not `randomPrivateKey()` — renamed in v2)
- `secp256k1.sign()` returns `Uint8Array` directly in v2 (no `.toCompactRawBytes()` method)
