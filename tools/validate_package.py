#!/usr/bin/env python3
"""Validate the hand-configured GPT package without calling a model or network."""

import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


def validate() -> dict:
    config = json.loads((ROOT / "custom-gpt/builder.json").read_text(encoding="utf-8"))
    errors = []

    def check(condition: bool, message: str) -> None:
        if not condition:
            errors.append(message)

    def local_file(relative: str) -> Path:
        path = (ROOT / relative).resolve()
        if not path.is_relative_to(ROOT):
            raise ValueError(f"配置文件指向仓库之外：{relative}")
        if not path.is_file():
            raise ValueError(f"配置文件不存在：{relative}")
        return path

    check(config.get("format") == "ailiao-gpt-configuration-guide", "配置格式不正确")
    check(config.get("version") == 1, "不支持的配置版本")
    check(bool(config.get("name")), "缺少 GPT 名称")
    check(0 < len(config.get("description", "")) <= 300, "描述应在 1 至 300 字符内")
    instructions = local_file(config["instructions_file"]).read_text(encoding="utf-8")
    check(0 < len(instructions) <= 8000, "指令正文应在 1 至 8000 字符内")

    knowledge = config["knowledge_files"]
    check(len(knowledge) == len(set(knowledge)) and len(knowledge) > 0, "知识文件为空或重复")
    for relative in knowledge:
        text = local_file(relative).read_text(encoding="utf-8")
        check(bool(text.strip()), f"知识文件为空：{relative}")

    starters = config.get("conversation_starters", [])
    check(len(starters) == 4, "应提供四条开场白")
    check(all(isinstance(s, str) and s.strip() for s in starters), "开场白缺失或类型错误")
    check(len(starters) == len(set(starters)), "开场白有重复")

    markdown_files = [ROOT / "custom-gpt/README.md"]
    markdown_files += sorted((ROOT / "custom-gpt/knowledge").glob("*.md"))
    markdown_files += sorted((ROOT / "templates").glob("*.md"))
    link_count = 0
    for path in markdown_files:
        content = path.read_text(encoding="utf-8")
        for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", content):
            target = target.strip().strip("<>")
            url = urlsplit(target)
            if url.scheme or not url.path:
                continue
            resolved = (path.parent / unquote(url.path)).resolve()
            check(resolved.is_relative_to(ROOT) and resolved.is_file(),
                  f"无效本地链接：{path.relative_to(ROOT)} -> {target}")
            link_count += 1

    acceptance = (ROOT / "docs/验收清单.md").read_text(encoding="utf-8")
    rows = re.findall(r"^\| (A\d{2}) \| ([^\n]+) \| ([^\n]+) \|$", acceptance, re.MULTILINE)
    expected_ids = [f"A{i:02}" for i in range(1, 21)]
    check([row[0] for row in rows] == expected_ids, "验收案例编号应为 A01 至 A20，无重复或缺失")
    check(all(row[1].strip() and row[2].strip() for row in rows), "验收案例缺少输入或通过标准")

    if errors:
        raise ValueError("\n".join(errors))

    return {
        "instructions_characters": len(instructions),
        "knowledge_files": len(knowledge),
        "conversation_starters": len(starters),
        "local_links": link_count,
        "manual_acceptance_cases": len(rows),
    }


def main() -> int:
    try:
        result = validate()
    except (KeyError, OSError, ValueError, TypeError) as exc:
        print(f"配置包校验失败：{exc}", file=sys.stderr)
        return 1
    print("配置包结构校验通过：")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print("此结果不代表模型回复、截图识别或联网功能已通过实测。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
