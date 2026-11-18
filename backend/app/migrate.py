"""Small in-place upgrades for databases made before brands existed. Safe to run on every start.

`create_all` makes new tables but never changes existing ones, so this adds the brand column where
it is missing and turns the old site-wide unique rule and fact codes into ordinary indexes (codes
are now unique within a brand). Rows from before this change are given to the demo brand in seed.
"""
from sqlalchemy import inspect, text

BRAND_TABLES = ("users", "rules", "facts", "terms", "drafts", "audit_log")


def migrate(engine) -> None:
    """Only touches a table when something is actually missing. Statements like CREATE INDEX lock the
    whole table on Postgres even when the index exists, which would block live writes on every start."""
    insp = inspect(engine)
    with engine.begin() as conn:
        for table in BRAND_TABLES:
            if not insp.has_table(table):
                continue
            if "brand_id" not in {c["name"] for c in insp.get_columns(table)}:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN brand_id INTEGER"))
            if f"ix_{table}_brand_id" not in {i["name"] for i in insp.get_indexes(table)}:
                conn.execute(text(f"CREATE INDEX ix_{table}_brand_id ON {table} (brand_id)"))
        blob = "BYTEA" if engine.dialect.name == "postgresql" else "BLOB"
        extra = [("users", "active", "BOOLEAN DEFAULT TRUE"), ("drafts", "deleted_at", "TIMESTAMP WITH TIME ZONE"),
                 ("brands", "sandbox", "BOOLEAN DEFAULT FALSE"), ("brands", "palette", "VARCHAR(300) DEFAULT ''"),
                 ("brands", "logo", blob), ("brands", "logo_type", "VARCHAR(40) DEFAULT ''"),
                 ("findings", "image_id", "INTEGER"), ("drafts", "due_date", "DATE")]
        for table, col, kind in extra:
            if insp.has_table(table) and col not in {c["name"] for c in insp.get_columns(table)}:
                if engine.dialect.name != "postgresql":
                    kind = kind.replace("TIMESTAMP WITH TIME ZONE", "DATETIME")
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {kind}"))
        for table in ("rules", "facts"):
            if not insp.has_table(table):
                continue
            for idx in insp.get_indexes(table):
                if idx["name"] == f"ix_{table}_code" and idx.get("unique"):
                    conn.execute(text(f"DROP INDEX ix_{table}_code"))
                    conn.execute(text(f"CREATE INDEX ix_{table}_code ON {table} (code)"))
            if engine.dialect.name == "postgresql":
                # Older tables may carry the uniqueness as a constraint instead of an index.
                for uc in insp.get_unique_constraints(table):
                    if uc["column_names"] == ["code"]:
                        conn.execute(text(f'ALTER TABLE {table} DROP CONSTRAINT "{uc["name"]}"'))
