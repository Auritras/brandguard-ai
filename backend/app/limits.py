"""Small in-memory rate limits, so one visitor or script cannot fill the database with demo copies or use up
the free AI quota for everyone. Per server process, which is enough for one free instance.
Set BRANDGUARD_RATE_LIMITS=off to switch them off (the tests do)."""
import os
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class Limit:
    def __init__(self, times: int, seconds: int, message: str):
        self.times, self.seconds, self.message = times, seconds, message
        self.hits: dict[str, deque] = defaultdict(deque)
        self.lock = threading.Lock()

    def check(self, key: str) -> None:
        if os.getenv("BRANDGUARD_RATE_LIMITS") == "off":
            return
        now = time.monotonic()
        with self.lock:
            q = self.hits[key]
            while q and now - q[0] > self.seconds:
                q.popleft()
            if len(q) >= self.times:
                wait = int(self.seconds - (now - q[0])) + 1
                raise HTTPException(429, f"{self.message} Try again in {wait // 60} min." if wait >= 120
                                    else f"{self.message} Try again in {wait} seconds.")
            q.append(now)
            if len(self.hits) > 10_000:  # forget idle keys so memory stays small
                for k in [k for k, v in self.hits.items() if not v or now - v[-1] > self.seconds][:5000]:
                    del self.hits[k]


def client_ip(request: Request) -> str:
    """The visitor's address. Render puts the real one first in X-Forwarded-For."""
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown")


DEMO_COPIES = Limit(30, 3600, "Too many demo copies from this network in the last hour.")
SIGN_UPS = Limit(10, 3600, "Too many new brands from this network in the last hour.")
SIGN_INS = Limit(20, 600, "Too many sign-in attempts.")
CHECKS = Limit(20, 60, "That is a lot of checks in one minute.")
COMPARES = Limit(60, 60, "That is a lot of comparisons in one minute.")
