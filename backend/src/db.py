from pony.orm import Database, db_session
from decouple import config

db = Database()


def init_db():
    # Import models inside init_db to avoid circular imports
    import src.models  # noqa: F401

    host = config("DB_HOST", default="")
    if not host:
        print("init_db: DB_HOST vacío — skip bind (completar backend/.env)")
        return

    db.bind(
        provider="postgres",
        host=host,
        port=config("DB_PORT", cast=int),
        database=config("DB_NAME"),
        user=config("DB_USER"),
        password=config("DB_PASSWORD"),
        sslmode="require",
    )
    db.generate_mapping(create_tables=True)
    alters = [
        ('"Agent"', "system_prompt"),
        ('"Agent"', "tone_doc"),
        ("agent", "system_prompt"),
        ("agent", "tone_doc"),
        ('"AgentMessage"', "content"),
        ("agentmessage", "content"),
    ]
    for table, column in alters:
        try:
            with db_session:
                db.execute(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE TEXT")
        except Exception:
            continue
