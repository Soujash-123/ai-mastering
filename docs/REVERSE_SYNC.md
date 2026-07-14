# Reverse Production Sync

Brings changes made **directly on production** (`Soujash-123/ai-mastering`) — e.g. emergency
hotfixes — back into **development** (`Syntalix-AI/kord-studio`) through a **Pull Request**,
without ever writing to the development `main` branch.

Workflow: [`.github/workflows/reverse-sync.yml`](../.github/workflows/reverse-sync.yml)
Trigger: manual (`workflow_dispatch`).

This is the mirror of [Release Management](RELEASE_MANAGEMENT.md) (Development → Production).

---

## 1. Required GitHub Secrets

Configure in **`Syntalix-AI/kord-studio` → Settings → Secrets and variables → Actions**.

| Secret | Required | Description |
| --- | --- | --- |
| `PROD_DEPLOY_TOKEN` | Yes | Token with **read** access to `Soujash-123/ai-mastering` (fetch `main`). The same secret used by the release system. |
| `GITHUB_TOKEN` | Built-in | Automatically provided. Pushes the `reverse-update-*` branch and opens the PR **inside this repo**. No setup needed. |

> The production repo is under a different owner, so the built-in `GITHUB_TOKEN` cannot read
> it — `PROD_DEPLOY_TOKEN` is required. A read-only fine-grained PAT (`Contents: Read` on
> `ai-mastering`) is sufficient.

**Optional — trigger CI on the PR.** PRs opened by `GITHUB_TOKEN` do **not** start other
workflows (GitHub anti-recursion rule). If you want the PR to run CI, add a PAT secret
(e.g. `DEV_SYNC_TOKEN` with `contents: write`, `pull-requests: write` on `kord-studio`) and
replace `secrets.GITHUB_TOKEN` with `secrets.DEV_SYNC_TOKEN` in the branch-push and
`Creating Pull Request` steps.

---

## 2. Required Repository Permissions

- **`kord-studio` → Settings → Actions → General → Workflow permissions:** `Read and write`
  (needed so `GITHUB_TOKEN` can push the feature branch and open a PR).
- **Allow GitHub Actions to create and approve pull requests:** enable this checkbox in the
  same settings page.
- The `PROD_DEPLOY_TOKEN` owner needs only **read** access to `ai-mastering`.

## 3. Required GitHub Token Permissions

Declared at the top of the workflow (least privilege):

```yaml
permissions:
  contents: write        # push the reverse-update-* branch (this repo only)
  pull-requests: write   # open the PR (this repo only)
```

The workflow never requests write access to production; `PROD_DEPLOY_TOKEN` is used strictly
for read/fetch.

---

## 4. How to run

Actions → **Reverse Production Sync** → **Run workflow**:

| Input | Example | Notes |
| --- | --- | --- |
| `version` | `1.0.1` | `MAJOR.MINOR.PATCH`; used for the branch/PR name |
| `reason` | `Hotfix applied on prod for limiter clipping` | Optional; recorded in the PR body |

Result (only when production is strictly ahead): a branch `reverse-update-v1.0.1` and a PR
**Reverse Sync: Production v1.0.1** targeting `main`.

---

## 5. Explanation of every workflow step

1. **Validate version input** — enforce `X.Y.Z`; derive the branch name `reverse-update-v{version}`.
2. **Verify required secrets** — fail fast if `PROD_DEPLOY_TOKEN` (or the built-in token) is missing.
3. **Checking repositories...** — initialize one neutral local repo, add `dev` and `prod`
   remotes (tokenized URLs, masked in logs), confirm both default branches are reachable
   (proves auth + access), and fetch full history from both.
4. **Comparing commit histories...** — the core safety gate (see sections 6 & 7). Sets the
   commit SHAs and count, or stops the run.
5. **Check target branch availability** — abort if `reverse-update-v{version}` already exists,
   so an in-flight sync PR is never clobbered.
6. **Creating reverse-update branch...** — point the new branch at production's HEAD and push
   it to development with a plain (non-force) push. Because development is an ancestor of
   production, these are new commits stacked on top of development history — nothing is
   rewritten.
7. **Build pull request body** — assemble SHAs, commit count, changed-file list
   (`git diff --name-status`), reason, and UTC timestamp into `pr_body.md`.
8. **Creating Pull Request...** — open the PR via `gh api` (source = reverse-update branch,
   destination = `main`) and write a run summary. A final step logs success.

If production is already in sync (no production-only commits), the workflow logs
"already in sync", sets `NOTHING_TO_DO=true`, and all branch/PR steps are skipped — nothing
is created.

---

## 6. How commit comparison is performed

All comparison happens in a single local repository that has **both** remotes, so the two
histories can be compared directly:

```bash
git merge-base dev/main prod/main            # must exist (shared ancestor)
git rev-list --left-right --count dev/main...prod/main   # -> "<dev_only> <prod_only>"
```

- `git merge-base` establishes whether the repos share history at all. No common ancestor →
  **unrelated histories** → stop (the comparison would be meaningless/ambiguous).
- `git rev-list --left-right --count A...B` counts commits reachable from one side but not the
  other. With `A = dev/main`, `B = prod/main`:
  - the **left** number = commits only in Development,
  - the **right** number = commits only in Production.

This is an exact, symmetric-difference count — it cannot be fooled by ordering or timestamps.

---

## 7. How the workflow determines that only Production is ahead

Using the two counts (`DEV_ONLY`, `PROD_ONLY`) and an explicit ancestor check:

| Condition | Meaning | Action |
| --- | --- | --- |
| no common ancestor | unrelated histories | **stop** — create nothing |
| `DEV_ONLY > 0` | Development has unique commits (diverged, or Development ahead) | **stop** — create nothing |
| `PROD_ONLY == 0` | Production is not ahead — already in sync | **stop** — nothing to do |
| `DEV_ONLY == 0` and `PROD_ONLY > 0` and `dev/main` is an ancestor of `prod/main` | Production is **strictly ahead** (clean fast-forward) | **proceed** |

The final guard, `git merge-base --is-ancestor dev/main prod/main`, confirms development sits
directly on production's history. Only then is the relationship unambiguous and a conflict-free
merge guaranteed, so the branch + PR are created. Every other case terminates without side
effects — satisfying the "stop and report divergence" requirement.

---

## 8. How the Pull Request is automatically created

After the `reverse-update-v{version}` branch is pushed to the development repo, the workflow
calls the GitHub REST API through the `gh` CLI (preinstalled on runners), authenticated with
`GH_TOKEN`:

```bash
gh api "repos/Syntalix-AI/kord-studio/pulls" \
  -f title="Reverse Sync: Production v${VERSION}" \
  -f head="reverse-update-v${VERSION}" \
  -f base="main" \
  -F body=@pr_body.md \
  --jq '.html_url'
```

- `head` is the reverse-update branch (already pushed, so it exists).
- `base` is `main` — the PR is the **only** path into `main`; the branch is never merged
  automatically and `main` is never pushed to directly.
- The returned `html_url` is logged and added to the job summary for auditability.

---

## Safety summary

- Development `main` is only ever changed via a reviewable PR — never a direct push.
- No `--force`, no `--mirror`, no `reset --hard` on shared branches; only a plain push of a new
  feature branch.
- The workflow creates a branch/PR **only** when Production is strictly ahead with zero
  Development-only commits; all divergence cases stop the run and create nothing.
