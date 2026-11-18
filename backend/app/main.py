from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from . import models  # noqa: F401  (registers tables)
from .auth import current_user, make_token, verify_password
from .config import AI_API_KEY, AI_MODEL, AI_PROVIDER_NAME, CORS_ORIGINS
from .seed import TEMPLATES
from .db import Base, SessionLocal, engine, get_db
from .models import User
from .seed import seed
from .migrate import migrate


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    migrate(engine)
    with SessionLocal() as db:
        seed(db)
    yield


app = FastAPI(title="BrandGuard AI", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

from .routers import accounts, drafts, insights, library, reliability  # noqa: E402
from .routers.accounts import user_out  # noqa: E402

app.include_router(accounts.router)
app.include_router(library.router)
app.include_router(drafts.router)
app.include_router(insights.router)
app.include_router(reliability.router)


@app.get("/api/ping")
def ping(db: Session = Depends(get_db)):
    """Keep-awake target: one tiny query so the free database also counts as in use."""
    db.execute(text("select 1"))
    return {"ok": True}


class LoginIn(BaseModel):
    email: str
    password: str




@app.get("/api/health")
def health():
    return {
        "ok": True, "ai_enabled": bool(AI_API_KEY), "ai_provider": AI_PROVIDER_NAME, "ai_model": AI_MODEL,
        # The demo's three people, for the sign-in page. Visitors get a private copy, never these accounts.
        "demo": {"accounts": [{"name": n, "role": r} for n, _e, r in TEMPLATES["lumio"][1]],
                 "brands": [{"key": k, "name": t[0], "accounts": [{"name": n, "role": r} for n, _e, r in t[1]]}
                            for k, t in TEMPLATES.items()]},
    }


@app.post("/api/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.strip().lower()).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong email or password.")
    if user.active is False:
        raise HTTPException(403, "This account has been removed from its brand. Ask the brand owner to add you again.")
    return {"token": make_token(user), "user": user_out(user)}


@app.get("/api/me")
def me(user: User = Depends(current_user)):
    return user_out(user)
