import base64
import io
import os
import re
import traceback
import uuid
from datetime import datetime
from pathlib import Path

import anthropic
from decouple import config
from fastapi import HTTPException
from pony.orm import db_session, flush

from src.models import (
    Agent,
    AgentExample,
    AgentJob,
    AgentMessage,
    AgentSession,
    AppSetting,
    Client,
    ToneDocument,
)
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
    "vt5": {"name": "Presentación de Venta", "category": "ventas"},
    "vt6": {"name": "Landing (Thank You)", "category": "ventas"},
    "es1": {"name": "Estrategia de Ads", "category": "escala"},
    "es2": {"name": "Estructura y Presentación de Webinar", "category": "escala"},
}

AGENT_SYSTEM_PROMPTS = {agent_id: "" for agent_id in AGENT_META}

MODEL = "claude-sonnet-4-6"
# vt5 diseña decks: tarea de criterio visual → Opus con thinking adaptativo
MODEL_BY_AGENT = {
    "vt5": "claude-opus-5",
}
MAX_TOKENS = 4000
_MAX_DOC_CHARS = 8000
# Tope de adjuntos base64 por request (la API corta en 32MB de request total).
_MAX_ATTACH_B64_TOTAL = 20_000_000
# Un PDF más pesado que esto no se adjunta como imagen: solo su texto.
_MAX_ATTACH_RAW_BYTES = 15_000_000
# Formatos de imagen que acepta la API de Claude.
_IMAGE_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp",
}
# La API rechaza imágenes de más de 5MB en base64.
_MAX_IMAGE_BYTES = 5_000_000
# Un deck 1920x1080 de 10-16 slides con CSS inline son 12k-20k tokens.
# max_tokens acota thinking + texto, así que vt5 necesita techo alto + streaming.
_LONG_OUTPUT_TOKENS = {
    "mk1": 5000,
    "vt5": 64000,
}
# Por encima de este techo el SDK exige streaming (si no, timeout HTTP).
_STREAM_THRESHOLD = 16000
# Agentes que razonan antes de responder (diseño, arquitectura de deck).
_THINKING_AGENTS = {"vt5"}
# Profundidad del razonamiento. Editable por env para poder A/B testear sin
# tocar código: low | medium | high | xhigh | max. Es el lever principal sobre
# el costo de output, que es ~2/3 del costo total de un deck.
_EFFORT_BY_AGENT = {
    "vt5": config("VT5_EFFORT", default="high"),
}
# TTL del caché de prompt: "5m" | "1h" | "off".
#
# El prefijo de vt5 (system + PDFs) son ~73k tokens idénticos en cada corrida,
# pero escribir el caché NO es gratis: cuesta 1.25x con 5m y 2x con 1h, contra
# 0.1x por lectura. El punto de equilibrio depende de cuántos decks generes
# dentro de la ventana:
#   off  -> 1 deck aislado cada tanto (lo más barato si nunca hay 2 seguidos)
#   5m   -> default seguro: penalidad chica y cubre reintentos inmediatos
#   1h   -> conviene a partir de ~3 decks por hora (tandas de clientes)
_CACHE_TTL_BY_AGENT = {
    "vt5": config("VT5_CACHE_TTL", default="5m"),
}
# USD por millón de tokens (input, output).
_PRICES = {
    "claude-opus-5": (5.0, 25.0),
    "claude-sonnet-5": (3.0, 15.0),
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-haiku-4-5": (1.0, 5.0),
}
_CACHE_WRITE_MULT = {"5m": 1.25, "1h": 2.0}
_CACHE_READ_MULT = 0.1


def _cache_control(agent_id: str) -> dict | None:
    ttl = (_CACHE_TTL_BY_AGENT.get(agent_id) or "5m").strip().lower()
    if ttl in ("off", "none", "no", "0"):
        return None
    return {"type": "ephemeral", "ttl": ttl} if ttl == "1h" else {"type": "ephemeral"}


def _log_usage(agent_id: str, model: str, usage) -> None:
    """Deja el costo de cada corrida en el log. Sin esto se optimiza a ciegas."""
    inp = getattr(usage, "input_tokens", 0) or 0
    out = getattr(usage, "output_tokens", 0) or 0
    write = getattr(usage, "cache_creation_input_tokens", 0) or 0
    read = getattr(usage, "cache_read_input_tokens", 0) or 0
    p_in, p_out = _PRICES.get(model, (0.0, 0.0))
    mult = _CACHE_WRITE_MULT.get(_CACHE_TTL_BY_AGENT.get(agent_id) or "5m", 1.25)
    cost = (
        inp * p_in
        + write * p_in * mult
        + read * p_in * _CACHE_READ_MULT
        + out * p_out
    ) / 1_000_000
    ahorro = read * p_in * (1 - _CACHE_READ_MULT) / 1_000_000
    print(
        f"[{agent_id}/{model}] in={inp:,} cache_write={write:,} cache_read={read:,} "
        f"out={out:,} | USD {cost:.4f}"
        + (f" (caché ahorró {ahorro:.4f})" if read else " (SIN cache hit)")
    )


# Fragmento único de cada prompt canónico del repo (src/prompts/*.md). Sirve
# para adoptarlo una sola vez por encima de lo que haya quedado en la DB.
_CANONICAL_MARKERS = {
    "vt5": "director de arte y estratega de cierre de ATV",
    "bs1": "Sos el agente Oferta y Escalera de Valor de Grounded",
}

# Contrato técnico con el visor (frontend/src/lib/presentation-html.js).
# La dirección de arte y la estructura narrativa viven en prompts/vt5.md.
_VT5_HTML_FORMAT = """
CONTRATO DE RENDER — el visor ATV monta tu HTML en un escenario fijo de 1920×1080
y lo escala al viewport. Respetá esto al pie de la letra o el deck se rompe:

- Cada slide es un `<section class="slide">`. Nada de wrappers extra entre el body
  y los slides.
- El `<section class="slide">` ES el lienzo de 1920×1080. Poné vos el padding
  (72–96px) sobre el propio `.slide`. No declares `width`/`height` en `.slide`:
  el visor los fija.
- Podés usar `position: absolute` dentro del slide (logo, folio, línea de acento):
  el `.slide` es el bloque contenedor, así que `top/right/bottom/left` se anclan
  al lienzo de 1920×1080.
- PROHIBIDO usar unidades de viewport (`vh`, `vw`, `vmin`, `vmax`) en cualquier
  parte del CSS. El viewport real del iframe no mide 1920×1080 y todo se descuadra.
  Usá px, %, fr, rem.
- Cada slide tiene que ENTRAR en 1080px de alto. Lo que se pase se recorta.
- No escribas JS de navegación, ni `display:none` sobre los slides, ni flechas
  propias: el visor pone navegación, contador y teclado.
- Todo el CSS va en un único `<style>` en el `<head>`. Tipografías por
  `<link>` a Google Fonts. Sin CDNs de JS, sin imágenes remotas.

ENTREGABLE:
1) 2–4 líneas de resumen de las decisiones de diseño.
2) Un único bloque ```html ... ``` con el documento completo, de `<!DOCTYPE html>`
   a `</html>`. Si el usuario pide un cambio, devolvés el documento COMPLETO otra
   vez (no un fragmento ni un diff).
""".strip()


def _model_for(agent_id: str) -> str:
    return MODEL_BY_AGENT.get(agent_id, MODEL)


def _build_system_prompt(agent_id: str, cache: bool = False):
    agent_prompt = get_agent_system_prompt(agent_id)
    tone = get_tone_doc()
    examples = get_agent_examples(agent_id)

    examples_block = ""
    text_examples = [ex for ex in examples if not ex.get("has_file")]
    if agent_id == "vt5":
        # La referencia de vt5 es VISUAL. El texto extraído de un PDF de diseño
        # llega sin layout y con el orden de lectura roto: como "ejemplo de
        # calidad" empeora el output en vez de mejorarlo.
        text_examples = []
    if text_examples:
        examples_block = (
            "\n\n---\n\nEJEMPLOS DE OUTPUTS REALES\n\n"
            "Los siguientes son ejemplos de outputs generados anteriormente. "
            "Usálos como referencia de calidad, nivel de detalle y tono. "
            "Nunca copies el contenido — solo el estilo y la estructura.\n\n"
        )
        for i, ex in enumerate(text_examples, 1):
            examples_block += f"EJEMPLO {i} — {ex['title']}:\n{ex['content']}\n\n"

    file_examples = [ex for ex in examples if ex.get("has_file")]
    if file_examples:
        names = ", ".join(ex["title"] for ex in file_examples)
        if agent_id == "vt5":
            examples_block += (
                "\n\n---\n\nREFERENCIA VISUAL OBLIGATORIA\n\n"
                f"En el primer mensaje vienen adjuntos los decks reales de ATV ({names}). "
                "Son el estándar de calidad que tenés que igualar: miralos y sacá de ahí "
                "la escala tipográfica, los pesos, el tracking, los márgenes, la densidad "
                "de texto por slide, el uso del color de acento y el ritmo entre slides. "
                "Antes de escribir HTML, decidí explícitamente qué sistema visual estás "
                "reproduciendo. Nunca copies el contenido textual: solo el sistema de diseño.\n"
            )
        else:
            examples_block += (
                "\n\n---\n\nTambién hay ejemplos en PDF adjuntos en el mensaje "
                f"({names}). Tomalos como referencia visual de calidad y estructura, "
                "sin copiar el contenido.\n"
            )
    elif agent_id == "vt5":
        examples_block += (
            "\n\n---\n\nNo hay decks de referencia adjuntos en esta corrida. "
            "Diseñá igual al máximo nivel siguiendo el sistema visual descrito arriba, "
            "y evitá cualquier default genérico de IA.\n"
        )

    format_lock = f"\n\n---\n\n{_VT5_HTML_FORMAT}" if agent_id == "vt5" else ""

    text = (
        f"{agent_prompt}{examples_block}{format_lock}\n\n---\n\n{tone}\n\n"
        "Todo el output que generes debe respetar este tono de voz sin excepción."
    )
    block = {"type": "text", "text": text}
    cc = _cache_control(agent_id) if cache else None
    if cc:
        block["cache_control"] = cc
    return [block]


def _example_file_messages(
    agent_id: str,
    *,
    enabled: bool = True,
    limit: int | None = None,
    cache: bool = False,
) -> list[dict]:
    """PDF examples. Costoso: solo en el primer run (no en cada chat follow-up)."""
    if not enabled:
        return []
    examples = [ex for ex in get_agent_examples(agent_id, include_file_data=True) if ex.get("file_data")]
    if limit is not None:
        examples = examples[: max(0, limit)]

    # El request completo no puede superar 32MB. Recortamos por payload, no por
    # cantidad, para no romper con un PDF pesado.
    budget = _MAX_ATTACH_B64_TOTAL
    kept = []
    for ex in examples:
        size = len(ex["file_data"])
        if size > budget:
            print(
                f"_example_file_messages: '{ex['title']}' omitido "
                f"({size // 1_000_000}MB base64, presupuesto restante "
                f"{budget // 1_000_000}MB)"
            )
            continue
        budget -= size
        kept.append(ex)
    examples = kept

    messages = []
    for ex in examples:
        design_hint = (
            "Este PDF es un EJEMPLO VISUAL de presentación real del estándar ATV. "
            "Estudiá tipografía, jerarquía, spacing, contraste y composición. "
            "El output debe verse del MISMO nivel (en HTML), sin copiar el contenido."
            if agent_id == "vt5"
            else (
                f"EJEMPLO DE OUTPUT — {ex['title']}. "
                "Referencia de calidad y estructura. No copies el contenido."
            )
        )
        mt = ex.get("media_type") or "application/pdf"
        kind = "image" if mt.startswith("image/") else "document"
        messages.append(
            {
                "role": "user",
                "content": [
                    {
                        "type": kind,
                        "source": {
                            "type": "base64",
                            "media_type": mt,
                            "data": ex["file_data"],
                        },
                    },
                    {"type": "text", "text": f"EJEMPLO — {ex['title']}. {design_hint}"},
                ],
            }
        )
        messages.append(
            {
                "role": "assistant",
                "content": (
                    "Perfecto. Voy a tomar ese ejemplo como referencia visual de tipografía, "
                    "layout y calidad, sin copiar el contenido."
                    if agent_id == "vt5"
                    else (
                        "Entendido. Voy a usar ese ejemplo como referencia de calidad "
                        "sin copiar el contenido."
                    )
                ),
            }
        )

    # Breakpoint de caché al final de los adjuntos: system + PDFs se sirven
    # cacheados en las corridas siguientes (los PDFs son el 90% del input).
    if cache and messages:
        last_user = next(
            (m for m in reversed(messages) if m["role"] == "user"),
            None,
        )
        cc = _cache_control(agent_id)
        if cc and last_user and isinstance(last_user["content"], list):
            last_user["content"][-1]["cache_control"] = cc

    return messages


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
        # Adopción única del prompt canónico del repo. Hasta ahora estos agentes
        # vivían con lo pegado desde la UI — en el caso de bs1, con el documento
        # de investigación previo en vez de un prompt. Una vez adoptado, el
        # marcador queda en el stored y las ediciones desde la UI se respetan.
        marker = _CANONICAL_MARKERS.get(agent_id)
        if marker and marker in (default or "") and marker not in stored:
            row.system_prompt = default
            return default
        return stored.strip() and stored or default


_MAX_EXAMPLE_CHARS = 40000
_EXAMPLE_PDF_PAGES = 40
_MIN_PDF_TEXT = 80


def _pdf_bytes_to_text(
    raw: bytes, *, max_pages: int = 8, max_chars: int = _MAX_DOC_CHARS
) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        return ""
    try:
        reader = PdfReader(io.BytesIO(raw))
        parts = []
        for i, page in enumerate(reader.pages):
            if i >= max_pages:
                break
            extracted = ""
            try:
                extracted = (page.extract_text() or "").strip()
            except Exception:
                extracted = ""
            if not extracted:
                try:
                    extracted = (page.extract_text(extraction_mode="layout") or "").strip()
                except Exception:
                    extracted = ""
            if extracted:
                parts.append(extracted)
        text = "\n\n".join(parts).strip()
        if len(text) > max_chars:
            text = text[:max_chars] + "\n[documento recortado]"
        return text
    except Exception:
        return ""


def _pdf_to_text(data_b64: str) -> str:
    try:
        raw = base64.b64decode(data_b64)
    except Exception:
        return ""
    return _pdf_bytes_to_text(raw)


def _docx_bytes_to_text(raw: bytes) -> str:
    try:
        import zipfile
        from xml.etree import ElementTree as ET

        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            xml = zf.read("word/document.xml")
        root = ET.fromstring(xml)
        paras = []
        for p in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
            texts = [
                (t.text or "")
                for t in p.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")
            ]
            line = "".join(texts).strip()
            if line:
                paras.append(line)
        text = "\n".join(paras).strip()
        if len(text) > _MAX_EXAMPLE_CHARS:
            text = text[:_MAX_EXAMPLE_CHARS] + "\n[documento recortado]"
        return text
    except Exception:
        return ""


def extract_example_document(filename: str, raw: bytes) -> dict:
    if not raw:
        raise HTTPException(status_code=400, detail="El archivo está vacío")

    name = (filename or "ejemplo").strip() or "ejemplo"
    lower = name.lower()
    title = Path(name).stem.strip() or "ejemplo"
    is_pdf = lower.endswith(".pdf") or raw[:4] == b"%PDF"
    is_docx = lower.endswith(".docx")
    is_text = lower.endswith((".md", ".txt", ".csv", ".json"))
    img_type = next((v for k, v in _IMAGE_TYPES.items() if lower.endswith(k)), None)

    content = ""
    media_type = None
    file_data = None

    if img_type:
        if len(raw) > _MAX_IMAGE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"La imagen pesa {len(raw)//1_000_000}MB. El máximo es 5MB.",
            )
        media_type = img_type
        file_data = base64.b64encode(raw).decode("ascii")
        content = f"[Imagen adjunta: {name}]"
    elif is_text:
        content = raw.decode("utf-8", errors="replace").strip()
    elif is_docx:
        content = _docx_bytes_to_text(raw)
    elif is_pdf:
        content = _pdf_bytes_to_text(
            raw, max_pages=_EXAMPLE_PDF_PAGES, max_chars=_MAX_EXAMPLE_CHARS
        )
        # Un PDF de ejemplo SIEMPRE se guarda como adjunto, tenga o no capa de
        # texto: los decks exportados de Canva/Figma/Keynote sí tienen texto, y
        # si nos quedamos con el texto el modelo nunca ve el diseño.
        if len(raw) <= _MAX_ATTACH_RAW_BYTES:
            media_type = "application/pdf"
            file_data = base64.b64encode(raw).decode("ascii")
        else:
            print(
                f"extract_example_document: '{name}' pesa "
                f"{len(raw) // 1_000_000}MB — se guarda solo el texto"
            )
        if not content:
            content = f"[PDF adjunto: {name}]"
    else:
        raise HTTPException(
            status_code=400,
            detail="Formato no soportado. Usá .md, .txt, .docx, .pdf o una imagen.",
        )

    if not content and not file_data:
        raise HTTPException(
            status_code=400,
            detail="No se pudo leer el documento. Probá exportarlo a .txt/.md o pegá el texto.",
        )
    if len(content) > _MAX_EXAMPLE_CHARS:
        content = content[:_MAX_EXAMPLE_CHARS] + "\n[documento recortado]"

    result = {"title": title, "content": content}
    if media_type and file_data:
        result["media_type"] = media_type
        result["file_data"] = file_data
        result["filename"] = name
    return result


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
        if not item.data:
            continue
        # Las imágenes van siempre como bloque visual: no hay texto que extraer.
        if (item.media_type or "").startswith("image/"):
            blocks.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": item.media_type,
                        "data": item.data,
                    },
                }
            )
        elif item.media_type == "application/pdf":
            pdf_text = _pdf_to_text(item.data)
            if len(pdf_text) >= _MIN_PDF_TEXT:
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
        solo_img = all((f.media_type or "").startswith("image/") for f in files)
        caption = (
            f"Mirá la imagen adjunta ({names}) y ejecutá tu skill sobre lo que ves."
            if solo_img
            else f"Leé el documento adjunto ({names}) y ejecutá tu skill."
        )
    if blocks:
        blocks.append({"type": "text", "text": caption})
        return {"role": "user", "content": blocks}
    return {"role": "user", "content": caption}


def _complete(system: str, messages: list[dict], agent_id: str = "") -> str:
    max_tokens = _LONG_OUTPUT_TOKENS.get(agent_id, MAX_TOKENS)
    params = {
        "model": _model_for(agent_id),
        "max_tokens": max_tokens,
        "system": system,
        "messages": messages,
    }
    if agent_id in _THINKING_AGENTS:
        # Diseñar un deck es una tarea de criterio: que piense antes de escribir.
        params["thinking"] = {"type": "adaptive"}
        params["output_config"] = {"effort": _EFFORT_BY_AGENT.get(agent_id, "high")}

    client = _client()
    if max_tokens > _STREAM_THRESHOLD:
        # Sin streaming el SDK corta por timeout HTTP en outputs largos.
        with client.messages.stream(**params) as stream:
            response = stream.get_final_message()
    else:
        response = client.messages.create(**params)

    _log_usage(agent_id, params["model"], response.usage)

    if response.stop_reason == "refusal":
        raise HTTPException(
            status_code=422,
            detail="Claude rechazó la generación. Reformulá el input y volvé a intentar.",
        )

    parts = [block.text for block in response.content if block.type == "text"]
    raw = "".join(parts)

    if response.stop_reason == "max_tokens":
        print(
            f"_complete[{agent_id}]: output truncado en {max_tokens} tokens "
            f"({len(raw)} chars). Subir _LONG_OUTPUT_TOKENS."
        )

    if agent_id in ("mk1", "vt5"):
        return raw.strip()
    return _plain_voice(raw)


def _session_messages(session) -> list[dict]:
    rows = sorted(session.messages, key=lambda m: (m.created_at, m.id))
    return [{"role": msg.role, "content": str(msg.content or "")} for msg in rows]


_MAX_ARTIFACT_CHARS = 160_000


def _last_artifact_index(messages: list[dict]) -> int:
    """Índice del último assistant que entregó un documento HTML completo."""
    for i in range(len(messages) - 1, -1, -1):
        item = messages[i]
        if item.get("role") != "assistant":
            continue
        content = item.get("content") or ""
        if isinstance(content, str) and ("```html" in content or "<html" in content.lower()):
            return i
    return -1


def _trim_history(messages: list[dict]) -> list[dict]:
    keep = messages[-6:]
    # El entregable anterior se preserva entero: si lo recortamos, un "cambiá el
    # slide 3" obliga al modelo a regenerar de cero y el deck deriva.
    artifact = _last_artifact_index(keep)
    out = []
    for i, item in enumerate(keep):
        content = item.get("content") or ""
        last = i == len(keep) - 1
        if i == artifact:
            cap = _MAX_ARTIFACT_CHARS
        else:
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
    system = _build_system_prompt(agent_id, cache=True)
    messages = [
        *_example_file_messages(agent_id, enabled=True, cache=True),
        _user_message(input_doc, files),
    ]
    output = _complete(system, messages, agent_id)
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
    # Breakpoint al final del historial: el deck anterior son ~16k tokens que
    # viajan en cada follow-up. Cacheado, el segundo "cambiá el slide X" los lee
    # a 0.1x en vez de repagarlos enteros.
    cc_hist = _cache_control(agent_id)
    if cc_hist and api_messages:
        tail = api_messages[-1]
        if isinstance(tail.get("content"), str) and tail["content"].strip():
            tail["content"] = [
                {"type": "text", "text": tail["content"], "cache_control": cc_hist}
            ]
    # No reinyectar PDFs en follow-ups: multiplica el costo sin ganar calidad
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
                "title": str(session.title or "").strip(),
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
                "title": session.get("title") or "",
                "message_count": len(messages),
            }
        )
    return AgentSessionListResponse(sessions=items)


def rename_session(session_id: int, title: str) -> dict:
    clean = (title or "").strip()[:120]
    if not clean:
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
    with db_session:
        session = AgentSession.get(id=session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        session.title = clean
        session.updated_at = datetime.utcnow()
    return {"ok": True, "session_id": session_id, "title": clean}


def delete_session(session_id: int) -> dict:
    with db_session:
        session = AgentSession.get(id=session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        session.delete()
    return {"ok": True}


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


def get_agent_examples(agent_id: str, include_file_data: bool = False) -> list[dict]:
    # Filtrar en Python: el lambda de Pony choca si la variable se llama agent_id
    with db_session:
        rows = [e for e in list(AgentExample.select()) if e.agent_id == agent_id]
        rows = sorted(rows, key=lambda e: (e.created_at, e.id))
        out = []
        for e in rows:
            media_type = (e.media_type or "").strip() or None
            filename = (e.filename or "").strip() or None
            has_file = bool(media_type and filename)
            item = {
                "id": e.id,
                "agent_id": e.agent_id,
                "title": e.title,
                "content": str(e.content or ""),
                "created_at": e.created_at,
                "media_type": media_type,
                "filename": filename,
                "has_file": has_file,
            }
            if include_file_data and has_file:
                file_data = str(e.file_data or "")
                if file_data:
                    item["file_data"] = file_data
                else:
                    item["has_file"] = False
            out.append(item)
        return out


def create_agent_example(
    agent_id: str,
    title: str,
    content: str,
    media_type: str | None = None,
    file_data: str | None = None,
    filename: str | None = None,
) -> dict:
    with db_session:
        example = AgentExample(
            agent_id=agent_id,
            title=title,
            content=content,
            created_at=datetime.utcnow(),
            media_type=media_type or "",
            file_data=file_data or "",
            filename=filename or "",
        )
        flush()
        stored = str(example.file_data or "")
        return {
            "id": example.id,
            "agent_id": example.agent_id,
            "title": example.title,
            "content": str(example.content or ""),
            "created_at": example.created_at,
            "media_type": example.media_type or None,
            "filename": example.filename or None,
            "has_file": bool(stored),
        }


def delete_agent_example(example_id: int):
    with db_session:
        example = AgentExample.get(id=example_id)
        if not example:
            raise HTTPException(status_code=404, detail="Example not found")
        example.delete()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Trabajos en segundo plano
#
# Una generación tarda entre 10s y varios minutos. Sostener eso en un HTTP
# abierto significa que un wifi que se corta o una pestaña que se cierra
# tiran a la basura tokens ya pagados. El navegador arranca el trabajo,
# recibe un id al instante y después pregunta por el resultado.
# ---------------------------------------------------------------------------

# Si un trabajo quedó "running" más que esto, el proceso se cayó a mitad.
_JOB_STALE_SECONDS = 20 * 60


def create_job(kind: str, agent_id: str = "") -> str:
    job_id = uuid.uuid4().hex
    now = datetime.utcnow()
    with db_session:
        AgentJob(
            id=job_id,
            kind=kind,
            status="running",
            agent_id=agent_id or "",
            created_at=now,
            updated_at=now,
        )
    return job_id


def _finish_job(job_id: str, *, session_id: int = 0, output: str = "", error: str = ""):
    with db_session:
        job = AgentJob.get(id=job_id)
        if job is None:
            return
        job.status = "error" if error else "done"
        job.session_id = session_id or 0
        job.output = output or ""
        job.error = (error or "")[:600]
        job.updated_at = datetime.utcnow()


def execute_run_job(job_id: str, client_id: str, agent_id: str, input_doc: str, files):
    try:
        res = run_agent(client_id, agent_id, input_doc, files)
        _finish_job(job_id, session_id=res.session_id, output=res.output)
    except HTTPException as exc:
        _finish_job(job_id, error=str(exc.detail))
    except Exception as exc:
        traceback.print_exc()
        _finish_job(job_id, error=f"{type(exc).__name__}: {exc}")


def execute_chat_job(job_id: str, session_id: int, message: str, files):
    try:
        res = chat_agent(session_id, message, files)
        _finish_job(job_id, session_id=res.session_id, output=res.reply)
    except HTTPException as exc:
        _finish_job(job_id, error=str(exc.detail))
    except Exception as exc:
        traceback.print_exc()
        _finish_job(job_id, error=f"{type(exc).__name__}: {exc}")


def get_job(job_id: str) -> dict:
    with db_session:
        job = AgentJob.get(id=job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Ese trabajo no existe o ya se limpió.")
        status, error = job.status, str(job.error or "")
        if status == "running":
            edad = (datetime.utcnow() - job.updated_at).total_seconds()
            if edad > _JOB_STALE_SECONDS:
                status, error = "error", "El servidor se reinició mientras generaba. Volvé a intentar."
                job.status, job.error = status, error
        return {
            "job_id": job.id,
            "status": status,
            "session_id": job.session_id or None,
            "output": str(job.output or ""),
            "error": error,
        }
