# 正文外包（长篇）

**只在 `.story-deployed` 的 `prose_delegate` 为 `agy` 时读本文件。** 字段缺失、为空或 `none` 时整条外包分支不存在，按 workflow-chapter 的原流程写正文，也不要向用户提起这个功能。

外包只替换「写出这一章」这一步。细纲、追踪、去AI味、字数口径、元信息扫描全部留在主会话，一个都不豁免。

## 调用

把本章材料写成 JSON（字段同 workflow-chapter 步骤 7 的 prompt 清单：`chapter`、`outline_file`、`style_file`、`prev_chapter`、`target_chars`、`emotion`、`characters`、`stage_position`、`structure_formula`、`releasable`、`forbidden_early`、`benchmark_recall`、`selected_emotion_module`、`rhythm_reference`、`genre_prose_card`、`author_preferences`、`format_constraints`），然后：

```
node "{skill 根}/scripts/delegate-prose.js" \
  --project {项目根} --materials {材料 JSON} \
  --instructions {narrative-writer 模板路径} \
  --out {正文/第XXX章_章名.md} --metrics {metrics JSON} \
  --model {prose_delegate_model}
```

委派方只读；正文由本脚本落盘。不要给它写权限，也不要让它自己写文件。

## 退出码与回落

| 码 | 含义 | 处理 |
|---|---|---|
| 0 | 成功 | 正文已落盘，照常进入步骤 8-12 |
| 1 | `agy` 不在 PATH | **静默回落**本地 narrative-writer，收尾报告提一句本章未走外包及原因 |
| 2 | 未登录或断网 | 同上 |
| 3 | 调用失败 / 超时 | 回落，但**必须显式报出错误原文** |
| 4 | 产出不合格 | 同 3 |

任何情况下都不得把失败说成外包成功。回落后本章仍要走完全部检查。

## 字数

委派方自报的 `visible_chars` 不可信——实测自估 3052、实际 4925。一律以 `storyctl.py chapter check` 的口径为准。

**外包草稿超长是常态而非异常**（实测目标 3000 出到 4925），步骤 8 的 `over → compress-once` 必然被走到，不要当成错误处理。压缩这一步同样交给委派方：

```
node "{skill 根}/scripts/delegate-prose.js" --mode compress \
  --project {项目根} --materials {材料 JSON，含 current_prose_file 与 delete_chars} \
  --instructions {narrative-writer 模板路径} --out {正文路径} --model {prose_delegate_model}
```

压缩失败按同一套退出码回落到本地压缩。

## 代价

实测 3000 字草稿约 120 秒（`gemini-3.7-flash-high`），比本地写慢。单章 usage 记在 `--metrics` 指定的 JSON 里，可核成本。
