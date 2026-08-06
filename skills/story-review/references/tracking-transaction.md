# 追踪状态协议

`追踪/` 使用“一个结构化权威状态 + 多个确定性派生视图”。模型只提交一份语义 JSON，不分别 `Write/Edit/echo >>` 多个追踪文件。

## 权威层与派生层

| 层级 | 文件 | 语义 |
|---|---|---|
| 唯一权威 | `_tracking-state.json` | schema、最后提交章、导入截止章、状态修订号、上下文结构、全部当前角色/伏笔/时间线状态 |
| 章节记录 | `逐章记录/第NNN章.md` | 本章对未来连续性有用的紧凑变化；目标 ≤1536 字节，硬上限 3072 字节；导入范围内修订写成覆盖记录 |
| 派生视图 | `上下文.md`、`角色状态/{角色名}.md`、`伏笔.md`、`时间线/作者真相.md`、`时间线/读者已知.md` | 完全从 `_tracking-state.json` 生成；禁止手改，不作为程序输入 |

Markdown 只负责给作者和 Agent 阅读，工具不再反向解析 Markdown。`check` 直接从 `_tracking-state.json` 重渲染并逐文件比较。未来“第几章揭示”的计划写在卷纲/细纲，不写成时间线既成事实。
逐章记录只是便于人阅读的紧凑变化记录，不承诺单独无损重建全部当前状态；完整当前语义以 `_tracking-state.json` 为准。

## 运行工具

先按运行环境探测 Python 3 解释器（依次尝试 `python3`、`python`、`py -3`），再用当前 skill 根目录执行：

```text
{PYTHON} {当前 skill 根}/scripts/tracking_commit.py init   --project {书项目根} --input {初始化事务.json}
{PYTHON} {当前 skill 根}/scripts/tracking_commit.py commit --project {书项目根} --input {逐章事务.json}
{PYTHON} {当前 skill 根}/scripts/tracking_commit.py check  --project {书项目根}
```

- `init`：只在 `_tracking-state.json` 不存在时执行，绝不覆盖已初始化项目。
- `commit`：读取唯一权威状态，在内存中完成合并、引用检查、全部视图渲染和容量检查；随后写逐章记录与派生视图，最后原子替换 `_tracking-state.json` 作为唯一提交点。
- `check`：严格验证 state schema、逐章记录连续性/规范名/体积、固定 7 栏、角色快照硬上限、派生文件集合，以及所有派生视图与 state 的逐字一致性。

同一本书只允许工作流串行提交，不支持多个 Agent 或终端并发写。`expected_state_revision` 用于拒绝基于旧状态构造的顺序 stale transaction，不是并发锁。

事务 JSON 在成功前必须保留。若文件写入失败，`_tracking-state.json` 尚未推进；修正环境后直接重跑**同一份** `commit`。append 重跑只接受内容完全相同的既有逐章记录，不维护 `dirty/pending/repair` 状态机。

校验失败与写入失败处理方式不同：校验失败（字段非法、退役结构、容量超限）要按报错改事务本身，重跑同一份结果不变。派生视图被手改或外部改动导致 `check` 报 `derived view differs from _tracking-state.json` 时，重新提交**该章**的 `mode=revision` 事务让工具整份重建，`expected_state_revision` 取 `追踪/_tracking-state.json` 的 `state_revision` 字段——`check` 失败时只往 stderr 打 ERROR，不输出 JSON；不手改派生文件，也不删 `_tracking-state.json` 重来。手写出的逐章记录会让同章 `append` 永久报 `chapter delta N already exists with different content`——删掉那个手写文件后重跑原事务即可。

本工具不解析旧 `_tracking-meta.json`、`时间线/事件库.json` 或更早追踪结构，不提供语义兼容层。`init` 遇到这类旧文件时，先把它们按原样整体移入 `追踪/_旧追踪存档/`，再在原地建当前协议：旧内容留给作者查阅，不参与解析，当前状态完全以 init 输入为准。校验失败的 `init` 不移动任何文件。`commit` 与 `check` 仍直接拒绝旧结构——它们只在已建协议的项目上运行。

## 初始化事务

新书从第 0 章初始化。`story-import` 导入已有小说时把最后完整章写入 `last_chapter=N`；第 1..N 章不伪造日更记录，常规续写从 N+1 章开始。

```json
{
  "schema_version": 1,
  "book_title": "让你管账号，你高燃混剪炸全网",
  "last_chapter": 0,
  "context": {
    "position": {
      "volume": "第一卷·军宣整顿",
      "volume_start_chapter": 1,
      "story_time": "江晨到火箭军文工团报到前",
      "scene": "火箭军文工团"
    },
    "long_term_constraints": ["军宣爽点要用作品效果和围观反应链兑现，不能只靠系统播报"],
    "active_character_names": [],
    "continuity_risks": [],
    "recent_chapters": [],
    "next_chapter_commitments": ["让江晨报到，并落下五天百万粉的新手任务"]
  },
  "character_snapshots": {},
  "foreshadow": [],
  "timeline_events": []
}
```

导入初始化时直接传入当前核心角色快照、伏笔当前行、时间线事件和固定 7 栏状态输入。阶段/卷级回看按需查询正文，不作为每章强一致追踪产物。

## 逐章事务

```json
{
  "schema_version": 1,
  "mode": "append",
  "chapter": 10,
  "chapter_title": "专业团队拍得还不如他拍的好？",
  "expected_state_revision": 9,
  "delta": {
    "result": "专业团队重拍的高清版在高层看片会上被判定缺了灵魂，张耀祖拍板继续采用江晨的手机原版。",
    "character_changes": [
      {"name": "江晨", "change": "作品价值获军内高层确认，从爆款新人升为不可替代的军宣创作者"}
    ],
    "foreshadow_changes": [
      {
        "action": "upsert",
        "id": "F027",
        "summary": "专业团队仍拍不出江晨原版的灵魂，继续验证其创作能力不可复制",
        "planted_chapter": 10,
        "planned_resolution_chapter": null,
        "status": "已埋",
        "importance": "中"
      }
    ],
    "timeline_events": [
      {
        "action": "upsert",
        "id": "E010",
        "story_time": "实弹训练两天后",
        "objective_fact": "文工团高层否决专业重拍版，决定沿用江晨手机拍摄的原版视频",
        "reader_knowledge": "读者已看到周薄森指出专业版缺了灵魂，张耀祖当场拍板用回原版",
        "reveal_status": "已揭示",
        "reveal_chapter": 10,
        "characters": ["江晨", "周薄森", "张耀祖"]
      }
    ],
    "constraints": ["后续继续用作品落地效果和围观反应放大江晨的高光，不能只写系统奖励数字"],
    "next_chapter_commitments": ["结算五天百万粉任务，并承接老兵主题的新任务"]
  },
  "context": {
    "position": {
      "volume": "第一卷·军宣整顿",
      "volume_start_chapter": 1,
      "story_time": "实弹训练两天后",
      "scene": "火箭军文工团高层看片会"
    },
    "long_term_constraints": ["军宣爽点要用作品效果和围观反应链兑现，不能只靠系统播报"],
    "active_character_names": ["江晨"],
    "continuity_risks": ["钟嘉嘉说江晨只猜对一半，未公开的培养安排不能被当成读者已知事实"]
  },
  "character_snapshots": {
    "江晨": {
      "identity": "火箭军文工团宣传兵；军宣爆款创作者",
      "location": "火箭军文工团高层看片会",
      "goal": "完成五天百万粉任务，持续做出真正能打的军宣内容",
      "state": "专业团队反向验证原版价值，军内认可继续抬升",
      "abilities_resources": ["前世MCN爆款运营经验", "《中国军魂》伴奏", "大师级导演能力"],
      "relationships": ["钟嘉嘉持续提供军报资源", "周薄森和张耀祖已明确认可其创作能力"],
      "knowledge": ["《军报》采访稿已经过审", "原版视频将继续作为正式军宣内容"],
      "open_threads": ["五天百万粉任务尚未结算", "钟嘉嘉所谓只猜对一半仍未解释"]
    }
  }
}
```

约束：

- 构造事务前运行 `check`，把当前 `state_revision` 原样写入 `expected_state_revision`；若状态已经变化，重新读取 state 并重构事务。
- `context` 的允许字段随子命令不同：`init` 收 `position`、`long_term_constraints`、`active_character_names`、`continuity_risks`、`recent_chapters`、`next_chapter_commitments` 六项；`commit` 只收前四项。`recent_chapters` 与 `next_chapter_commitments` 在 commit 时由工具从当前视图和本章 `delta` 派生，手填会在任何写入前被拒（`context contains unsupported fields: ...`，exit 2）。照 init 示例套 commit 事务是最容易踩的一处。
- `character_snapshots` 中出现的角色视为核心复用角色，必须同时出现在 `character_changes`；已经建立快照的核心角色再次变化时必须提交新快照。
- 角色快照的四个列表不限制条数，只限制单项长度和最终文件总字节：目标 ≤4096 字节，超过警告；硬上限 8192 字节，超过则在任何写入前拒绝。
- 没有快照的角色变化视为临时角色，不建立状态文件；`context.active_character_names` 最多 6 人且必须已有当前快照。
- `context.long_term_constraints` 和 `context.continuity_risks` 是整份提交的当前值。凡是上一版有、本次没有的条目，必须逐条列进 `delta.retired_context_items`，否则工具在任何写入前拒绝——漏写不会被当成删除。实际退役的条目由工具写进本章逐章记录的 `## 本章退役登记`，随后仍可回查。
- 不再复用的核心角色写进 `delta.retired_characters`：工具删除其当前快照与 `角色状态/{角色名}.md`，并在逐章记录留档。同一事务里不能既退役又提交快照，也不能退役仍列在 `context.active_character_names` 的角色。角色阵亡/退场这一章，把变化照写进 `character_changes` 即可，本章退役的角色不必再交一份马上要删的快照，逐章记录仍按核心角色标注。退役只表示不再进入热上下文，正文与逐章记录不受影响。
- 两类退役都只能在 `mode=append` 提交。退役表示「从此刻起离开当前状态」，而修订事务的逐章记录属于被改写的旧章，落在那里会谎报退役发生的章节；`mode=revision` 必须原样重交当前全部上下文条目，需要退役就放到下一次 append。
- `伏笔.md` 只呈现已经埋设过的当前状态。未来规划仍留在大纲。
- `timeline_events.action` 可为 `upsert/delete`。`未揭示` 的 `reveal_chapter` 必须为 `null`；部分/完全揭示只能填写已经发生的实际章节。
- `mode=revision` 时，逐章记录必须重算为修订后该章仍然成立的完整连续性记录；当前角色、伏笔、时间线和上下文则提交受影响对象截至最新已写章的当前值。
- 修订导入截止章内的正文时，会新增或覆盖该章的逐章记录；`imported_through_chapter` 不变。

## 续写状态卡固定格式

`上下文.md` ≤12288 字节，由 state 整份生成，只含以下 7 个顶层区块：

1. `## 当前位置`
2. `## 长期约束`
3. `## 核心角色状态`
4. `## 活跃伏笔`
5. `## 近三章速记`
6. `## 下一章承诺`
7. `## 连贯性风险`

其中活跃角色最多 6 人、活跃伏笔确定性选取最多 8 条、近章只保留 3 章。这些是下一章热上下文容量，不是完整角色状态的容量限制。
