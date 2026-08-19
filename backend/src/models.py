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
    created_at = Required(datetime)
    updated_at = Required(datetime)
    messages = Set("AgentMessage")


class AgentMessage(db.Entity):
    id = PrimaryKey(int, auto=True)
    session = Required(AgentSession)
    role = Required(str)
    content = Required(LongStr)
    created_at = Required(datetime)
