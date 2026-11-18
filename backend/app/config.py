"""Settings read from environment variables (see .env.example)."""
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./brandguard.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-secret-change-me-before-deploying")
JWT_HOURS = int(os.getenv("JWT_HOURS", "12"))

# AI provider (OpenAI-compatible chat endpoint).
# Empty key = AI checks are skipped, and the review says so.
AI_API_KEY = os.getenv("GROQ_API_KEY", "")
AI_BASE_URL = os.getenv("AI_BASE_URL", "https://api.groq.com/openai/v1")
AI_MODEL = os.getenv("AI_MODEL", "openai/gpt-oss-120b")  # Groq retired llama-3.3-70b-versatile on 2026-08-16
AI_PROVIDER_NAME = os.getenv("AI_PROVIDER_NAME", "Groq")
# Reads text, the logo and a description from images. Judgements on images are made in code.
VISION_MODEL = os.getenv("VISION_MODEL", "qwen/qwen3.8-27b")

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]

# The demo brand is the template every visitor's private copy is made from. It is read-only, except
# for the reset script, which sets this to rebuild it.
TEMPLATE_WRITES = os.getenv("BRANDGUARD_TEMPLATE_WRITES") == "1"

# Password for the three seeded demo accounts (shown on the login screen on purpose).
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "brandguard-demo")
