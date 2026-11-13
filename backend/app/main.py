from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from . import models  # noqa: F401  (registers tables)
from .auth import current_user, make_token, verify_password
from .config import AI_API_KEY, AI_MODEL, AI_PROVIDER_NAME, CORS_ORIGINS, DEMO_PASSWORD
from .seed import USERS as DEMO_USERS
from .db import Base, SessionLocal, engine, get_db
from .models import User
from .seed import seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
    yield


app = FastAPI(title="BrandGuard AI", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

from .routers import drafts, library  # noqa: E402

app.include_router(library.router)
app.include_router(drafts.router)


class LoginIn(BaseModel):
    email: str
    password: str


def user_out(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role}


@app.get("/api/health")
def health():
    return {
        "ok": True, "ai_enabled": bool(AI_API_KEY), "ai_provider": AI_PROVIDER_NAME, "ai_model": AI_MODEL,
        # Public demo accounts for judges. These are seeded test users for a fictional brand.
        "demo": {"password": DEMO_PASSWORD, "accounts": [{"name": n, "email": e, "role": r} for n, e, r in DEMO_USERS]},
    }


@app.post("/api/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.strip().lower()).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong email or password.")
    return {"token": make_token(user), "user": user_out(user)}


@app.get("/api/me")
def me(user: User = Depends(current_user)):
    return user_out(user)
