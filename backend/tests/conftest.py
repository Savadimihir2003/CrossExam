from unittest.mock import patch
import pytest


@pytest.fixture(autouse=True)
def block_accidental_live_api_calls():
    """Ensure unit/integration tests never make accidental live Groq API calls."""
    with patch("app.config.settings.GROQ_API_KEY", "gsk_test_mock_key"):
        yield
