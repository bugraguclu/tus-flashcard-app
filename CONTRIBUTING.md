# Contributing to TusAnkiM

Thank you for helping improve TusAnkiM. Focused issues and small, well-tested pull requests are the
easiest to review and maintain.

## Before you start

- Search existing issues and pull requests before opening a new one.
- Use an issue form for bugs and feature requests.
- Do not include private health information, personal study data, credentials, or copyrighted deck
  content in screenshots, logs, fixtures, or commits.
- For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Local setup

Requirements: Node.js 20+, npm, and the platform toolchain needed for native builds.

```bash
git clone https://github.com/bugraguclu/tus-flashcard-app.git
cd tus-flashcard-app
npm ci
npm run check
```

Start a development target with `npm start`, `npm run web`, `npm run ios`, or `npm run android`.

## Development guidelines

- Keep scheduling and persistence behavior in `lib/`; keep screens focused on presentation and
  interaction.
- Preserve local-first and offline behavior.
- Add or update tests for scheduler, import, storage, search, and deck-management changes.
- Keep user-facing copy available in both Turkish and English where the surrounding UI is localized.
- Avoid unrelated formatting or generated-file changes in the same pull request.
- Run `npm run check` before committing. Run `npm run build:web` when changing routing, Metro,
  dependencies, or Web-specific behavior.

## Commit and pull request style

Use a concise conventional commit subject when practical:

```text
feat(editor): add cloze preview
fix(import): preserve deck scheduling
docs(readme): clarify local setup
```

Pull requests should explain:

1. What changed and why
2. User-visible or data-model impact
3. Validation performed
4. Screenshots or recordings for UI changes

By contributing, you agree that your contribution is licensed under the repository's MIT License.
