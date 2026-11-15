import unicodedata

import pytest

from app.skills import SkillNormalizer, get_normalizer, to_sparse_token


@pytest.fixture(scope="module")
def normalizer() -> SkillNormalizer:
    return get_normalizer()


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("ReactJS", "react"),
        ("react.js", "react"),
        ("k8s", "kubernetes"),
        ("JS", "javascript"),
        ("springboot", "spring boot"),
        ("Spring-Boot", "spring boot"),
        ("spring_boot", "spring boot"),
        ("  Spring   Boot ", "spring boot"),
        ("Postgres", "postgresql"),
        ("NodeJS", "node.js"),
        ("C#", "c#"),
        ("cpp", "c++"),
        ("CI/CD", "ci/cd"),
        ("(Docker),", "docker"),
    ],
)
def test_normalize_known_aliases(normalizer, raw, expected):
    assert normalizer.normalize(raw) == expected


def test_unknown_skill_is_cleaned_but_kept(normalizer):
    assert normalizer.normalize("  Apache-Flink ") == "apache flink"


def test_vietnamese_is_nfc_normalized(normalizer):
    decomposed = unicodedata.normalize("NFD", "Phân tích dữ liệu")
    assert normalizer.normalize(decomposed) == unicodedata.normalize("NFC", "phân tích dữ liệu")


def test_normalize_many_dedupes_and_keeps_order(normalizer):
    raw = ["ReactJS", "k8s", "react.js", "", "  ", "Kubernetes", "Java"]
    assert normalizer.normalize_many(raw) == ["react", "kubernetes", "java"]


@pytest.mark.parametrize(
    ("skill", "token"),
    [
        ("java", "java"),
        ("spring boot", "spring_boot"),
        ("c++", "c_plus_plus"),
        ("c#", "c_sharp"),
        ("node.js", "node_dot_js"),
        (".net", "dot_net"),
        ("asp.net core", "asp_dot_net_core"),
        ("ci/cd", "ci_cd"),
        ("phân tích dữ liệu", "phân_tích_dữ_liệu"),
    ],
)
def test_to_sparse_token(skill, token):
    assert to_sparse_token(skill) == token


def test_conflicting_alias_is_rejected():
    with pytest.raises(ValueError, match="2 skill"):
        SkillNormalizer({"golang": ["go"], "google": ["go"]})


def test_canonical_names_map_to_themselves(normalizer):
    for canonical in ["spring boot", "node.js", "c++", "aws saa"]:
        assert normalizer.normalize(canonical) == canonical
