# 作者记忆协议

作者记忆用于保存跨会话复用的创作偏好，不保存小说世界里的事实。它借鉴“原始证据 → 候选 → 已确认画像 → 变更记录”的记忆管道，但把决定权留给作者。

## 边界与优先级

加载优先级从高到低：

1. 安全、平台、字数、文件协议等硬性门禁；
2. 用户在当前请求中的明确要求；
3. 当前书的 `设定/文风.md`、题材定位、细纲和其他项目设定；
4. 作者记忆中的本书偏好；
5. 作者记忆中的题材、流程和全局偏好；
6. 对标素材、通用方法和默认值。

作者记忆不能把本书事实写进 `.story/作者记忆/`，不能覆盖当前请求，不能降低审稿 rubric，也不能让去 AI 味改动剧情意图。小说事实继续由各书的 `追踪/` 和 `设定/` 管理。

## 文件与所有权

工作区级目录：

```text
{工作区}/.story/作者记忆/
├── _author-memory-state.json  # 唯一结构化权威
├── 作者画像.md               # 仅 active，创作前可读
├── 待确认.md                 # pending / conflict，不参与约束
└── 变更记录.md               # 最近 100 次、最新在前的事务记录
```

三个 Markdown 文件都从 state 确定性生成，禁止手改；完整历史保留在 state，变更记录只展示最近 100 次。作者记忆不存在时，普通写作、审稿和去味任务直接继续，不自动初始化空目录。只有用户明确要求“记住习惯 / 管理作者画像”，或本轮确实出现应记录的稳定偏好时，才初始化。

工作区必须显式传给脚本。优先使用已经包含 `.story/作者记忆/` 的最近祖先；首次初始化时使用承载多本书、`.active-book`、`长篇/`、`短篇/` 或 `拆文库/` 的创作工作区根。不要把用户主目录当默认工作区。

## 什么时候读取

长篇、短篇、去 AI 味开始前，如果 `作者画像.md` 已存在，读取其中与本次任务匹配的 active 条目。审稿时只把它用于交付格式、协作方式和“作者有意采用的表达选择”说明；问题严重度和 PASS/FAIL 仍由 rubric 决定。

待确认项不进入 prompt 约束，也不应为了确认它们中断当前任务。只有用户主动查看作者画像、候选积累到适合回顾的节点，或新偏好与 active 条目冲突时，才集中呈现。

## 捕获判定

| 输入证据 | 处理 |
|---|---|
| “以后都这样”“我一直习惯……”等直接、稳定、范围清楚的原话 | `active`，`source=explicit_user` |
| 用户明确接受助手提出的长期做法 | `active`，`source=accepted_suggestion` |
| 同类修改反复出现，但用户没说这是长期规则 | `pending`，`source=repeated_correction` |
| 从成稿或操作轨迹推断出的模式 | `pending`，`source=inferred_pattern` |
| “这一章别……”“这次给我……”等一次性要求 | 只执行，不记录 |
| 角色、时间线、伏笔、世界观、当前剧情走向 | 写项目设定/追踪，不写作者记忆 |
| 助手自己生成的文字、默认模板、工具告警、rubric 结论 | 不自我学习 |

保留用户的否定词、限定词和适用范围，`quote` 写原话，`assertion` 只做不改变语义的紧凑归纳。范围规则：

- “本书 / 这个角色 / 这次连载” → `book`；
- “都市文 / 这类题材” → `genre`；
- 交稿、检查、确认节奏等操作习惯 → `workflow`；
- “以后 / 一贯 / 我习惯”且无更窄限定 → `global`；
- 范围含糊但可能稳定 → 取当前最窄合理范围并置 `pending`。

类型可选：`prose_style`、`story_design`、`workflow`、`delivery`、`interaction`。置信度与重要度均为 `low | medium | high`。

## 冲突、撤回与强化

- 同一类型、范围、归纳文本再次出现时，脚本强化原条目，累加证据和确认次数，不重复建条目。
- 新偏好与 active 条目矛盾时，先以 `conflict` 记候选，并在 `conflicts_with` 列出冲突 ID；当前任务仍按本轮明确要求执行。
- 作者选定新规则时用 `replace`，一次性启用新条目并把旧条目标成 `superseded`。
- pending 可以用 `decide=activate|reject`；冲突候选不能绕过旧规则直接 activate。
- 作者说“忘掉 / 这不再是我的习惯”时用 `forget`，保留历史证据但不再加载。
- active 条目的语义不可原地偷改；语义变化必须 replace，历史才可审计。

## 运行工具

先依次尝试 `python3`、`python`、`py -3` 找到 Python 3，再从当前 skill 根运行本地副本：

```text
{PYTHON} {当前 skill 根}/scripts/author_memory_commit.py init   --workspace {工作区}
{PYTHON} {当前 skill 根}/scripts/author_memory_commit.py commit --workspace {工作区} --input {事务.json}
{PYTHON} {当前 skill 根}/scripts/author_memory_commit.py check  --workspace {工作区}
```

`commit` 先在内存中完成 schema、引用、容量和所有视图校验，最后原子替换 state 作为提交点。事务文件在成功前必须保留；写入中断后重跑同一 `transaction_id` 和同一内容会幂等返回，复用 ID 提交不同内容会失败。提交前先读 state 的 `state_revision`，原样填进 `expected_state_revision`；过期修订会在任何写入前失败。

## 事务格式

新增或强化：

```json
{
  "schema_version": 1,
  "transaction_id": "2026-08-25-dialogue-preference",
  "expected_state_revision": 0,
  "operations": [
    {
      "action": "remember",
      "preference": {
        "kind": "prose_style",
        "scope": {"level": "global", "value": null},
        "assertion": "对话尽量短，用动作承接情绪，不用大段解释",
        "quote": "以后对话都短一点，情绪放动作里，别让角色长篇解释。",
        "source_ref": "conversation:2026-08-25",
        "source": "explicit_user",
        "confidence": "high",
        "importance": "high",
        "status": "active",
        "reason": "用户以“以后”明确声明长期偏好",
        "conflicts_with": []
      }
    }
  ]
}
```

待确认项的 `status` 用 `pending`；冲突候选用 `conflict` 并填写 active ID。确认或拒绝候选：

```json
{"action":"decide","item_id":"AP002","decision":"activate","quote":"对，这就是我的长期习惯。","reason":"作者明确确认"}
```

用新规则替代一个或多个旧条目时，`replace.preference` 与上例字段相同，但不传 `status`、`conflicts_with`，新条目直接 active：

```json
{
  "action": "replace",
  "old_ids": ["AP001", "AP002"],
  "preference": {
    "kind": "prose_style",
    "scope": {"level": "book", "value": "雾港来信"},
    "assertion": "本书对话允许更长的试探，但避免解释设定",
    "quote": "这本书可以让对话慢一点，多试探，但还是别拿台词讲设定。",
    "source_ref": "conversation:2026-08-25",
    "source": "explicit_user",
    "confidence": "high",
    "importance": "high",
    "reason": "作者明确用本书新规则替代旧候选"
  }
}
```

撤回条目：

```json
{"action":"forget","item_id":"AP003","quote":"忘掉这个偏好。","reason":"作者明确撤回"}
```

一次事务可有 1–32 个 operations；按数组顺序串行应用，任一步失败则整份事务零写入。成功后删除临时事务文件，并运行 `check` 验证派生视图。
