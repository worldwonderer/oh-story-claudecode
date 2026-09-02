# 正文外包（短篇）

**只在 `.story-deployed` 的 `prose_delegate` 为 `agy` 时读本文件。** 字段缺失、为空或 `none` 时整条外包分支不存在，由主会话按原流程分批写正文，也不要向用户提起这个功能。

短篇与长篇的关键差别：短篇是往 `正文.md` **增量追加**，所以委派方的产出一律先落到**临时 segment 路径**，由主会话按 `short-format.md` 的格式规范重排后再并入 `正文.md`。**不要让委派方直接写 `正文.md`。**

## 调用

每批（2-3 节）正文写成一次调用，材料 JSON 至少含 `chapter`（用批次号）、`outline_file`（小节大纲）、`style_file`、`target_chars`、`emotion`、`characters`、`format_constraints`，并把「已写小节摘要」放进 `benchmark_recall`：

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

## 外包不豁免任何检查

格式重排、去AI味 7 Gate、禁用词、字数与交付契约照常在主会话执行。委派方自报字数不采信（实测自估 3052、实际 4925），以主会话重数为准。
