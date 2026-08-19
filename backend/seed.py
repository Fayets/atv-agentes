"""
Corre una sola vez para poblar la DB con cliente y usuarios iniciales.

Uso:
    cd backend
    python seed.py

Usuarios que crea (si no existen):
  - admin@atvos.io  / password configurado en SEED_ADMIN_PASSWORD (.env o variable)  → superadmin
  - juan@atvos.io   / ídem SEED_USER_PASSWORD                                         → client_admin (client: test)
"""
from datetime import datetime

from decouple import config
from pony.orm import db_session

from src.db import init_db
from src.models import Client, User
from src.services.auth_service import _hash

init_db()

ADMIN_EMAIL = config("SEED_ADMIN_EMAIL", default="admin@atvos.io")
ADMIN_PASS = config("SEED_ADMIN_PASSWORD", default="changeme123")
USER_EMAIL = config("SEED_USER_EMAIL", default="juan@atvos.io")
USER_PASS = config("SEED_USER_PASSWORD", default="changeme123")
CLIENT_ID = "test"

now = datetime.utcnow()

with db_session:
    # Cliente base
    if not Client.exists(id=CLIENT_ID):
        Client(id=CLIENT_ID, name="ATV Soft", created_at=now)
        print(f"[seed] Cliente '{CLIENT_ID}' creado.")
    else:
        print(f"[seed] Cliente '{CLIENT_ID}' ya existe.")

    # Superadmin
    if not User.exists(email=ADMIN_EMAIL):
        User(
            email=ADMIN_EMAIL,
            hashed_password=_hash(ADMIN_PASS),
            role="superadmin",
            client_id="",
            is_active=True,
            created_at=now,
        )
        print(f"[seed] Usuario superadmin '{ADMIN_EMAIL}' creado.")
    else:
        print(f"[seed] Usuario '{ADMIN_EMAIL}' ya existe.")

    # client_admin
    if not User.exists(email=USER_EMAIL):
        User(
            email=USER_EMAIL,
            hashed_password=_hash(USER_PASS),
            role="client_admin",
            client_id=CLIENT_ID,
            is_active=True,
            created_at=now,
        )
        print(f"[seed] Usuario client_admin '{USER_EMAIL}' creado.")
    else:
        print(f"[seed] Usuario '{USER_EMAIL}' ya existe.")

print("[seed] Listo.")
