#!/bin/zsh
# Compile a minimal Python entry point against the Python.framework that ships inside Anki.app,
# so the oracle scripts run on exactly the interpreter and backend that Anki itself uses.
set -e
ANKI_APP=${ANKI_APP:-/Applications/Anki.app}
HERE=${0:A:h}
FRAMEWORKS=$ANKI_APP/Contents/Frameworks
VERSION=$(ls $FRAMEWORKS/Python.framework/Versions | grep -v Current | head -1)
clang -o "$HERE/pyhost" "$HERE/pyhost.c" \
    -I"$FRAMEWORKS/Python.framework/Versions/$VERSION/include/python$VERSION" \
    -F"$FRAMEWORKS" -framework Python -Wl,-rpath,"$FRAMEWORKS"
