#!/usr/bin/env python3
"""Regression tests for the structured skill Markdown checker."""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
CHECKER = REPO_ROOT / "scripts/static-check.py"


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def run(root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(CHECKER), "--root", str(root)],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )


def build_agent_catalog(root: Path) -> None:
    write(
        root / "skills/story-setup/references/templates/agents/helper.md",
        "---\nname: helper\ndescription: helper\n---\n",
    )
    write(
        root / "skills/story-setup/SKILL.md",
        "---\nname: story-setup\ndescription: setup\n---\n# Setup\n"
        "Use `references/templates/agents/`.\n",
    )


def test_valid_contract() -> None:
    with tempfile.TemporaryDirectory(prefix="story-static-valid-") as tmp:
        root = Path(tmp)
        build_agent_catalog(root)
        write(
            root / "skills/demo/SKILL.md",
            "---\nname: demo\ndescription: Demo skill\n---\n"
            "# Demo\n\n"
            "Read [the guide](references/guide.md#details).\n\n"
            "Use `references/data/` and spawn `subagent_type: \"helper\"`.\n",
        )
        write(
            root / "skills/demo/references/guide.md",
            "# Guide\n\n## Details\n\n"
            "Continue with [nested details](nested.md#nested-section).\n",
        )
        write(
            root / "skills/demo/references/nested.md",
            "# Nested\n\n## Nested section\n",
        )
        write(root / "skills/demo/references/data/schema.json", "{}\n")

        result = run(root)
        assert result.returncode == 0, result.stdout + result.stderr
        assert "Total: 2 | Pass: 2 | Fail: 0 | Warn: 0" in result.stdout


def test_structural_failures_are_not_hidden_by_prose() -> None:
    with tempfile.TemporaryDirectory(prefix="story-static-invalid-") as tmp:
        root = Path(tmp)
        build_agent_catalog(root)
        write(
            root / "skills/broken/SKILL.md",
            "---\nname: broken\n---\n"
            "# Broken\n\n"
            "This prose contains description: but frontmatter does not.\n\n"
            "[missing](references/missing.md)\n\n"
            "[bad anchor](references/guide.md#does-not-exist)\n\n"
            "`subagent_type: \"ghost\"`\n",
        )
        write(
            root / "skills/broken/references/guide.md",
            "# Guide\n\n## Real section\n\n详见 SKILL.md Phase 2。\n",
        )
        write(root / "skills/broken/references/orphan.md", "# Orphan\n")

        result = run(root)
        assert result.returncode == 1, result.stdout + result.stderr
        for code in (
            "frontmatter-description",
            "broken-link-path",
            "broken-link-anchor",
            "unknown-agent",
            "unlinked-skill-section",
        ):
            assert f"[{code}]" in result.stdout, result.stdout
        assert "[dead-reference]" in result.stdout


def test_local_paths_stay_in_skill_and_repository_scope() -> None:
    with tempfile.TemporaryDirectory(prefix="story-static-path-scope-") as tmp:
        root = Path(tmp)
        build_agent_catalog(root)
        write(
            root / "skills/demo/SKILL.md",
            "---\nname: demo\ndescription: Demo\n---\n# Demo\n\n"
            "Read [the guide](references/guide.md).\n",
        )
        write(
            root / "skills/demo/references/guide.md",
            "# Guide\n\n"
            "A root-relative host path must not pass: [host](/etc/passwd).\n\n"
            "A traversal must fail: [escape](../../../../../../etc/passwd).\n\n"
            "A cross-skill link must fail: "
            "[other](../../other/references/output-contract.md).\n\n"
            "A bare path stays in this skill: `output-contract.md`.\n",
        )
        write(
            root / "skills/other/SKILL.md",
            "---\nname: other\ndescription: Other\n---\n# Other\n\n"
            "Read `references/output-contract.md`.\n",
        )
        write(
            root / "skills/other/references/output-contract.md",
            "# Other output contract\n",
        )

        result = run(root)
        assert result.returncode == 1, result.stdout + result.stderr
        assert "[broken-link-path]" in result.stdout, result.stdout
        assert "[local-path-outside-root]" in result.stdout, result.stdout
        assert "[cross-skill-reference]" in result.stdout, result.stdout
        assert "[broken-inline-path]" in result.stdout, result.stdout


def test_markdown_links_do_not_use_fallback_locations() -> None:
    with tempfile.TemporaryDirectory(prefix="story-static-link-exact-") as tmp:
        root = Path(tmp)
        build_agent_catalog(root)
        write(
            root / "skills/demo/SKILL.md",
            "---\nname: demo\ndescription: Demo\n---\n# Demo\n\n"
            "Read [the guide](references/guide.md).\n",
        )
        write(
            root / "skills/demo/references/guide.md",
            "# Guide\n\n[wrong relative target](duplicate.md)\n",
        )
        write(root / "skills/demo/duplicate.md", "# Same basename, wrong directory\n")

        result = run(root)
        assert result.returncode == 1, result.stdout + result.stderr
        assert "[broken-link-path]" in result.stdout, result.stdout
        assert "references/duplicate.md" in result.stdout, result.stdout


def test_fenced_examples_do_not_leak_into_validation() -> None:
    with tempfile.TemporaryDirectory(prefix="story-static-fence-") as tmp:
        root = Path(tmp)
        build_agent_catalog(root)
        write(
            root / "skills/demo/SKILL.md",
            "---\nname: demo\ndescription: Demo\n---\n# Demo\n\n"
            "```markdown\n"
            "```python\n"
            "[example only](references/missing.md)\n"
            "`subagent_type: \"ghost\"`\n"
            "```\n",
        )

        result = run(root)
        assert result.returncode == 0, result.stdout + result.stderr
        assert "[broken-link-path]" not in result.stdout, result.stdout
        assert "[unknown-agent]" not in result.stdout, result.stdout


def test_fullwidth_paren_agent_refs_are_validated() -> None:
    with tempfile.TemporaryDirectory(prefix="story-static-fullwidth-agent-") as tmp:
        root = Path(tmp)
        build_agent_catalog(root)
        write(
            root / "skills/demo/SKILL.md",
            "---\nname: demo\ndescription: Demo\n---\n# Demo\n\n"
            "**Agent 1: helper**（subagent_type: helper）\n\n"
            "**Agent 2: phantom**（subagent_type: phantom）\n",
        )

        result = run(root)
        assert result.returncode == 1, result.stdout + result.stderr
        assert "unknown subagent_type 'phantom'" in result.stdout, result.stdout
        assert "unknown subagent_type 'helper'" not in result.stdout, result.stdout
        assert result.stdout.count("[unknown-agent]") == 1, result.stdout


def test_cross_skill_paths_in_runtime_scripts_fail() -> None:
    with tempfile.TemporaryDirectory(prefix="story-static-cross-script-") as tmp:
        root = Path(tmp)
        build_agent_catalog(root)
        write(
            root / "skills/demo/SKILL.md",
            "---\nname: demo\ndescription: Demo\n---\n# Demo\n\n"
            "Read [the local guide](references/guide.md).\n",
        )
        write(
            root / "skills/demo/references/guide.md",
            "# Guide\n\nRead [other][foreign].\n\n"
            "[foreign]: ../../story-setup/SKILL.md\n",
        )
        write(
            root / "skills/demo/scripts/runner.js",
            "// Never invoke story-setup/scripts/helper.py from this skill.\n",
        )
        write(
            root / "skills/demo/scripts/runner.cmd",
            "@copy skills\\story-setup\\SKILL.md out.md\r\n",
        )

        result = run(root)
        assert result.returncode == 1, result.stdout + result.stderr
        assert "[cross-skill-reference]" in result.stdout, result.stdout
        assert "scripts/runner.js:1" in result.stdout, result.stdout
        assert "scripts/runner.cmd:1" in result.stdout, result.stdout


def test_foundation_browser_cdp_reference_passes() -> None:
    with tempfile.TemporaryDirectory(prefix="story-static-foundation-") as tmp:
        root = Path(tmp)
        build_agent_catalog(root)
        write(
            root / "skills/browser-cdp/SKILL.md",
            "---\nname: browser-cdp\ndescription: Browser infrastructure\n---\n"
            "# Browser CDP\n",
        )
        write(
            root / "skills/browser-cdp/scripts/setup-cdp-chrome.js",
            "console.log('setup');\n",
        )
        write(
            root / "skills/demo/SKILL.md",
            "---\nname: demo\ndescription: Demo\n---\n# Demo\n\n"
            "Run `browser-cdp/scripts/setup-cdp-chrome.js` first.\n",
        )

        result = run(root)
        assert result.returncode == 0, result.stdout + result.stderr
        assert "[cross-skill-reference]" not in result.stdout, result.stdout


def test_external_urls_are_not_cross_skill_paths() -> None:
    with tempfile.TemporaryDirectory(prefix="story-static-external-url-") as tmp:
        root = Path(tmp)
        build_agent_catalog(root)
        write(
            root / "skills/demo/SKILL.md",
            "---\nname: demo\ndescription: Demo\n---\n# Demo\n\n"
            "See [remote docs](https://example.test/repo/skills/story-setup/SKILL.md), "
            "[uppercase HTTPS](HTTPS://example.test/repo/skills/story-setup/SKILL.md), "
            "and [FTP](FTP://example.test/repo/skills/story-setup/SKILL.md).\n",
        )
        write(
            root / "skills/demo/scripts/runner.js",
            "const docs = 'https://example.test/repo/story-setup/scripts/helper.js';\n",
        )

        result = run(root)
        assert result.returncode == 0, result.stdout + result.stderr
        assert "[cross-skill-reference]" not in result.stdout, result.stdout


def main() -> None:
    test_valid_contract()
    test_structural_failures_are_not_hidden_by_prose()
    test_local_paths_stay_in_skill_and_repository_scope()
    test_markdown_links_do_not_use_fallback_locations()
    test_fenced_examples_do_not_leak_into_validation()
    test_fullwidth_paren_agent_refs_are_validated()
    test_cross_skill_paths_in_runtime_scripts_fail()
    test_foundation_browser_cdp_reference_passes()
    test_external_urls_are_not_cross_skill_paths()
    print("PASS: structured static-check regression")


if __name__ == "__main__":
    main()
