import asyncio
import logging
from typing import Any
import httpx

logger = logging.getLogger("crossexam.verifier")

_HEADERS = {
    "User-Agent": "CrossExam-Verifier/1.0 (+https://github.com/Savadimihir2003/CrossExam)"
}


async def verify_url_reachability(
    client: httpx.AsyncClient,
    url: str,
) -> dict[str, Any]:
    """Check whether a cited URL resolves cleanly over HTTP(S)."""
    clean_url = (url or "").strip()
    if not clean_url.startswith(("http://", "https://")):
        return {
            "url": clean_url,
            "reachable": False,
            "status_code": None,
            "url_status": "unverified",
        }

    try:
        resp = await client.head(clean_url, headers=_HEADERS)
        if resp.status_code in (403, 405, 501):
            resp = await client.get(clean_url, headers=_HEADERS)

        reachable = 200 <= resp.status_code < 400
        return {
            "url": clean_url,
            "reachable": reachable,
            "status_code": resp.status_code,
            "url_status": "verified_live" if reachable else "unreachable",
        }
    except Exception as exc:
        logger.debug("URL reachability check failed for %s: %s", clean_url, exc)
        return {
            "url": clean_url,
            "reachable": False,
            "status_code": None,
            "url_status": "unreachable",
        }


async def verify_evidence_urls(
    evidence_items: list[dict[str, Any]],
    timeout: float = 3.5,
    max_urls: int = 12,
) -> dict[str, dict[str, Any]]:
    """Concurrently verify reachability of unique evidence URLs."""
    unique_urls: list[str] = []
    seen: set[str] = set()
    for item in evidence_items:
        u = str(item.get("url", "")).strip()
        if u and u not in seen:
            seen.add(u)
            unique_urls.append(u)
        if len(unique_urls) >= max_urls:
            break

    if not unique_urls:
        return {}

    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
        results = await asyncio.gather(
            *(verify_url_reachability(client, u) for u in unique_urls),
            return_exceptions=True,
        )

    verification_map: dict[str, dict[str, Any]] = {}
    for u, res in zip(unique_urls, results):
        if isinstance(res, dict):
            verification_map[u] = res
        else:
            verification_map[u] = {
                "url": u,
                "reachable": False,
                "status_code": None,
                "url_status": "unreachable",
            }
    return verification_map
