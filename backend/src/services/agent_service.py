import base64
import io
import os
import re
from datetime import datetime
from pathlib import Path

import anthropic
from decouple import config
from fastapi import HTTPException
from pony.orm import db_session, flush

from src.models import Agent, AgentMessage, AgentSession, AppSetting, Client, ToneDocument
from src.schemas import (
    AgentChatResponse,
    AgentFile,
    AgentHistoryResponse,
    AgentLatestSessionResponse,
    AgentRunResponse,
    AgentSessionListResponse,
)

_DEFAULT_TONE = "# Tono de Voz Juan Cruz\n[contenido del documento]"
_TONE_ID = "global"
_CLAUDE_KEY_ID = "anthropic_api_key"
_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"

AGENT_META = {
    "mk1": {"name": "Calendario de Contenido", "category": "marketing"},
    "mk2": {"name": "Secuencia de Stories", "category": "marketing"},
    "mk3": {"name": "Optimización de Perfil", "category": "marketing"},
    "mk4": {"name": "Estrategia de Contenido", "category": "marketing"},
    "mk5": {"name": "YouTube / Creator", "category": "marketing"},
    "bs1": {"name": "Oferta y Escalera de Valor", "category": "bases"},
    "vt1": {"name": "Proceso de Setting", "category": "ventas"},
    "vt2": {"name": "Proceso de Preaudit (trigger)", "category": "ventas"},
    "vt3": {"name": "Proceso de Venta (call)", "category": "ventas"},
    "vt4": {"name": "VSL Chat", "category": "ventas"},
    "vt5": {"name": "Presentación de Resultados", "category": "ventas"},
    "vt6": {"name": "Landing (Thank You)", "category": "ventas"},
    "es1": {"name": "Estrategia de Ads", "category": "escala"},
    "es2": {"name": "Estructura y Presentación de Webinar", "category": "escala"},
}

AGENT_SYSTEM_PROMPTS = {agent_id: "" for agent_id in AGENT_META}

MODEL = "claude-haiku-4-5"
MAX_TOKENS = 4000
_MAX_DOC_CHARS = 8000
_MAX_SKILL_CHARS = 1800
_LONG_OUTPUT_TOKENS = {
    "mk1": 5000,
}

_VOICE_LOCK = """
El prompt del agente define QUÉ entregar y el formato. Respetalo 1:1.
El documento de tono define CÓMO suenan copies, hooks, outlines e ideas al avatar (voseo, directo, números). No copies el índice del tono.
Si el prompt pide un entregable estructurado (calendario, bloques, campos), no lo conviertas en una charla.
""".strip()

_anthropic = None


def _env_claude_key() -> str:
    return (config("ANTHROPIC_API_KEY", default="") or os.environ.get("ANTHROPIC_API_KEY", "")).strip()


def _db_claude_key() -> str:
    with db_session:
        row = AppSetting.get(id=_CLAUDE_KEY_ID)
        if row is None:
            return ""
        return str(row.value or "").strip()


def _resolve_claude_key() -> str:
    return _db_claude_key() or _env_claude_key()


def _mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) < 12:
        return "••••"
    return f"{key[:8]}…{key[-4:]}"


def get_claude_status() -> dict:
    key = _resolve_claude_key()
    return {
        "connected": bool(key),
        "hint": _mask_key(key),
        "source": "app" if _db_claude_key() else ("env" if _env_claude_key() else None),
        "model": MODEL,
    }


def save_claude_key(api_key: str) -> dict:
    global _anthropic
    key = (api_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="Pegá la API key de Anthropic")
    now = datetime.utcnow()
    with db_session:
        row = AppSetting.get(id=_CLAUDE_KEY_ID)
        if row is None:
            AppSetting(id=_CLAUDE_KEY_ID, value=key, updated_at=now)
        else:
            row.value = key
            row.updated_at = now
    _anthropic = None
    return get_claude_status()


def _client():
    global _anthropic
    key = _resolve_claude_key()
    if not key:
        raise HTTPException(
            status_code=500,
            detail="Falta conectar Claude. Andá a Conexión y pegá la API key.",
        )
    if _anthropic is None:
        _anthropic = anthropic.Anthropic(api_key=key)
    return _anthropic


def get_tone_doc() -> str:
    with db_session:
        row = ToneDocument.get(id=_TONE_ID)
        if row is None or not row.content:
            return _DEFAULT_TONE
        return str(row.content)


def _default_system_prompt(agent_id: str) -> str:
    path = _PROMPTS_DIR / f"{agent_id}.md"
    if path.exists():
        return path.read_text(encoding="utf-8")
    return AGENT_SYSTEM_PROMPTS.get(agent_id, "")


def _upsert_agent(agent_id: str, system_prompt: str):
    meta = AGENT_META.get(agent_id, {"name": agent_id, "category": "bases"})
    content = system_prompt if (system_prompt or "").strip() else " "
    row = Agent.get(id=agent_id)
    if row is None:
        Agent(
            id=agent_id,
            name=meta["name"],
            category=meta["category"],
            system_prompt=content,
        )
        return
    row.system_prompt = content
    row.name = meta["name"]
    row.category = meta["category"]


def get_agent_system_prompt(agent_id: str) -> str:
    if agent_id not in AGENT_META:
        raise HTTPException(status_code=404, detail="Agent not found")
    default = _default_system_prompt(agent_id)
    with db_session:
        row = Agent.get(id=agent_id)
        if row is None:
            if (default or "").strip():
                _upsert_agent(agent_id, default)
            return default
        stored = str(row.system_prompt or "")
        if not stored.strip() and default:
            row.system_prompt = default
            return default
        if default and "El tono de voz global ya viene" in stored:
            row.system_prompt = default
            return default
        if default and "SOP —" in default and "SOP —" not in stored:
            row.system_prompt = default
            return default
        return stored.strip() and stored or default


def _tone_block() -> str:
    tone = get_tone_doc().strip()
    if not tone or "[contenido" in tone:
        return ""
    return (
        "DOCUMENTO DE TONO DE VOZ DE JUAN CRUZ. Obligatorio. "
        "Escribí como los ejemplos de la sección 8 y el system de la sección 9. "
        "No copies el índice del documento.\n\n"
        f"{tone}"
    )


def _build_system_prompt(agent_id: str, cache: bool = False):
    skill = _compact_skill(get_agent_system_prompt(agent_id))
    parts = [
        "PROMPT DEL AGENTE (qué entregar y en qué formato):\n" + skill if skill else "",
        _tone_block(),
        _VOICE_LOCK,
    ]
    text = "\n\n---\n\n".join(p for p in parts if p)
    block = {"type": "text", "text": text}
    if cache:
        block["cache_control"] = {"type": "ephemeral"}
    return [block]


def _compact_skill(skill: str) -> str:
    skill = (skill or "").strip()
    if "SOP" in skill[:80] or "Calendario de Contenido" in skill[:200]:
        return skill
    for cut in ("\nEjemplos de razonamiento", "\n5 — Pricing", "\n### 1"):
        if cut in skill:
            head = skill[: skill.index(cut)]
            rest = ""
            if "\nCómo pensás" in skill:
                rest = skill[skill.index("\nCómo pensás") :]
            skill = (head + rest).strip()
            break
    skill = (skill or "").strip()
    if len(skill) <= _MAX_SKILL_CHARS:
        return skill
    return skill[:_MAX_SKILL_CHARS].rsplit("\n", 1)[0].strip()


def _pdf_to_text(data_b64: str) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        return ""
    try:
        raw = base64.b64decode(data_b64)
        reader = PdfReader(io.BytesIO(raw))
        parts = []
        for i, page in enumerate(reader.pages):
            if i >= 8:
                break
            extracted = (page.extract_text() or "").strip()
            if extracted:
                parts.append(extracted)
        text = "\n\n".join(parts).strip()
        if len(text) > _MAX_DOC_CHARS:
            text = text[:_MAX_DOC_CHARS] + "\n[documento recortado]"
        return text
    except Exception:
        return ""


def list_agents() -> list[dict]:
    items = []
    with db_session:
        for agent_id, meta in AGENT_META.items():
            row = Agent.get(id=agent_id)
            stored = str(row.system_prompt) if row and row.system_prompt else ""
            prompt = stored.strip() or _default_system_prompt(agent_id)
            items.append(
                {
                    "id": agent_id,
                    "name": meta["name"],
                    "category": meta["category"],
                    "has_prompt": bool((prompt or "").strip()),
                }
            )
    return items


def _plain_voice(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"__(.+?)__", r"\1", text)
    text = re.sub(r"`+", "", text)
    text = re.sub(r"(?m)^#{1,6}\s*", "", text)
    text = text.replace("⚠️", "").replace("❌", "").replace("✅", "")
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if re.match(r"^\|?\s*:?-{3,}", stripped.replace("|", " ").strip() or "-"):
            continue
        if stripped.startswith("|") and stripped.endswith("|"):
            cells = [c.strip() for c in stripped.strip("|").split("|") if c.strip()]
            if cells:
                lines.append(" — ".join(cells))
            continue
        lines.append(line)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def _store_user_text(text: str, files: list[AgentFile] | None) -> str:
    names = [f"📎 {item.name}" for item in (files or [])]
    return "\n".join([part for part in [text.strip() if text else "", *names] if part]).strip()


def _user_message(text: str, files: list[AgentFile] | None = None) -> dict:
    files = files or []
    blocks = []
    extracted = []
    for item in files:
        if item.media_type == "application/pdf" and item.data:
            pdf_text = _pdf_to_text(item.data)
            if len(pdf_text) >= 80:
                extracted.append(f"--- {item.name} ---\n{pdf_text}")
            else:
                blocks.append(
                    {
                        "type": "document",
                        "source": {
                            "type": "base64",
                            "media_type": "application/pdf",
                            "data": item.data,
                        },
                    }
                )
    caption = (text or "").strip()
    if extracted:
        caption = "\n\n".join([p for p in (caption, *extracted) if p])
    if not caption and files:
        names = ", ".join(item.name for item in files)
        caption = (
            f"Leé el documento adjunto ({names}) y ejecutá tu skill."
        )
    if blocks:
        blocks.append({"type": "text", "text": caption})
        return {"role": "user", "content": blocks}
    return {"role": "user", "content": caption}


def _complete(system: str, messages: list[dict], agent_id: str = "") -> str:
    response = _client().messages.create(
        model=MODEL,
        max_tokens=_LONG_OUTPUT_TOKENS.get(agent_id, MAX_TOKENS),
        system=system,
        messages=messages,
    )
    parts = []
    for block in response.content:
        text = getattr(block, "text", None)
        if text:
            parts.append(text)
    raw = "".join(parts)
    if agent_id == "mk1":
        return raw.strip()
    return _plain_voice(raw)


def _session_messages(session) -> list[dict]:
    rows = sorted(session.messages, key=lambda m: (m.created_at, m.id))
    return [{"role": msg.role, "content": str(msg.content or "")} for msg in rows]


def _trim_history(messages: list[dict]) -> list[dict]:
    keep = messages[-6:]
    out = []
    for i, item in enumerate(keep):
        content = item.get("content") or ""
        last = i == len(keep) - 1
        cap = 4000 if last else 1500
        if isinstance(content, str) and len(content) > cap:
            content = content[:cap] + "…"
        out.append({**item, "content": content})
    return out


def run_agent(
    client_id: str,
    agent_id: str,
    input_doc: str,
    files: list[AgentFile] | None = None,
) -> AgentRunResponse:
    files = files or []
    system = _build_system_prompt(agent_id, cache=False)
    output = _complete(system, [_user_message(input_doc, files)], agent_id)
    now = datetime.utcnow()
    stored = _store_user_text(input_doc, files) or input_doc

    with db_session:
        client = Client.get(id=client_id)
        if client is None:
            client = Client(id=client_id, name=client_id, created_at=now)
        session = AgentSession(
            client=client,
            agent_id=agent_id,
            created_at=now,
            updated_at=now,
        )
        AgentMessage(session=session, role="user", content=stored, created_at=now)
        AgentMessage(session=session, role="assistant", content=output, created_at=now)
        flush()
        session_id = session.id

    return AgentRunResponse(session_id=session_id, output=output)


def chat_agent(
    session_id: int,
    message: str,
    files: list[AgentFile] | None = None,
) -> AgentChatResponse:
    files = files or []
    with db_session:
        session = AgentSession.get(id=session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        agent_id = session.agent_id
        history = _session_messages(session)

    api_messages = _trim_history([m for m in history if m["role"] in ("user", "assistant")])
    api_messages.append(_user_message(message, files))
    system = _build_system_prompt(agent_id, cache=True)
    reply = _complete(system, api_messages, agent_id)
    now = datetime.utcnow()
    stored = _store_user_text(message, files) or message

    with db_session:
        session = AgentSession.get(id=session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        AgentMessage(session=session, role="user", content=stored, created_at=now)
        AgentMessage(session=session, role="assistant", content=reply, created_at=now)
        session.updated_at = now

    return AgentChatResponse(session_id=session_id, reply=reply)


def get_history(session_id: int) -> AgentHistoryResponse:
    with db_session:
        session = AgentSession.get(id=session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        messages = _session_messages(session)
        return AgentHistoryResponse(session_id=session.id, messages=messages)


def _sessions_for_client_agent(client_id: str, agent_id: str) -> list:
    with db_session:
        client = Client.get(id=client_id)
        if client is None:
            return []
        sessions = sorted(
            [s for s in client.sessions if s.agent_id == agent_id],
            key=lambda s: s.updated_at,
            reverse=True,
        )
        return [
            {
                "id": session.id,
                "created_at": session.created_at.isoformat(),
                "updated_at": session.updated_at.isoformat(),
                "messages": _session_messages(session),
            }
            for session in sessions
        ]


def list_client_sessions(client_id: str, agent_id: str) -> AgentSessionListResponse:
    sessions = _sessions_for_client_agent(client_id, agent_id)
    items = []
    for session in sessions:
        messages = session["messages"]
        first_user = next((m for m in messages if m["role"] == "user"), None)
        preview = str(first_user["content"] if first_user else "")[:160]
        items.append(
            {
                "session_id": session["id"],
                "created_at": session["created_at"],
                "updated_at": session["updated_at"],
                "preview": preview,
                "message_count": len(messages),
            }
        )
    return AgentSessionListResponse(sessions=items)


def get_latest_session(client_id: str, agent_id: str) -> AgentLatestSessionResponse:
    sessions = _sessions_for_client_agent(client_id, agent_id)
    if not sessions:
        return AgentLatestSessionResponse()
    latest = sessions[0]
    return AgentLatestSessionResponse(session_id=latest["id"], messages=latest["messages"])


def get_agent_config(agent_id: str) -> dict:
    if agent_id not in AGENT_META:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {
        "agent_id": agent_id,
        "tone_doc": get_tone_doc(),
        "system_prompt": get_agent_system_prompt(agent_id),
    }


def save_agent_config(agent_id: str, tone_doc: str, system_prompt: str):
    if agent_id not in AGENT_META:
        raise HTTPException(status_code=404, detail="Agent not found")
    AGENT_SYSTEM_PROMPTS[agent_id] = system_prompt
    with db_session:
        _upsert_agent(agent_id, system_prompt)


def save_tone_doc(tone_doc: str) -> dict:
    now = datetime.utcnow()
    content = tone_doc or ""
    with db_session:
        row = ToneDocument.get(id=_TONE_ID)
        if row is None:
            ToneDocument(id=_TONE_ID, content=content, updated_at=now)
        else:
            row.content = content
            row.updated_at = now
    return {"ok": True}
