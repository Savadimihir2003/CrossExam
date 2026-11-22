import html
import logging
import re
import warnings
from typing import Any

logger = logging.getLogger("crossexam.search")


def _clean_text(raw: str, max_words: int = 120) -> str:
    """Strip HTML tags, unescape HTML entities, and truncate to max_words."""
    if not raw:
        return ""
    # First unescape entities in case of escaped tags like &lt;b&gt;
    cleaned = html.unescape(raw)
    # Strip HTML tags
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    # Unescape again in case of nested/double entity encoding
    cleaned = html.unescape(cleaned)
    # Final pass to strip any residual angle-bracket tags
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    # Collapse multiple whitespaces
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    words = cleaned.split()
    if len(words) > max_words:
        return " ".join(words[:max_words]) + "..."
    return cleaned


def search_duckduckgo(query: str, max_results: int = 3) -> list[dict[str, str]]:
    """Defensively search DuckDuckGo and distill results to title, url, snippet.
    
    Args:
        query: The search query string.
        max_results: Max number of distilled snippets to return (default: 3).

    Returns:
        List of dicts: [{"title": ..., "url": ..., "snippet": ...}]
    """
    if not query or not query.strip():
        return []

    clean_query = query.strip()
    results: list[dict[str, str]] = []

    try:
        # Import lazily to support both package naming variants
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=RuntimeWarning)
            try:
                from ddgs import DDGS
            except ImportError:
                from duckduckgo_search import DDGS

            ddgs = DDGS(timeout=10)
            raw_results = list(ddgs.text(clean_query, max_results=max_results))

        for item in raw_results:
            title = _clean_text(item.get("title", ""), max_words=30)
            url = str(item.get("href", item.get("url", ""))).strip()
            body = item.get("body", item.get("snippet", ""))
            snippet = _clean_text(body, max_words=120)

            if url and snippet:
                results.append({
                    "title": title or "Source Evidence",
                    "url": url,
                    "snippet": snippet,
                })

        logger.info("Search for '%s' returned %d results", clean_query, len(results))
    except Exception as exc:
        logger.warning(
            "DuckDuckGo search error for query '%s': %s. Returning fallback.",
            clean_query,
            str(exc),
        )
        # Return graceful empty list so the debate agent can still reason from its internal knowledge
        return []

    return results
