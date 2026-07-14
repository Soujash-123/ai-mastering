# Release Management System

Production-grade release + rollback pipeline for **kord-studio**.

| Role | Repository | Purpose |
| --- | --- | --- |
| Source of truth | [`Syntalix-AI/kord-studio`](https://github.com/Syntalix-AI/kord-studio) | All development, PRs, CI, releases originate here |
| Production | [`Soujash-123/ai-mastering`](https://github.com/Soujash-123/ai-mastering) | Stable, deployable releases only |

Workflows:

- [`.github/workflows/release.yml`](../.github/workflows/release.yml) — **Release to Production**
- [`.github/workflows/rollback.yml`](../.github/workflows/rollback.yml) — **Rollback Production**

## Safety guarantees

- **No `--force`, ever.** Every production update is a plain, fast-forwardable push.
- **History is never rewritten or deleted.** Rollbacks are forward commits, not resets.
- **Backup every release.** A fresh `backup/pre-v{version}-run{n}` branch plus a durable `v{current}` snapshot are created before production changes.
- **Fail closed.** If any validation fails, or production has diverged unexpectedly, the workflow stops and pushes nothing.

---

## 1. Required GitHub Secrets

Configure in **`Syntalix-AI/kord-studio` → Settings → Secrets and variables → Actions**.

| Secret | Required | Description |
| --- | --- | --- |
| `PROD_DEPLOY_TOKEN` | Yes | Token with **write** access to `Soujash-123/ai-mastering` (push branches + tags). Used for all cross-repo Git operations. |

`GITHUB_TOKEN` (built-in) cannot write to a different owner's repository, so a dedicated token is mandatory.

### Creating `PROD_DEPLOY_TOKEN` (recommended: fine-grained PAT)

1. The token owner must have **write/maintain** access to `Soujash-123/ai-mastering`.
2. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate**.
3. **Resource owner:** `Soujash-123`; **Repository access:** only `ai-mastering`.
4. **Repository permissions:** `Contents: Read and write`.
5. Copy the token into the `PROD_DEPLOY_TOKEN` secret above.
6. Set a short expiry and rotate on schedule.

> Classic PAT alternative: scope `repo`. Prefer fine-grained for least privilege.
> Best practice: use a machine/bot account for the token rather than a personal account.

---

## 2. Required Repository Permissions

### Workflow token permissions
Both workflows declare `permissions: contents: read` (least privilege). All writes to production go through `PROD_DEPLOY_TOKEN`.

### Actions settings (`kord-studio`)
- **Settings → Actions → General → Workflow permissions:** `Read repository contents` (default read-only is sufficient).
- Allow `workflow_dispatch` (enabled by default).

### Production environment (approval gate)
Create an environment named **`production`** in `kord-studio` (**Settings → Environments → New environment**):

- **Required reviewers:** add the people allowed to approve production releases/rollbacks.
- Optionally add a **wait timer** and restrict deployment branches to `main`.

Both the `release` job and the `rollback` job run in this environment, so every production change requires a manual approval click.

---

## 3. Required Branch Protection Rules

### `Syntalix-AI/kord-studio` → branch `main`
- Require a pull request before merging (≥1 approval).
- Require status checks to pass before merging — select the CI checks (`Backend validation`, `Frontend validation`, `Docker validation`) once they have run at least once.
- Require branches to be up to date before merging.
- Require conversation resolution.
- Do **not** allow force pushes; do **not** allow deletions.

### `Soujash-123/ai-mastering` → branch `main`
- **Block force pushes** (critical — enforces the "no rewrite history" guarantee at the platform level).
- **Restrict who can push** to only the release bot / `PROD_DEPLOY_TOKEN` owner.
- Do **not** allow deletions.
- Optionally require a linear history.

### `Soujash-123/ai-mastering` → version branches `v*`
- A rule matching `v*` and `backup/**` with **block force pushes** and **block deletions**, so historical release snapshots and backups can never be lost.

---

## 4. Setup Instructions

1. **Add the secret** `PROD_DEPLOY_TOKEN` (section 1).
2. **Create the `production` environment** with required reviewers (section 2).
3. **Apply branch protection** on both repositories (section 3).
4. **Ensure production `main` exists.** The production repo should already contain `v1.0.0`. The pipeline reads the highest `v*` branch/tag to determine the current version.
5. **Commit these workflows** to `main` of `kord-studio`.
6. **Do a dry run:** Actions → *Release to Production* → Run workflow → version `1.0.1`, **dry_run = true**. This runs all validations and prepares refs without pushing.
7. **Real release:** re-run with **dry_run = false** and approve the `production` environment when prompted.

---

## 5. How to run a release

Actions → **Release to Production** → **Run workflow**:

| Input | Example | Notes |
| --- | --- | --- |
| `version` | `1.0.1` | `MAJOR.MINOR.PATCH`; must be newer than current production |
| `release_notes` | `Fix limiter clipping` | Optional; recorded in the release commit |
| `dry_run` | `false` | `true` = validate + prepare, push nothing |

Triggering from **GitHub Releases** (later): publish a release in `kord-studio` tagged `v1.0.1`; the `release: published` trigger runs the same pipeline using the tag as the version.

## 6. How to run a rollback

Actions → **Rollback Production** → **Run workflow**:

| Input | Example | Notes |
| --- | --- | --- |
| `version_branch` | `v1.0.0` | Snapshot branch/tag to restore |
| `confirm` | `v1.0.0` | Must exactly match `version_branch` |
| `reason` | `Regression in v1.0.1` | Optional; recorded in the rollback commit |

Approve the `production` environment to proceed. The rollback creates a backup, then a forward commit on `main` whose content matches the chosen snapshot.

---

## 7. Explanation of every workflow step

### Release workflow

**`preflight`** — fast gate, no production changes:
1. *Checkout* full history of the source repo.
2. *Verify secrets* — fail if `PROD_DEPLOY_TOKEN` missing.
3. *Checking branch* — `workflow_dispatch` must run from `main`.
4. *Clean tree* — abort if uncommitted changes exist.
5. *Resolve/validate version* — enforce `X.Y.Z` format, read current production version from prod refs, and require the new version to be strictly newer (never equal/older).

**`backend`** — Python 3.9: install `backend/requirements.txt`, byte-compile all packages (syntax/type gate), run `pytest`.

**`frontend`** — Node 20: `npm ci`, `npm run lint`, `tsc --noEmit` (type check), `npm run build`.

**`docker`** — validate `docker compose config` for base + prod overlay, then build the backend image and both frontend targets (`runner`, `nginx`).

**`release`** — runs only after all gates pass, inside the `production` environment (manual approval):
1. *Checkout* source into `dev/`.
2. *Creating production backup* — clone prod; guard against divergence (`HEAD == origin/main`); ensure durable `v{current}` snapshot branch; create a fresh `backup/pre-v{new}-run{n}` branch.
3. *Creating release* — branch `v{new}` from prod `main`, `rsync` the source tree in (excluding `.git`, `.github`, build artifacts), commit, fast-forward `main`, create annotated tag `v{new}`.
4. *Updating production* — plain (non-force) pushes of the release branch, `main`, and tag. Divergence causes Git to reject the push and the job fails.
5. *Verifying deployment* — confirm the branch and tag exist on production.

### Rollback workflow

1. *Require confirmation* — `confirm` must equal `version_branch`; validate `vX.Y.Z` format.
2. *Verify secrets*.
3. *Clone production*.
4. *Validate version branch exists* — accept a `v*` branch or tag.
5. *Creating production backup* — push `backup/pre-rollback-v{ver}-run{n}` before changing anything.
6. *Restoring production* — `git read-tree -u --reset <snapshot>` sets the tree to the snapshot while keeping `main` as parent, then a normal commit + non-force push. History is preserved and auditable.
7. *Verifying rollback* — confirm production `main` tree matches the snapshot tree.

---

## 8. Suggestions for improving reliability, security & traceability

**Reliability**
- Add caching for Docker layer builds (`docker/build-push-action` with GHA cache) to speed the release gate.
- Add a post-release smoke test that hits the deployed `/api/health` endpoint before marking success.
- Add a backend integration test job (spin up the API + a real DB) in addition to unit tests.
- Pin action versions to commit SHAs, and pin Python/Node patch versions for reproducibility.

**Security**
- Use a dedicated bot account for `PROD_DEPLOY_TOKEN`; enable required reviewers on `production`.
- Enable secret scanning + push protection on both repos.
- Rotate `PROD_DEPLOY_TOKEN` on a schedule; keep a short expiry.
- Add [OpenSSF `harden-runner`](https://github.com/step-security/harden-runner) to audit/limit egress from release jobs.
- Sign release commits/tags (GPG or Sigstore) and enable "require signed commits" on production.

**Traceability**
- Generate release notes automatically from merged PRs (`release-drafter` or `gh api`).
- Attach the workflow run URL and the source commit SHA to the release commit message.
- Emit a build provenance / SBOM attestation (`actions/attest-build-provenance`).
- Post release + rollback notifications to Slack/Teams with version, actor, and run link.

**Release management**
- Add a scheduled job that lists production `v*` branches so rollback targets are easy to discover.
- Enforce Conventional Commits to derive the next version automatically.
- Consider a staging environment gate before `production` for a full canary step.
