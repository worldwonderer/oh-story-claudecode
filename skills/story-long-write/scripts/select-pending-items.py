#!/usr/bin/env python3
"""Select bounded pending-item metadata without reading item contents."""

from __future__ import annotations

import argparse
import bisect
import json
import re
from pathlib import Path
import sys


PENDING_NAME = re.compile(r"^第(?P<target>[0-9]{3,})_源(?P<source>[0-9]{3,})_(?P<sequence>[0-9]{2,})\.md$")
MAX_OUTPUT_ITEMS = 6
MAX_INVALID_SAMPLES = 5


def parse_pending_name(name: str) -> tuple[int, int, int] | None:
    match = PENDING_NAME.fullmatch(name)
    if not match:
        return None
    order = tuple(int(match.group(field)) for field in ("target", "source", "sequence"))
    if not 1 <= order[2] <= 9_999:
        return None
    return order


def canonical_name(target: int, source: int, sequence: int) -> str:
    if target < 0 or source < 0 or not 1 <= sequence <= 9_999:
        raise ValueError("chapter numbers must be non-negative and sequence must be between 1 and 9999")
    return f"第{target:08d}_源{source:08d}_{sequence:04d}.md"


def record_id(target: int, source: int, sequence: int) -> str:
    return canonical_name(target, source, sequence)[:-3]


def next_pending_path(directory: Path, target: int, source: int) -> Path:
    canonical_name(target, source, 1)
    if directory.is_symlink():
        raise RuntimeError("待处理事项目录不能是符号链接")
    directory.mkdir(parents=True, exist_ok=True)
    used_sequences: set[int] = set()
    for entry in directory.iterdir():
        order = parse_pending_name(entry.name)
        if order is not None and order[:2] == (target, source):
            used_sequences.add(order[2])
    for sequence in range(1, 10_000):
        if sequence not in used_sequences:
            return directory / canonical_name(target, source, sequence)
    raise RuntimeError("同一来源章的待处理事项已达到 9999 项，无法分配新文件名")


def select_pending(
    directory: Path,
    current_chapter: int,
    limit: int = MAX_OUTPUT_ITEMS,
    ordinary_count: int = 0,
) -> dict[str, object]:
    if limit < 0 or limit > MAX_OUTPUT_ITEMS:
        raise ValueError(f"limit must be between 0 and {MAX_OUTPUT_ITEMS}")
    if ordinary_count < 0:
        raise ValueError("ordinary item count must be non-negative")

    total = 0
    due_count = 0
    invalid_count = 0
    invalid_samples: list[str] = []
    earliest: list[tuple[tuple[int, int, int], str]] = []

    if directory.is_symlink():
        raise RuntimeError("待处理事项目录不能是符号链接")
    if directory.exists() and not directory.is_dir():
        raise RuntimeError("待处理事项路径存在，但不是目录")
    if directory.is_dir():
        for entry in directory.iterdir():
            if entry.is_symlink():
                invalid_count += 1
                if len(invalid_samples) < MAX_INVALID_SAMPLES:
                    invalid_samples.append(entry.name)
                continue
            if not entry.is_file():
                continue
            order = parse_pending_name(entry.name)
            if order is None:
                invalid_count += 1
                if len(invalid_samples) < MAX_INVALID_SAMPLES:
                    invalid_samples.append(entry.name)
                continue
            total += 1
            if order[0] <= current_chapter:
                due_count += 1
            if limit:
                bisect.insort(earliest, (order, str(entry)))
                if len(earliest) > limit:
                    earliest.pop()

    items = [
        {
            "record_id": Path(path).name[:-3],
            "target_chapter": order[0],
            "source_chapter": order[1],
            "sequence": order[2],
            "path": path,
        }
        for order, path in earliest
    ]
    actionable_count = ordinary_count + due_count
    return {
        "total": total,
        "due_count_capped": min(due_count, MAX_OUTPUT_ITEMS),
        "ordinary_count": ordinary_count,
        "actionable_count": actionable_count,
        "due_overflow": actionable_count > 5,
        "earliest_target": items[0]["target_chapter"] if items else None,
        "items": items,
        "invalid_count": invalid_count,
        "invalid_samples": invalid_samples,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--current-chapter", type=int, default=0)
    parser.add_argument("--limit", type=int, default=MAX_OUTPUT_ITEMS)
    parser.add_argument("--ordinary-count", type=int, default=0)
    parser.add_argument("--next-name", action="store_true")
    parser.add_argument("--target", type=int)
    parser.add_argument("--source", type=int)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.next_name:
        if args.target is None or args.source is None:
            raise SystemExit("--next-name requires --target and --source")
        path = next_pending_path(args.directory, args.target, args.source)
        result: dict[str, object] = {"path": str(path)}
        order = parse_pending_name(path.name)
        if order is None:  # pragma: no cover - next_pending_path always returns a canonical name
            raise RuntimeError("generated pending-item path is invalid")
        result.update(
            record_id=record_id(*order),
            target_chapter=order[0],
            source_chapter=order[1],
            sequence=order[2],
        )
    else:
        result = select_pending(args.directory, args.current_chapter, args.limit, args.ordinary_count)
    payload = (json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    stdout = getattr(sys.stdout, "buffer", sys.stdout)
    stdout.write(payload if stdout is not sys.stdout else payload.decode("utf-8"))
    stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
