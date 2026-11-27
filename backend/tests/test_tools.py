from unittest.mock import MagicMock, patch
import httpx
import pytest

from app.tools.search import _clean_text, search_duckduckgo
from app.tools.verifier import verify_url_reachability


def test_search_clean_text():
    """Verify HTML stripping, entity unescaping, and word truncation."""
    html_input = "<div><p>NASA climate data confirms <b>accelerating</b> sea levels.</p></div>"
    cleaned = _clean_text(html_input, max_words=5)
    assert "<" not in cleaned
    assert ">" not in cleaned
    assert len(cleaned.split()) <= 6

    entity_input = "&lt;b&gt;NASA climate data&lt;/b&gt; confirms sea levels."
    cleaned_entities = _clean_text(entity_input, max_words=10)
    assert "<" not in cleaned_entities
    assert ">" not in cleaned_entities
    assert "NASA climate data confirms sea levels." in cleaned_entities


def test_search_empty_query():
    """Ensure empty or whitespace queries return safely without network call."""
    assert search_duckduckgo("") == []
    assert search_duckduckgo("   ") == []


@patch("ddgs.DDGS")
def test_search_mocked(mock_ddgs_cls):
    """Ensure search returns standard distilled schema using mocked DDGS."""
    mock_instance = MagicMock()
    mock_instance.text.return_value = [
        {
            "title": "NASA Sea Level Study",
            "href": "https://climate.nasa.gov/vital-signs/sea-level",
            "body": "Global sea levels have risen by about 8 inches in the last century.",
        }
    ]
    mock_ddgs_cls.return_value = mock_instance
    results = search_duckduckgo("sea level nasa", max_results=1)
    assert len(results) == 1
    assert results[0]["title"] == "NASA Sea Level Study"
    assert results[0]["url"].startswith("https://")


@pytest.mark.asyncio
async def test_url_reachability_verifier():
    """Verify live HTTP reachability checker classifies 200 OK vs 404 unreachable."""
    def handler(request: httpx.Request) -> httpx.Response:
        if "good.example" in str(request.url):
            return httpx.Response(200)
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        good = await verify_url_reachability(client, "https://good.example/paper")
        bad = await verify_url_reachability(client, "https://bad.example/missing")
        invalid = await verify_url_reachability(client, "not-a-url")

    assert good["url_status"] == "verified_live"
    assert good["status_code"] == 200
    assert bad["url_status"] == "unreachable"
    assert bad["status_code"] == 404
    assert invalid["url_status"] == "unverified"
