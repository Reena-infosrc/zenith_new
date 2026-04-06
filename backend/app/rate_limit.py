"""Shared SlowAPI limiter instance (IP-based) for auth and expensive routes."""
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _client_ip(request: Request) -> str:
    """Prefer X-Forwarded-For (first hop) when behind ALB/CloudFront; fall back to direct client."""
    forwarded = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip() or get_remote_address(request)
    return get_remote_address(request)


limiter = Limiter(key_func=_client_ip)
