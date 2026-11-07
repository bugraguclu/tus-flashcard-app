# Code graph (Graphify)

Agents working on this repository orient themselves with a code graph instead of reading whole
files. [Graphify](https://github.com/Graphify-Labs/graphify) (PyPI package `graphifyy`,
Apache-2.0) parses the checkout with tree-sitter into a graph of files, symbols, imports, calls,
re-exports and the files and symbols the Markdown docs mention. It runs locally: building the code
graph calls no LLM, and Graphify sends no telemetry.

## Install (once per machine)

```bash
brew install uv
uv tool install "graphifyy[leiden]==0.9.103"
uv tool update-shell   # puts ~/.local/bin on PATH; open a new terminal afterwards
```

Upgrade with `uv tool upgrade graphifyy` after reading its changelog; a new version rebuilds its
AST cache on the next run.

Do not run `graphify install` or `graphify claude install` here. This repository wires Claude Code
itself (below); those commands would add a `CLAUDE.md` and replace the hooks with ones that fail
when Graphify is missing.

## How it is wired

- `.claude/settings.json` (committed; the rest of `.claude/` stays ignored) runs
  `scripts/graphify-hook.sh`:
  - On session start, resume and `/clear`, it starts `graphify update .` detached and at low
    priority. The first build of a new worktree takes about 11 s, a refresh about 5 s. Output and
    log: `graphify-out/`, `graphify-out/session-update.log`.
  - Before `Read`, `Glob`, `Grep` and `Bash` searches, Graphify's `hook-guard` adds a short
    reminder naming the graph and the symbols it already holds for that file, or says the graph
    is stale for a file changed since the build. It never blocks a tool and stops after five
    reminders per session; after a compaction the budget resets.
  - Without Graphify installed (a cloud session, CI, another machine) the script prints nothing
    and exits 0.
- `.graphifyignore` leaves data and binaries out of the graph (the lockfile, `assets/`, catalog
  correction patches, test fixtures, screenshots). `.gitignore` applies too, so `node_modules`,
  `ios/`, `android/` and nested worktrees never enter it.
- `graphify-out/` is gitignored, and each worktree builds its own (about 12 MB with the cache).
  Graphify's git hooks (`graphify hook install`) are not used: they deliberately skip linked
  worktrees, which is where every agent session here runs.
- `metro.config.js` keeps `graphify-out/` out of Metro's watcher.

## Using it

```bash
graphify query "how does answering a card write the review log"   # scoped subgraph, ≤ ~2,000 tokens
graphify explain "studyAnswer.ts"                                   # imports, dependents, line numbers
graphify path "decks.tsx" "logReview()"                             # how two things connect
graphify affected "logReview()"                                     # callers and importers a change reaches
graphify update .                                                   # after adding, moving or renaming code
```

A name that matches several nodes exits with status 3 and lists the candidates; no match exits
with 4. `graphify-out/graph.html` is an interactive view for people; `GRAPH_REPORT.md` (about
19,000 tokens) is for broad architecture reviews only.

## What it saves

Measured on 2026-11-07 (902 files, 7,842 nodes, 25,818 edges, built in 11 s):

| Question | Reading files | Through the graph |
| --- | --- | --- |
| How does answering a card write the review log? | `studyAnswer.ts`, `reviewLogger.ts`, `studyRepository.ts`, `fsrsScheduler.ts`: about 16,000 tokens | `explain` and `path`: about 650 tokens, then the `answerStudyCard` lines: about 1,300 tokens |

That is roughly an eighth of the tokens for orientation. `graphify benchmark` reports 423× because
it compares one query with reading the entire corpus (about 523,000 tokens), which no agent does.
Reading the lines you actually change costs the same as before.

## Troubleshooting

- No graph yet: run `graphify update .` in the checkout root, or read
  `graphify-out/session-update.log`.
- After a refactor that deleted many symbols, `update` refuses to shrink the graph: run
  `graphify update . --force`.
- Graphify appends each question to `~/.cache/graphify-queries.log` on this machine; set
  `GRAPHIFY_QUERY_LOG_DISABLE=1` to stop it.
- The `/graphify` skill's semantic pass over the docs, which spends LLM tokens, is not set up; the
  AST graph already links the docs to each other and to the code they name.
- To remove it: delete the hooks from `.claude/settings.json`, then `rm -rf graphify-out` and
  `uv tool uninstall graphifyy`.
