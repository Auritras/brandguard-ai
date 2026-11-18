"""A small load test: N people using the demo at the same moment, as during judging.

    python -m evals.load https://brandguard-api-qtj3.onrender.com --people 15

Each person starts their own demo copy, lists drafts, opens one, and runs the live check while
typing three times. No AI calls are made, so the free AI quota is not used. Prints how long each
kind of request took (median and 95th percentile) and any failures. Demo copies are cleared
automatically after a day.
"""
import argparse
import asyncio
import statistics
import time

import httpx

TEXT = "Lumio Pay is India's #1 payroll app, trusted by 10,000 companies. Click here to book a demo!"


async def person(client: httpx.AsyncClient, n: int, times: dict, errors: list) -> None:
    async def call(kind, method, path, **kw):
        t = time.perf_counter()
        try:
            r = await client.request(method, path, **kw)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            errors.append(f"{kind}: {type(e).__name__} {getattr(getattr(e, 'response', None), 'status_code', '')}")
            return None
        finally:
            times.setdefault(kind, []).append(time.perf_counter() - t)

    start = await call("start demo copy", "POST", "/api/demo/start", json={"role": "manager", "brand": "lumio" if n % 2 else "fizzbox"})
    if not start:
        return
    h = {"Authorization": "Bearer " + start["token"]}
    drafts = await call("list drafts", "GET", "/api/drafts", headers=h) or []
    if drafts:
        await call("open a draft", "GET", f"/api/drafts/{drafts[0]['id']}", headers=h)
    for i in range(3):
        await call("check while typing", "POST", "/api/check-text", headers=h, json={"body": TEXT[: 40 + i * 25]})
    await call("brand health", "GET", "/api/insights", headers=h)


async def main(base: str, people: int) -> None:
    async with httpx.AsyncClient(base_url=base, timeout=120) as client:
        await client.get("/api/ping")  # wake it first: cold start is a separate question
        times, errors = {}, []
        t = time.perf_counter()
        await asyncio.gather(*(person(client, n, times, errors) for n in range(people)))
        total = time.perf_counter() - t
    print(f"{people} people at once, {sum(len(v) for v in times.values())} requests in {total:.1f}s, {len(errors)} failed")
    for kind, v in times.items():
        v = sorted(v)
        p95 = v[min(len(v) - 1, int(len(v) * 0.95))]
        print(f"  {kind:20} median {statistics.median(v) * 1000:6.0f} ms   95% under {p95 * 1000:6.0f} ms   ({len(v)})")
    for e in errors[:10]:
        print("  failed:", e)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("base")
    p.add_argument("--people", type=int, default=15)
    a = p.parse_args()
    asyncio.run(main(a.base.rstrip("/"), a.people))
