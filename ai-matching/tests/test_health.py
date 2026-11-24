from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["service"] == "ai-matching"


def test_correlation_id_is_echoed():
    response = client.get("/health", headers={"X-Correlation-ID": "abc-123"})

    assert response.headers["X-Correlation-ID"] == "abc-123"


def test_correlation_id_is_generated_when_missing():
    response = client.get("/health")

    assert len(response.headers["X-Correlation-ID"]) == 32


def test_tests_never_use_real_openai_key():
    """Máy dev có thể có key thật trong ai-matching/.env: test không được dùng nó."""
    from app.core.config import Settings

    assert not Settings().openai_api_key
