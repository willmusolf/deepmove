# GitHub Review Setup

This document captures the repository settings that should back the local ship workflow.

## Recommended baseline

Enable these settings on GitHub for `main`:

1. Require pull requests before merging.
2. Require status checks to pass before merging.
3. Require at least one approval for larger PRs.
4. Enable auto-merge.
5. Keep draft PRs as the default workflow until checks and review are complete.

If the team gets busier later, add merge queue after the basics are stable.

## AI review options

Pick one primary AI reviewer and let it comment on every PR.

### Option A: GitHub Copilot code review

Use this when you want the simplest native setup inside GitHub.

Recommended settings:

- automatically review new PRs
- review new pushes
- optionally review draft PRs

### Option B: CodeRabbit

Use this when you want a more opinionated, dedicated AI reviewer.

Recommended settings:

- review every new PR
- re-review on each push
- keep human approval required for risky changes

## Human review expectations

AI review is helpful, but it should not be the only gate for risky changes.

Human review should focus on:

- scope control
- regressions
- missing tests
- product correctness
- edge cases and failure handling

## Merge policy

Recommended merge loop:

1. Open a draft PR.
2. Wait for CI and AI review.
3. Address comments in follow-up commits.
4. Convert to ready for review if needed.
5. Enable auto-merge once the branch is green and approved.

## Local sync policy

Do not auto-pull into a dirty local checkout after merge.

Safer options:

- delete the finished worktree and create a new one from updated `main`
- or pull `main` only when the checkout is clean

## Official docs

- GitHub Copilot automatic code review:
  https://docs.github.com/en/copilot/concepts/agents/code-review
- Configure Copilot automatic review:
  https://docs.github.com/copilot/how-tos/copilot-on-github/set-up-copilot/configure-automatic-review
- GitHub auto-merge:
  https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/automatically-merging-a-pull-request
- GitHub merge queue:
  https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/merging-a-pull-request-with-a-merge-queue?tool=webui
