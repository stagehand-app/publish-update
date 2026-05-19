# Stagehand: publish-update

GitHub Action that vends a short-lived `EXPO_TOKEN` from Stagehand and runs `eas update --auto` against the checked-out repo.

## Usage

Add `.github/workflows/stagehand.yml` to your repo (the Stagehand setup wizard generates this for you):

```yaml
name: Stagehand publish
on:
  pull_request:
    types: [opened, synchronize, reopened]
  push:
    branches: [main]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: stagehand-app/publish-update@v1
        with:
          project-id: <your-project-uuid>
          stagehand-token: ${{ secrets.STAGEHAND_TOKEN }}
```

Set `STAGEHAND_TOKEN` as a GitHub Secret on the repo; copy its value from the Stagehand setup wizard. The token is per-project, hashed at rest server-side, and rotatable.

## Inputs

| Name                 | Required | Description                                                                  |
| -------------------- | -------- | ---------------------------------------------------------------------------- |
| `project-id`         | yes      | Stagehand project UUID.                                                      |
| `stagehand-token`    | yes      | Per-project STAGEHAND_TOKEN; store as a GitHub Secret.                       |
| `stagehand-api-base` | no       | Override for self-hosted / staging. Defaults to `https://api.stagehand.app`. |

## What it does

1. Detects the package manager (bun → pnpm → yarn → npm) from the lockfile in the workspace.
2. Installs dependencies.
3. POSTs to `<base>/api/projects/<id>/expo-token` with the STAGEHAND_TOKEN. Stagehand decrypts and returns the EXPO_TOKEN.
4. Runs `npx eas-cli update --auto --non-interactive --json` with `EXPO_TOKEN` scoped to that child process only and captures the published update group(s).
5. POSTs `{branch, sha, updateGroupId, runtimeVersion, platform, isDefaultBranch}` to `<base>/api/projects/<id>/updates` (one POST per update group) so the branch surfaces in the Stagehand mobile app.
6. Exits. The token is not exported to the GitHub Actions environment.

## Security

- `EXPO_TOKEN` is never written to disk or to `$GITHUB_ENV`. It only lives in the memory of the `eas-cli` child process and the Node process running the Action.
- `STAGEHAND_TOKEN` is the only customer-stored secret. Stagehand stores it as a SHA-256 hash; the plaintext is shown once during setup.

## Release

Tagged `v1`. Backwards-incompatible changes ship as `v2` with a separate floating tag.

## License

MIT.
