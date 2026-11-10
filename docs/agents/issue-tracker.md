# Issue tracker: Local Markdown

Same convention as `talks/inference-stack`, so one habit covers both repos.

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/PRD.md`
- Implementation issues are `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, from `01`
- Triage state is a `Status:` line near the top of each file (see `triage-labels.md`)
- Blocking is a `Blocked by: NN, NN` line near the top
- Comments append to the bottom under a `## Comments` heading

The GitHub remote exists but is not used for triage: issues live as files.

## When a skill says "publish to the issue tracker"

Create a file under `.scratch/<feature-slug>/`, creating the directory if needed.
