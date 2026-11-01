"""Đưa tên skill về dạng chuẩn để sparse search (BM25) và điểm s_skill so khớp đúng.

Quy tắc (giống hệt cho job và CV):
1. Chuẩn hóa Unicode NFC, lowercase, bỏ khoảng trắng thừa.
2. "-" và "_" coi như khoảng trắng; bỏ dấu câu bao quanh (",", ";", "(", ...).
   Giữ lại ".", "+", "#", "/" bên trong vì chúng có nghĩa (node.js, c++, c#, ci/cd).
3. Tra bảng alias trong skills_alias.yaml; không có thì giữ nguyên dạng đã làm sạch.
"""

import re
import unicodedata
from collections.abc import Iterable, Mapping
from functools import lru_cache
from pathlib import Path

import yaml

from app.core.config import get_settings

_SEPARATORS = re.compile(r"[-_\s]+")
_EDGE_PUNCTUATION = " \t\n,;:!?()[]{}\"'`|"


def clean_skill(raw: str) -> str:
    text = unicodedata.normalize("NFC", raw).lower()
    text = _SEPARATORS.sub(" ", text)
    return text.strip(_EDGE_PUNCTUATION).strip()


def to_sparse_token(skill: str) -> str:
    """Nối skill nhiều từ bằng "_" để BM25 coi là một token: "spring boot" -> "spring_boot"."""
    return skill.replace(" ", "_")


class SkillNormalizer:
    def __init__(self, aliases: Mapping[str, Iterable[str]]) -> None:
        self._lookup: dict[str, str] = {}
        for canonical, alias_list in aliases.items():
            canonical_key = clean_skill(canonical)
            for name in [canonical, *(alias_list or [])]:
                key = clean_skill(str(name))
                existing = self._lookup.get(key)
                if existing is not None and existing != canonical_key:
                    raise ValueError(
                        f"Alias '{name}' bị map vào 2 skill: '{existing}' và '{canonical_key}'"
                    )
                self._lookup[key] = canonical_key

    @classmethod
    def from_yaml(cls, path: Path) -> "SkillNormalizer":
        with path.open(encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        if not isinstance(data, dict):
            raise ValueError(f"{path} phải là mapping <tên chuẩn>: [alias, ...]")
        return cls({str(k): v for k, v in data.items()})

    def normalize(self, raw: str) -> str:
        key = clean_skill(raw)
        return self._lookup.get(key, key)

    def normalize_many(self, raw_skills: Iterable[str]) -> list[str]:
        """Chuẩn hóa danh sách skill, bỏ rỗng và trùng lặp, giữ thứ tự xuất hiện."""
        result: dict[str, None] = {}
        for raw in raw_skills:
            skill = self.normalize(raw)
            if skill:
                result.setdefault(skill)
        return list(result)


@lru_cache
def get_normalizer() -> SkillNormalizer:
    return SkillNormalizer.from_yaml(get_settings().skills_alias_path)
