#!/bin/zsh
# Run a Python script with the interpreter and `anki` package bundled inside Anki.app.
# Build the host once with ./build-host.sh. ANKI_APP overrides the app location.
set -e
ANKI_APP=${ANKI_APP:-/Applications/Anki.app}
HERE=${0:A:h}
FRAMEWORK=$ANKI_APP/Contents/Frameworks/Python.framework/Versions/Current
PYTHONHOME=$FRAMEWORK PYTHONPATH=$ANKI_APP/Contents/Resources/app_packages exec "$HERE/pyhost" "$@"
