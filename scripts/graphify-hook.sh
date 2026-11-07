#!/bin/sh
# Claude Code hook entry point for the Graphify code graph (docs/CODE_GRAPH.md).
#
#   graphify-hook.sh session-start                 build or refresh graphify-out/ in the background
#   graphify-hook.sh hook-guard <read|search|compact>
#                                                  Graphify's own nudge toward the graph (stdin: hook JSON)
#
# It fails open: without the Graphify CLI (a cloud session, CI, a machine that never installed it)
# it prints nothing and exits 0, so the hooks in .claude/settings.json never block a session.

if command -v graphify >/dev/null 2>&1; then
    graphify=graphify
    shown=graphify
elif [ -x "$HOME/.local/bin/graphify" ]; then
    graphify="$HOME/.local/bin/graphify"
    shown="~/.local/bin/graphify"
else
    exit 0
fi

case "$1" in
    session-start)
        cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
        [ -f package.json ] && [ -f .graphifyignore ] || exit 0
        mkdir -p graphify-out 2>/dev/null || exit 0
        if [ -f graphify-out/graph.json ]; then state=refreshing; else state=building; fi
        # Detached and niced, so the session starts at once and parallel sessions keep their CPU.
        # Graphify locks the rebuild itself, so an overlapping `graphify update .` waits its turn.
        PYTHONHASHSEED=0 nohup nice -n 10 "$graphify" update . \
            </dev/null >graphify-out/session-update.log 2>&1 &
        echo "Code graph: $state graphify-out/graph.json in the background (about 10 s). Run Graphify as \`$shown\` and query it as AGENTS.md describes."
        ;;
    hook-guard)
        shift
        exec "$graphify" hook-guard "$@"
        ;;
esac
exit 0
