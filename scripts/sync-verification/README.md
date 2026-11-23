# Sync verification

Tools that checked the account-sync design in `docs/HESAP_SENKRON.md` before any of it is built.
They are plain Node 24 scripts (no dependencies) and are not part of `npm run quality`.

| Script | What it does |
|---|---|
| `sync-sim.mjs` | Randomized fuzzer: three devices, skewed clocks, lost requests and responses, offline gaps, evicted browser storage. Compares the first design (V1) with the revised one (V2) and checks convergence, causal order per field, the answer log, Kronometre sessions and deck integrity. Mutants switch off one V2 mechanism each to prove the checks catch it. |
| `schema.mjs` | Server-side per-user schema of the revised design. |
| `gen.mjs` | Builds light / typical / heavy user databases in that schema, prints their size, and sets up a load-test fleet (accounts + one typical collection per user). |
| `server.mjs` | Prototype sync server: per-field merge with winners in the response, identity check, long-poll wake-up, paged pull. |
| `load.mjs` | Load generator: every user has an iPhone and a web tab holding long-polls; answers arrive as Poisson pushes and the other device wakes and pulls. Prints server CPU, memory and latencies. |
| `upload-bench.mjs` | Cost of a first sync: ingests a whole collection in 1 MB gzip chunks. |

```bash
node scripts/sync-verification/sync-sim.mjs 10000 1 only-v2
node scripts/sync-verification/sync-sim.mjs 2000 1 no-observe+no-offset mixed
node scripts/sync-verification/gen.mjs /tmp/sync-fleet 300
node scripts/sync-verification/server.mjs /tmp/sync-fleet 8787
node scripts/sync-verification/load.mjs /tmp/sync-fleet 8787 150 10 60 3
node scripts/sync-verification/upload-bench.mjs /tmp/sync-fleet
```

`gen.mjs` with 300 users writes about 1.5 GB. Stop the server when you are done.
