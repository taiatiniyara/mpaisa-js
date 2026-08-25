# Contributing to mpaisa-js

## Development setup

```bash
git clone https://github.com/taiatiniyara/mpaisa-js.git
cd mpaisa-js
npm ci
```

## Day-to-day

```bash
npm run test:watch   # vitest in watch mode
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
```

Or run everything at once:

```bash
npm run ci   # lint + typecheck + test
```

## Changesets

Every PR that changes runtime behaviour must include a [changeset](https://github.com/changesets/changesets) declaring release intent. CI enforces this — PRs without one will fail.

```bash
npx changeset
# → patch / minor / major
# → human-readable description
```

Commit the generated `.changeset/*.md` file with your PR.

**Skip the check** for PRs that don't affect the published package (docs, CI, chore) by adding the `no-release` label.

## Release flow

Releases are fully automated on merge to `main`:

1. **Changeset files accumulate** on `main` across merged PRs.
2. The **Release workflow** opens (or updates) a **"Version Packages" PR** — bumping `package.json`, generating a `CHANGELOG.md`, and deleting the consumed changeset files.
3. A maintainer **reviews and merges** that PR.
4. The Release workflow runs `npm publish --provenance` and the new version is live on npm.

No manual `npm publish` or `npm version` ever.
