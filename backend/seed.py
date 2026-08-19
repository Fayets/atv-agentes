from pony.orm import db_session
from src.db import db, init_db
from src.models import Client
from datetime import datetime

init_db()

with db_session:
    if not Client.exists(id="test"):
        Client(
            id="test",
            name="Test Client",
            created_at=datetime.utcnow()
        )
        print("Cliente test creado.")
    else:
        print("Ya existe.")
