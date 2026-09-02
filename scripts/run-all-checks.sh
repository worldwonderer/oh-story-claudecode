#!/usr/bin/env bash
# 本地一次性跑完 CI 的静态检查集合，方便提交前自查。CI 仍以工作流文件为准。
cd "$(dirname "$0")/.."
pass=0
fail=0
for c in check-story-doctor.sh check-prose-delegate.sh check-doc-budget.sh \
         check-shared-files.sh check-current-skill-contracts.sh \
         check-story-setup-deployment.sh check-antigravity-adapter.sh \
         check-claude-adapter.sh check-codex-adapter.sh check-opencode-adapter.sh \
         check-zcode-adapter.sh check-reasonix-adapter.sh check-openclaw-skills.sh \
         check-python-invocation.sh check-hook-regex-sync.sh \
         check-scan-runtime-policy.sh check-hook-locale-safety.sh; do
  if bash "scripts/$c" </dev/null >/dev/null 2>&1; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    echo "FAIL $c"
  fi
done
for c in test-static-check.py test-current-skill-contracts.py test-shared-assets.py \
         test-shared-references.py check-agent-reference-consumers.py \
         check-current-skill-contracts.py check-short-analysis-scope.py; do
  if python3 "scripts/$c" </dev/null >/dev/null 2>&1; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    echo "FAIL $c"
  fi
done
for c in test-phase2-contract.js test-delivery-contract.js check-reference-gates.js \
         test-outline-contract.js test-normalize-punctuation.js; do
  if node "scripts/$c" </dev/null >/dev/null 2>&1; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    echo "FAIL $c"
  fi
done
echo "PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ]
