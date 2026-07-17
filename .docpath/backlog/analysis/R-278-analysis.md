# R-278 Analysis: install --force preserves locally customizable assets (AGENTS.md)

## Requirements

Backlog R-278 addresses the issue where `docpath install --force` blindly overwrites locally customizable assets (such as `AGENTS.md`) and wipes out local modifications (such as custom Git conventions or agent rules). Since `AGENTS.md` is explicitly in the `isLocallyCustomizableInstallAsset` list (exempt from drift checks), the installation process should respect this exemption and avoid destructive overwrites, even when `--force` is specified.

## Proposed Options

### Option A: Interactive Prompt with Non-Interactive Safe Skip (Recommended)
- **Behavior**:
  - If the asset is locally customizable (`isLocallyCustomizableInstallAsset` returns true) and already exists:
    - If stdin is interactive (TTY), prompt the user: `"AGENTS.md contains local customizations. Overwrite anyway?"`
    - If the user confirms, overwrite.
    - If stdin is non-interactive (CI, scripts, agent sessions) or the user declines: **skip** overwriting the asset and print a clear warning: `⚠️  Skipped overwriting locally customizable asset: AGENTS.md. Delete the file manually if you want to reset it.`
- **Pros**: Safe by default; interactive users get a choice; non-interactive environments/agents do not lose local customizations or hang.
- **Cons**: Slightly more complex implementation (handling interactive vs non-interactive check).

### Option B: Safe Skip with Warning (No Prompt)
- **Behavior**:
  - `docpath install --force` will *always* skip overwriting a locally customizable asset if it already exists. It outputs a warning informing the user that the file must be manually deleted to be reset.
- **Pros**: Extremely simple and robust; zero risk of hanging in CI or agent environments.
- **Cons**: Overwriting requires manual file deletion first, but since resetting `AGENTS.md` is rare, this is a reasonable trade-off.

### Option C: Automatic Backup on Overwrite
- **Behavior**:
  - When `--force` is used, automatically rename the existing `AGENTS.md` to `AGENTS.md.local` or `AGENTS.md.bak` before writing the new one.
- **Pros**: Safe, no data lost, completely automated.
- **Cons**: Leaves untracked/backup file clutter in the repository.

---

## Technical Implementation Plan (Option A)

1. **Detect TTY / Interactivity**:
   We can check `process.stdout.isTTY && process.stdin.isTTY`.

2. **Refactor `writeManagedFile`**:
   Accept an optional `isCustomizable: boolean` flag in `writeManagedFile`.
   If the file exists, differs, and `isCustomizable` is true:
   - If `force` is false: skip as usual.
   - If `force` is true:
     - Check if interactive. If yes, prompt with a confirmation.
     - If non-interactive or prompt declined: skip and print a warning message.

3. **Verify via Tests**:
   Add test coverage in `tests/write-commands.test.mjs` or a new test file simulating both interactive and non-interactive `install` behaviors.
