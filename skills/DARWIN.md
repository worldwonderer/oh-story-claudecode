# Darwin evolution protocol for oh-story-claudecode

This directory is treated as one skill group. Keep each child skill usable on its own, but evaluate changes with the shared protocol below.

## Validation loop

1. Read the changed `SKILL.md` and its local `test-prompts.json`.
2. Run every prompt as either a dry run or a real tool/API/browser test.
3. Check three things for each output: trigger precision, workflow fidelity, and failure handling.
4. Record the result in `darwin-results.tsv` with the date, skill name, score change, tested dimension, note, and eval mode.
5. Keep edits that improve the score without making the skill more verbose or less safe.

## Scoring rubric

| Dimension | Weight | What to check |
|---|---:|---|
| Trigger clarity | 10 | The skill activates on the intended user language and does not over-trigger. |
| Workflow completeness | 15 | The skill gives an actionable sequence instead of vague advice. |
| Reference discipline | 10 | Extra files are loaded only when needed and are cited by local path. |
| Output usefulness | 20 | The final artifact can be used directly by a writer, analyst, or operator. |
| Failure handling | 15 | Missing data, missing env vars, blocked browser sessions, and ambiguous prompts have a clear fallback. |
| Safety boundary | 10 | Login state, cookies, tokens, APIs, and scraping paths are handled conservatively. |
| Style fidelity | 10 | The skill keeps its intended voice and domain taste. |
| Regression coverage | 10 | `test-prompts.json` covers happy path, ambiguity, and one hard/failure path. |

## Acceptance bar

- No changed skill should score below its baseline.
- Browser or API skills must never expose secrets in normal output.
- Scan skills must label whether data is live, user-provided, or historical.
- Writing and analysis skills must produce concrete artifacts, not only advice.
- If a real test cannot be run, mark `eval_mode` as `dry_run` and explain the blocker.
