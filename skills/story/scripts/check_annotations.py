#!/usr/bin/env python3
"""
Story Annotation Checker

Scans story workspace for chapter line-level edit annotations (.story/annotations/**/*.json)
and prints a human-readable summary or JSON. Used by AI agents to discover pending
annotations when user requests '应用注解' / '应用评论' / '应用标注'.

Usage:
    python3 scripts/check_annotations.py [--root <workspace_root>] [--chapter <path>] [--clear] [--json]

Examples:
    python3 scripts/check_annotations.py
    python3 scripts/check_annotations.py --chapter "书名/正文/第001章_章节名.md"
    python3 scripts/check_annotations.py --clear --chapter "书名/正文/第001章_章节名.md"
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path


def discover_annotations(root_dir: Path, target_chapter: str = None) -> list[dict]:
    """Scan .story/annotations for active chapter annotations."""
    ann_dir = root_dir / ".story" / "annotations"
    if not ann_dir.exists():
        return []

    results = []
    for json_file in ann_dir.rglob("*.json"):
        if json_file.name.endswith(".applied.json") or json_file.name.endswith(".bak"):
            continue

        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue

        chapter_path = data.get("chapter_path")
        if not chapter_path:
            rel = json_file.relative_to(ann_dir)
            chapter_path = str(rel)[:-5] if str(rel).endswith(".json") else str(rel)

        if target_chapter and chapter_path != target_chapter:
            continue

        annotations = data.get("annotations")
        if isinstance(annotations, list) and len(annotations) > 0:
            results.append({
                "chapter_path": chapter_path,
                "file_path": str(json_file),
                "updated_at": data.get("updated_at"),
                "annotations": annotations,
            })

    results.sort(key=lambda x: x["chapter_path"])
    return results


def clear_annotations(root_dir: Path, target_chapter: str = None, quiet: bool = False) -> int:
    """Clear annotations for specified chapter or all chapters, archiving them."""
    items = discover_annotations(root_dir, target_chapter)
    cleared_count = 0

    for item in items:
        file_path = Path(item["file_path"])
        applied_path = file_path.with_name(file_path.stem + ".applied.json")

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            anns = data.get("annotations", [])
            cleared_count += len(anns)

            with open(applied_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            data["annotations"] = []
            data["updated_at"] = int(time.time() * 1000)
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            if not quiet:
                print(f"[OK] 已清空并归档批注: {item['chapter_path']} (共清空 {len(anns)} 条)")
        except Exception as e:
            print(f"[ERROR] 清理失败 {file_path}: {e}", file=sys.stderr)

    return cleared_count


def print_human_readable(results: list[dict]):
    if not results:
        print("[OK] 当前没有任何待处理的行级注解 / 批注意见。")
        return

    total_annotations = sum(len(r["annotations"]) for r in results)
    chapter_count = len(results)

    print(f"\n========================================================")
    print(f" 📋 检测到待处理行级注解：共 {total_annotations} 条（分布在 {chapter_count} 个章节）")
    print(f"========================================================\n")

    for r_idx, r in enumerate(results, 1):
        print(f"📖 [{r_idx}/{chapter_count}] 章节：{r['chapter_path']}")
        print(f"   待处理批注数：{len(r['annotations'])} 条\n")

        for idx, ann in enumerate(r["annotations"], 1):
            line = ann.get("line", "?")
            line_text = ann.get("line_text", "").strip()
            comment = ann.get("comment", "").strip()

            snippet = f'"{line_text[:60]}..."' if len(line_text) > 60 else (f'"{line_text}"' if line_text else "(无原文摘要)")
            print(f"   [{idx}] 第 {line} 行：{snippet}")
            print(f"       👉 修改意见：{comment}")
        print()


def main():
    parser = argparse.ArgumentParser(description="Check or clear chapter annotations in oh-story workspace")
    parser.add_argument("--root", default=".", help="Workspace root directory")
    parser.add_argument("--chapter", help="Filter by specific chapter path")
    parser.add_argument("--clear", action="store_true", help="Clear (archive) annotations after applying")
    parser.add_argument("--json", action="store_true", help="Output in JSON format")

    args = parser.parse_args()
    root_dir = Path(args.root).resolve()

    if args.clear:
        cleared = clear_annotations(root_dir, args.chapter, quiet=args.json)
        if not args.json:
            print(f"\n[OK] 清理完成，共归档并移除了 {cleared} 条注解。")
        else:
            print(json.dumps({"ok": True, "cleared": cleared}, ensure_ascii=False))
        return

    results = discover_annotations(root_dir, args.chapter)

    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        print_human_readable(results)


if __name__ == "__main__":
    main()
