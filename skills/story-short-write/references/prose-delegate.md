# 正文外包（短篇）

**只在 `.story-deployed` 的 `prose_delegate` 为 `agy` 时读本文件。** 字段缺失、为空或 `none` 时整条外包分支不存在，由主会话按原流程分批写正文，也不要向用户提起这个功能。

短篇与长篇的关键差别：短篇是往 `正文.md` **增量追加**，所以委派方的产出一律先落到**临时 segment 路径**，由主会话按 `short-format.md` 的格式规范重排后再并入 `正文.md`。**不要让委派方直接写 `正文.md`。**

## 调用

每批（2-3 节）正文写成一次调用，材料 JSON 至少含 `chapter`（用批次号）、`outline_file`（小节大纲）、`style_file`、`target_chars`、`emotion`、`characters`、`format_constraints`，并把「已写小节摘要」放进 `benchmark_recall`。

**必须给 `skill_references`**——这是短篇外包最容易翻车的地方。写手 agent 模板是长篇/短篇通用的，它的参考表指向通用 `agent-references/`；短篇自己的规范（**默认第一人称**、双轨切换、题材公式、小节格式）全在本 skill 的 references 里。宿主会话本来是加载了本 skill 才动笔的，委派方一点都看不到。实测不给就写成第三人称，而 SKILL.md 明文规定「除非题材明确需要第三人称，否则一律用「我」」。

至少要传：

```json
"skill_references": [
  ".agents/skills/story-short-write/SKILL.md",
  ".agents/skills/story-short-write/references/short-craft.md",
  ".agents/skills/story-short-write/references/short-format.md",
  ".agents/skills/story-short-write/references/genre-writing-formulas.md"
]
```

题材另有专属公式文件时一并加上。路径按当前端的部署根写（Claude Code 写 `.claude/skills/...`，Codex 写 `.codex/skills/...`）。

**另外必须给 `character_files` / `setting_files`**：委派方看不到主会话上下文，角色性别、身份、口吻不给就会自己编，且批与批之间可能不一致。

```
node "{skill 根}/scripts/delegate-prose.js" \
  --project {项目根} --materials {本批材料 JSON} \
  --instructions {narrative-writer 模板路径} \
  --out {临时 segment 路径} --metrics {metrics JSON} \
  --model {prose_delegate_model}
```

## 退出码与回落

| 码 | 含义 | 处理 |
|---|---|---|
| 0 | 成功 | segment 已落盘，按格式规范重排后并入 `正文.md` |
| 1 | `agy` 不在 PATH | **静默回落**主会话自己写，收尾说明本次未走外包 |
| 2 | 未登录或断网 | 同上 |
| 3 | 调用失败 / 超时 | 回落，但**必须显式报出错误原文** |
| 4 | 产出不合格 | 同 3 |

不得把失败说成外包成功。

## 长度

加上 `skill_references` 后短篇会从超长摆到偏短：实测同一批材料，不给规范时 2554 字（目标 2400，+6%）、给了之后 1894 字（−21%）。必读文件变多加上 draft 段的「宁可略短」纪律，两边一起把长度压下来了。

偏短按主会话既有的 `under` 处理（接受当前长度 / 改大纲或目标 / 丢弃），**不要自动再补写一轮**——补写会绕过用户对交付长度的决定权。

## 外包不豁免任何检查

格式重排、去AI味 7 Gate、禁用词、字数与交付契约照常在主会话执行。委派方自报字数不采信（实测自估 3052、实际 4925），以主会话重数为准。

## 平台

prompt 走 stdin，不占命令行长度；helper 按 `PATHEXT` 解析 Windows 上的 `agy` shim。`agy` 自身的 Windows 可用性未经实测——不可用时预检返回 `MISSING_CLI`，外包保持关闭，写作不受影响。
