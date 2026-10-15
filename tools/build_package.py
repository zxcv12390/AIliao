#!/usr/bin/env python3
"""Build an explicitly selected package; never include local user data."""

import hashlib
import sys
import zipfile
from pathlib import Path

from validate_package import ROOT, validate


def main() -> int:
    try:
        validate()
        # Only distributable source files. No Git metadata or filled-in profiles.
        relative_files = [
            "custom-gpt/README.md",
            "LICENSE",
            "custom-gpt/builder.json",
            "custom-gpt/INSTRUCTIONS.md",
            "custom-gpt/knowledge/01-沟通原则与自然表达.md",
            "custom-gpt/knowledge/02-场景与示例.md",
            "custom-gpt/knowledge/03-知识检索规则.md",
            "templates/我的沟通偏好.md",
            "docs/验收清单.md",
            "tools/validate_package.py",
            "tools/build_package.py",
        ]
        output_dir = ROOT / "dist"
        output_dir.mkdir(exist_ok=True)
        output = output_dir / "AIliao-自定义GPT配置包.zip"
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for relative in relative_files:
                source = (ROOT / relative).resolve()
                if not source.is_relative_to(ROOT) or not source.is_file():
                    raise ValueError(f"文件缺失或在仓库外：{relative}")
                # Fixed timestamp makes repeat builds reproducible.
                info = zipfile.ZipInfo("AIliao/" + relative, date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, source.read_bytes())
        with zipfile.ZipFile(output) as archive:
            if archive.testzip() is not None or len(archive.namelist()) != len(relative_files):
                raise ValueError("压缩包完整性校验失败")
        checksum = hashlib.sha256(output.read_bytes()).hexdigest()
        checksum_file = output.with_suffix(".zip.sha256")
        checksum_file.write_text(f"{checksum}  {output.name}\n", encoding="utf-8")
        print(f"已生成：{output}")
        print(f"文件数：{len(relative_files)}；大小：{output.stat().st_size} 字节")
        print(f"SHA-256：{checksum}")
        return 0
    except (KeyError, OSError, ValueError, TypeError, zipfile.BadZipFile) as exc:
        print(f"打包失败：{exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
