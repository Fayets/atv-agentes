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

    import psycopg2

    raw = psycopg2.connect(
        host=host,
        port=config("DB_PORT", cast=int),
        dbname=config("DB_NAME"),
        user=config("DB_USER"),
        password=config("DB_PASSWORD"),
        sslmode="require",
    )
    raw.autocommit = True
    cur = raw.cursor()

    # Migración previa al mapping: renombrar email → username en "user"
    try:
        cur.execute('ALTER TABLE "user" RENAME COLUMN email TO username')
        print("init_db: columna email renombrada a username.")
    except Exception:
        pass  # ya fue renombrada o no existe la tabla todavía

    # Título editable de conversaciones
    for table in ('"AgentSession"', "agentsession"):
        try:
            cur.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS title TEXT")
        except Exception:
            pass

    # Adjuntos opcional en ejemplos de agente
    for table in ('"AgentExample"', "agentexample"):
        for col, typ in (
            ("media_type", "TEXT"),
            ("file_data", "TEXT"),
            ("filename", "TEXT"),
        ):
            try:
                cur.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {typ}")
            except Exception:
                pass

    cur.close()
    raw.close()
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
