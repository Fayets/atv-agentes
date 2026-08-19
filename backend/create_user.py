"""Script puntual para migrar columna email→username y crear usuario juan."""
from datetime import datetime
import psycopg2
from decouple import config

DB_PARAMS = dict(
    host=config("DB_HOST"),
    port=config("DB_PORT", cast=int),
    dbname=config("DB_NAME"),
    user=config("DB_USER"),
    password=config("DB_PASSWORD"),
    sslmode="require",
)

conn = psycopg2.connect(**DB_PARAMS)
conn.autocommit = True
cur = conn.cursor()

# 1. Renombrar email → username si todavía existe la columna email
cur.execute("""
    SELECT column_name FROM information_schema.columns
    WHERE table_name='user' AND column_name='email'
""")
if cur.fetchone():
    cur.execute('ALTER TABLE "user" RENAME COLUMN email TO username')
    print("[migrate] Columna email renombrada a username.")
else:
    print("[migrate] Columna ya se llama username, no hay nada que renombrar.")

# 2. Hashear password con bcrypt directo (sin importar Pony)
from passlib.context import CryptContext
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
hashed = pwd_ctx.hash("ventas1201")

# 3. Insertar o actualizar usuario juan
cur.execute('SELECT id FROM "user" WHERE username = %s', ("juan",))
row = cur.fetchone()
if row:
    cur.execute(
        'UPDATE "user" SET hashed_password=%s, role=%s, client_id=%s, is_active=%s WHERE username=%s',
        (hashed, "client_admin", "test", True, "juan"),
    )
    print("[create_user] Usuario 'juan' actualizado.")
else:
    cur.execute(
        'INSERT INTO "user" (username, hashed_password, role, client_id, is_active, created_at) VALUES (%s,%s,%s,%s,%s,%s)',
        ("juan", hashed, "client_admin", "test", True, datetime.utcnow()),
    )
    print("[create_user] Usuario 'juan' creado.")

cur.close()
conn.close()
print("Listo.")
