#!/usr/bin/env python3
"""Prepare and safely install a migrated writing-status summary."""

from __future__ import annotations

import argparse
import errno
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile


SUMMARY_SECTIONS = (
    "当前位置",
    "文风指纹",
    "长期约束",
    "在场角色",
    "活跃伏笔",
    "近三章速记",
    "下一章必做事项",
    "累计待处理项",
    "十章概要",
    "待办",
    "历史记录索引",
)
LEGACY_SECTIONS = ("最近决策", "待处理线索")
PROTECTED_SECTIONS = set(SUMMARY_SECTIONS + LEGACY_SECTIONS)
MAX_SUMMARY_BYTES = 12_288
UNSUPPORTED_DIRECTORY_FSYNC_ERRNOS = {
    getattr(errno, name)
    for name in ("EINVAL", "ENOTSUP", "EOPNOTSUPP")
    if hasattr(errno, name)
}


def ensure_distinct_paths(*paths: Path) -> None:
    resolved = [path.resolve() for path in paths]
    if len(set(resolved)) != len(resolved):
        raise RuntimeError("migration source, outputs, candidate, and marker must use different paths")


def extract_sections(text: str) -> tuple[str, list[str]]:
    output: list[str] = []
    found: list[str] = []
    keep = False
    for line in text.splitlines(keepends=True):
        if line.startswith("## "):
            title = line[3:].strip()
            keep = title in PROTECTED_SECTIONS
            if keep:
                found.append(title)
        if keep:
            output.append(line)
    return "".join(output), found


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def fsync_directory(directory: Path) -> None:
    if os.name == "nt":
        return
    directory_fd: int | None = None
    try:
        directory_fd = os.open(directory, os.O_RDONLY)
        os.fsync(directory_fd)
    except OSError as error:
        if error.errno not in UNSUPPORTED_DIRECTORY_FSYNC_ERRNOS:
            raise
    finally:
        if directory_fd is not None:
            os.close(directory_fd)


def write_atomic_bytes(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile("wb", dir=path.parent, delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        fsync_directory(path.parent)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def write_atomic_text(path: Path, content: str) -> None:
    write_atomic_bytes(path, content.encode("utf-8"))


def preserve_once(path: Path, content: bytes) -> None:
    if path.exists():
        if path.read_bytes() != content:
            raise RuntimeError(f"refusing to overwrite a different archive: {path}")
        return
    write_atomic_bytes(path, content)


def utf8_tail(content: bytes, byte_limit: int) -> str:
    if byte_limit < 0:
        raise ValueError("tail byte limit must be non-negative")
    start = max(0, len(content) - byte_limit)
    while start < len(content):
        try:
            return content[start:].decode("utf-8")
        except UnicodeDecodeError:
            start += 1
    return ""


def default_manifest(source: Path) -> Path:
    return source.with_name(".上下文迁移.json")


def prepare_migration(
    source: Path,
    protected: Path,
    archive: Path,
    manifest: Path | None = None,
    tail_bytes: int = 8_000,
) -> dict[str, object]:
    manifest = manifest or default_manifest(source)
    ensure_distinct_paths(source, protected, archive, manifest)
    if source.is_symlink() or not source.is_file():
        raise RuntimeError(f"source summary is not a regular file: {source}")
    for output in (protected, archive, manifest):
        if output.is_symlink():
            raise RuntimeError(f"migration output cannot be a symbolic link: {output}")
    source_bytes = source.read_bytes()
    source_text = source_bytes.decode("utf-8")
    extracted, sections = extract_sections(source_text)
    extracted_bytes = extracted.encode("utf-8")

    preserve_once(archive, source_bytes)
    write_atomic_bytes(protected, extracted_bytes)
    marker = {
        "source": str(source.resolve()),
        "protected": str(protected.resolve()),
        "archive": str(archive.resolve()),
        "source_sha256": digest(source_bytes),
        "protected_sha256": digest(extracted_bytes),
        "sections": sections,
    }
    if manifest.exists():
        previous = json.loads(manifest.read_text(encoding="utf-8"))
        if any(previous.get(key) != value for key, value in marker.items()):
            raise RuntimeError(f"a different context migration is already pending: {manifest}")
    else:
        write_atomic_text(manifest, json.dumps(marker, ensure_ascii=False, indent=2) + "\n")

    return {
        **marker,
        "manifest": str(manifest),
        "protected_bytes": len(extracted_bytes),
        "tail": utf8_tail(source_bytes, tail_bytes),
    }


def top_level_sections(text: str) -> list[str]:
    return [line[3:].strip() for line in text.splitlines() if line.startswith("## ")]


def validate_candidate(candidate: Path) -> bytes:
    if candidate.is_symlink() or not candidate.is_file():
        raise RuntimeError(f"candidate summary is not a regular file: {candidate}")
    content = candidate.read_bytes()
    if len(content) > MAX_SUMMARY_BYTES:
        raise RuntimeError(f"candidate summary exceeds {MAX_SUMMARY_BYTES} bytes")
    text = content.decode("utf-8")
    sections = top_level_sections(text)
    if sections != list(SUMMARY_SECTIONS):
        raise RuntimeError("candidate summary must contain the 11 required sections exactly once and in order")
    return content


def install_migration(
    source: Path,
    candidate: Path,
    protected: Path,
    archive: Path,
    manifest: Path | None = None,
) -> dict[str, object]:
    manifest = manifest or default_manifest(source)
    ensure_distinct_paths(source, candidate, protected, archive, manifest)
    for path in (source, protected, archive, manifest):
        if path.is_symlink():
            raise RuntimeError(f"migration input cannot be a symbolic link: {path}")
    marker = json.loads(manifest.read_text(encoding="utf-8"))
    expected_paths = {
        "source": str(source.resolve()),
        "protected": str(protected.resolve()),
        "archive": str(archive.resolve()),
    }
    if any(marker.get(key) != value for key, value in expected_paths.items()):
        raise RuntimeError("migration arguments do not match the pending migration marker")

    archived = archive.read_bytes()
    if digest(archived) != marker["source_sha256"]:
        raise RuntimeError("archive no longer matches the prepared source")
    if digest(protected.read_bytes()) != marker["protected_sha256"]:
        raise RuntimeError("protected-section copy no longer matches the preparation step")

    if not candidate.exists():
        current = source.read_bytes()
        try:
            validate_candidate(source)
        except RuntimeError as error:
            raise RuntimeError("candidate is missing and the original summary is still in place") from error
        if digest(current) == marker["source_sha256"]:
            raise RuntimeError("candidate is missing and the original summary has not been replaced")
        if digest(current) != marker.get("candidate_sha256"):
            raise RuntimeError("installed summary does not match the validated migration candidate")
        manifest.unlink()
        fsync_directory(manifest.parent)
        return {"source": str(source), "status": "already_installed", "bytes": len(current)}

    current = source.read_bytes()
    if digest(current) != marker["source_sha256"]:
        raise RuntimeError("source changed after migration preparation; refusing to replace it")
    replacement = validate_candidate(candidate)
    write_atomic_bytes(candidate, replacement)
    marker["candidate_sha256"] = digest(replacement)
    write_atomic_text(manifest, json.dumps(marker, ensure_ascii=False, indent=2) + "\n")
    os.replace(candidate, source)
    fsync_directory(source.parent)
    manifest.unlink()
    fsync_directory(manifest.parent)
    return {"source": str(source), "status": "installed", "bytes": len(replacement)}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    prepare = subparsers.add_parser("prepare")
    prepare.add_argument("source", type=Path)
    prepare.add_argument("protected", type=Path)
    prepare.add_argument("archive", type=Path)
    prepare.add_argument("--manifest", type=Path)
    prepare.add_argument("--tail-bytes", type=int, default=8_000)

    install = subparsers.add_parser("install")
    install.add_argument("source", type=Path)
    install.add_argument("candidate", type=Path)
    install.add_argument("protected", type=Path)
    install.add_argument("archive", type=Path)
    install.add_argument("--manifest", type=Path)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.command == "prepare":
        result = prepare_migration(
            args.source,
            args.protected,
            args.archive,
            manifest=args.manifest,
            tail_bytes=args.tail_bytes,
        )
    else:
        result = install_migration(
            args.source,
            args.candidate,
            args.protected,
            args.archive,
            manifest=args.manifest,
        )
    payload = (json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    stdout = getattr(sys.stdout, "buffer", sys.stdout)
    stdout.write(payload if stdout is not sys.stdout else payload.decode("utf-8"))
    stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
