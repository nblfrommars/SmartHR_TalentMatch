import unicodedata

import pytest

from app.text import clean_text, normalize_keyword, scrub_pii, segment, strip_html, truncate


def test_strip_html_keeps_block_breaks_and_unescapes():
    text = strip_html("<p>Spring Boot &amp; Kafka</p><ul><li>Docker</li></ul>")

    assert "Spring Boot & Kafka" in text
    assert "<" not in text
    assert "\n" in text


@pytest.mark.parametrize(
    "pii",
    [
        "hr@abc.vn",
        "nguyen.van-a+jobs@mail.example.com",
        "0912345678",
        "0912.345.678",
        "0912 345 678",
        "+84 912 345 678",
        "024 3826 1234",
        "https://linkedin.com/in/nguyen-van-a",
        "www.facebook.com/nguyenvana",
        "linkedin.com/in/nguyen-van-a",
        "github.com/nguyenvana",
        "topcv.vn/xem-cv/abc123",
    ],
)
def test_scrub_pii_removes_contacts(pii):
    assert pii not in scrub_pii(f"Liên hệ {pii} nhé")


@pytest.mark.parametrize(
    "safe",
    [
        "lương 20000000 VND",
        "2020-2023",
        "IELTS 6.5",
        "3.5 năm",
        "node.js",
        "+5 năm kinh nghiệm",
        "React.js/Vue.js",
        "ASP.NET Core",
        "CI/CD",
    ],
)
def test_scrub_pii_keeps_normal_numbers(safe):
    assert scrub_pii(safe) == safe


def test_truncate_does_not_cut_words():
    assert truncate("phát triển phần mềm", 12) == "phát triển"
    assert truncate("ngắn", 100) == "ngắn"


def test_clean_text_pipeline():
    raw = unicodedata.normalize("NFD", "<b>Kỹ sư</b>   phần mềm\n\n\n\nEmail: a@b.com")

    # nhãn "Email:" bị bỏ cùng địa chỉ email, không để lại nhãn trơ trọi
    assert clean_text(raw) == unicodedata.normalize("NFC", "Kỹ sư phần mềm")
    assert clean_text(None) == ""


def test_normalize_keyword():
    assert normalize_keyword("  Hà   Nội ") == "hà nội"
    assert normalize_keyword("   ") is None
    assert normalize_keyword(None) is None


def test_segment_joins_vietnamese_compounds():
    tokens = segment("Phát triển phần mềm tại Hà Nội!")

    assert "phát_triển" in tokens
    assert "phần_mềm" in tokens
    assert "hà_nội" in tokens
    assert "!" not in tokens


def test_segment_splits_ascii_compounds_consistently():
    # pyvi có thể nối "Backend_Developer"; ta luôn tách từ tiếng Anh thành từ rời
    assert segment("Senior Java Backend Developer") == ["senior", "java", "backend", "developer"]


def test_segment_empty():
    assert segment("") == []
    assert segment(None) == []
    assert segment("  ...  ") == []


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Liên hệ: a@b.com, 0912345678.", ""),
        ("Email: a@b.com | SĐT: 0912 345 678 | Web: github.com/x", ""),
        ("Tôi tên A (a@b.com). Thích Java.", "Tôi tên A. Thích Java."),
        ("Liên hệ: a@b.com hoặc 0912345678 để trao đổi", "để trao đổi"),
        ("Email: a@b.com; phone: +84 912 345 678; Hà Nội", "Hà Nội"),
        ("Liên hệ: a@b.com, 0912345678. Thích Java", "Thích Java"),
        ("Backend dev. Liên hệ: a@b.com, 0912345678. Thích Java", "Backend dev. Thích Java"),
        ("Đang học... Email: a@b.com. Thích Java", "Đang học... Thích Java"),
        (
            "Backend dev (Java, Spring). Email: x@y.vn\nKinh nghiệm: 3 năm",
            "Backend dev (Java, Spring).\nKinh nghiệm: 3 năm",
        ),
    ],
)
def test_scrub_pii_leaves_no_dangling_labels_or_punctuation(raw, expected):
    assert clean_text(raw) == expected


@pytest.mark.parametrize(
    "text",
    [
        "Skills: Java, C++, Node.js.",
        "Thời gian: 2020 - 2023: làm Java",
        "Dự án (cá nhân): web bán sách; công nghệ: React, Spring.",
    ],
)
def test_text_without_pii_is_unchanged(text):
    assert clean_text(text) == text
