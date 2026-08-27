# Security policy

## Supported version

Security fixes are applied to the current iOS `1.x` release line. Update to the newest available
App Store build before reporting a problem. The web build is a local/CI regression target, not a
publicly supported deployment; Android is not a release target.

## Reporting a vulnerability

Do not publish exploitable details in a public issue. Use the repository's
[private security advisory form](https://github.com/bugraguclu/tus-flashcard-app/security/advisories/new)
and include the affected version, platform, reproduction steps, impact, and any proof-of-concept
files. Do not include real learner data.

Reports are acknowledged as soon as practical. A fix and disclosure timeline depends on severity,
reproducibility, App Store review, and whether a native release is required.

## Scope

High-value boundaries include untrusted `.apkg`/`.colpkg`/text imports, editor/card HTML and media,
backup/restore, local collection integrity, native file hand-off, and purchase entitlement state.
Testing must use accounts and data you own or have explicit permission to test.
