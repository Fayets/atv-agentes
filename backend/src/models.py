from datetime import datetime

from pony.orm import LongStr, Optional, PrimaryKey, Required, Set

from src.db import db


class User(db.Entity):
    id = PrimaryKey(int, auto=True)
    username = Required(str, unique=True)
    hashed_password = Required(str)
    role = Required(str, default="client_admin")
    client_id = Optional(str)
    is_active = Required(bool, default=True)
    created_at = Required(datetime)


class Client(db.Entity):
    id = PrimaryKey(str)
    name = Required(str)
    created_at = Required(datetime)
    sessions = Set("AgentSession")


class Agent(db.Entity):
    id = PrimaryKey(str)
    name = Required(str)
    category = Required(str)
    system_prompt = Required(LongStr)
    tone_doc = Optional(LongStr)


class ToneDocument(db.Entity):
    id = PrimaryKey(str)
    content = Required(LongStr)
    updated_at = Required(datetime)


class AppSetting(db.Entity):
    id = PrimaryKey(str)
    value = Required(LongStr)
    updated_at = Required(datetime)


class AgentSession(db.Entity):
    id = PrimaryKey(int, auto=True)
    client = Required(Client)
    agent_id = Required(str)
    title = Optional(str)
    created_at = Required(datetime)
    updated_at = Required(datetime)
    messages = Set("AgentMessage")


class AgentMessage(db.Entity):
    id = PrimaryKey(int, auto=True)
    session = Required(AgentSession)
    role = Required(str)
    content = Required(LongStr)
    created_at = Required(datetime)


class AgentJob(db.Entity):
    """Una generación en curso. Existe para que /run devuelva al instante y el
    navegador consulte el resultado, en vez de sostener un HTTP de minutos."""

    id = PrimaryKey(str)
    kind = Required(str)              # "run" | "chat"
    status = Required(str)            # "running" | "done" | "error"
    agent_id = Optional(str)
    session_id = Optional(int)        # 0 = todavía no hay sesión
    output = Optional(LongStr)
    error = Optional(str)
    created_at = Required(datetime)
    updated_at = Required(datetime)


class AgentExample(db.Entity):
    id = PrimaryKey(int, auto=True)
    agent_id = Required(str)
    title = Required(str)
    content = Required(LongStr)
    created_at = Required(datetime)
    media_type = Optional(str)
    file_data = Optional(LongStr)
    filename = Optional(str)
