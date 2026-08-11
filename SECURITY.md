# Security policy

## Supported versions

TusAnkiM is under active development. Security fixes are applied to the latest code on the default
branch. Older commits and locally modified builds are not supported separately.

## Reporting a vulnerability

Please do not report security vulnerabilities in public issues, pull requests, discussions, or
screenshots.

Use GitHub's private vulnerability reporting flow:

1. Open the repository's **Security** tab.
2. Select **Report a vulnerability**.
3. Include affected platforms, reproduction steps, impact, and any suggested mitigation.

If private vulnerability reporting is unavailable, contact the repository owner through their
GitHub profile without publishing exploit details.

You can expect an initial acknowledgement within seven days. Please allow time for validation and
a coordinated fix before public disclosure.

## Scope

Examples of relevant reports include:

- Unauthorized access to local card, media, backup, or review data
- Unsafe parsing of imported `.apkg`, JSON, CSV, TSV, HTML, or media content
- Path traversal or file overwrite during import/export
- Script execution through card templates or rendered HTML
- Credentials or sensitive configuration committed to the repository

General bugs, crashes, and feature requests belong in the public issue tracker.
