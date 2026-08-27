"""Lectura de referencias externas (YouTube e Instagram).

El operador pega un enlace en el chat y el agente tiene que poder mirarlo. Acá
se resuelve de dónde sacar esos datos y se los devuelve como texto plano listo
para inyectar en el prompt.

Dos rutas distintas a propósito:

- YouTube va por yt-dlp: gratis, sin credenciales, y ya probado. No hay razón
  para pagar por esto.
- Instagram va por Apify. La API oficial de Instagram solo devuelve datos de
  cuentas propias, así que para mirar a la competencia no hay alternativa
  gratuita confiable.

Nada de esto puede tumbar una corrida: si una referencia falla, se devuelve el
motivo como texto y el agente sigue trabajando sin ella.
"""

import io
import json
import re
import urllib.request
from datetime import datetime, timedelta

from decouple import config
from pony.orm import db_session

from src.models import AppSetting, ScrapeCache

_APIFY_KEY_ID = "apify_api_key"
_APIFY_ACTOR = "apify~instagram-scraper"
_CACHE_DIAS = 7
_TIMEOUT_APIFY = 150
_MAX_POSTS = 12
_MAX_TRANSCRIPT = 12000

_URL_RE = re.compile(r"https?://[^\s<>\"')\]]+", re.I)
_YT_RE = re.compile(r"(youtube\.com|youtu\.be)", re.I)
_IG_RE = re.compile(r"instagram\.com", re.I)


# --------------------------------------------------------------------------
# credencial de Apify (mismo patrón que la de Anthropic)
# --------------------------------------------------------------------------
def _env_apify_key() -> str:
    return (config("APIFY_API_KEY", default="") or "").strip()


def _db_apify_key() -> str:
    with db_session:
        row = AppSetting.get(id=_APIFY_KEY_ID)
        return str(row.value or "").strip() if row else ""


def _apify_key() -> str:
    return _db_apify_key() or _env_apify_key()


def save_apify_key(api_key: str) -> dict:
    key = (api_key or "").strip()
    now = datetime.utcnow()
    with db_session:
        row = AppSetting.get(id=_APIFY_KEY_ID)
        if row is None:
            AppSetting(id=_APIFY_KEY_ID, value=key, updated_at=now)
        else:
            row.value = key
            row.updated_at = now
    return get_apify_status()


def get_apify_status() -> dict:
    key = _apify_key()
    hint = f"{key[:8]}…{key[-4:]}" if len(key) >= 12 else ("••••" if key else "")
    return {
        "connected": bool(key),
        "hint": hint,
        "source": "app" if _db_apify_key() else ("env" if _env_apify_key() else None),
    }


# --------------------------------------------------------------------------
# utilidades
# --------------------------------------------------------------------------
def detect_platform(url: str) -> str | None:
    if _YT_RE.search(url):
        return "youtube"
    if _IG_RE.search(url):
        return "instagram"
    return None


def extract_urls(text: str) -> list[str]:
    """URLs de plataformas soportadas, sin repetir y en orden de aparición."""
    vistas, out = set(), []
    for u in _URL_RE.findall(text or ""):
        u = u.rstrip(".,;")
        if detect_platform(u) and u not in vistas:
            vistas.add(u)
            out.append(u)
    return out


def _vtt_a_texto(vtt: str) -> str:
    """Los subtítulos rodantes repiten cada línea 2 o 3 veces."""
    lineas, vistas, prev = [], set(), ""
    for ln in vtt.splitlines():
        ln = ln.strip()
        if not ln or "-->" in ln or ln.startswith(("WEBVTT", "Kind:", "Language:", "NOTE")):
            continue
        ln = re.sub(r"<[^>]+>", "", ln).strip()
        if not ln or ln == prev or ln.lower() in vistas:
            continue
        vistas.add(ln.lower())
        lineas.append(ln)
        prev = ln
    return re.sub(r"\s+", " ", " ".join(lineas)).strip()


# --------------------------------------------------------------------------
# YouTube
# --------------------------------------------------------------------------
def _info_youtube(url: str) -> dict | None:
    """yt-dlp puede estar como módulo (pip) o solo como binario en el PATH.
    Se aceptan las dos: el contenedor instala el paquete, pero en local suele
    estar puesto con brew."""
    try:
        import yt_dlp

        opts = {"quiet": True, "no_warnings": True, "skip_download": True}
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=False)
    except ImportError:
        pass

    import shutil
    import subprocess

    exe = shutil.which("yt-dlp")
    if not exe:
        return None
    salida = subprocess.run(
        [exe, "--dump-single-json", "--skip-download", "--no-warnings", url],
        capture_output=True, text=True, timeout=120,
    )
    if salida.returncode != 0 or not salida.stdout.strip():
        raise RuntimeError((salida.stderr or "yt-dlp falló").strip()[:200])
    return json.loads(salida.stdout)


def _scrape_youtube(url: str) -> str:
    info = _info_youtube(url)
    if info is None:
        return "[No se pudo leer el video: falta yt-dlp en el servidor.]"

    if info.get("_type") == "playlist":
        vids = [e.get("title", "") for e in (info.get("entries") or [])[:25] if e]
        return (
            f"CANAL/PLAYLIST DE REFERENCIA: {info.get('title','')}\n"
            f"Videos recientes:\n" + "\n".join(f"- {t}" for t in vids)
        )

    partes = [
        f"VIDEO DE YOUTUBE DE REFERENCIA",
        f"Título: {info.get('title','')}",
        f"Canal: {info.get('uploader','')}",
        f"Duración: {round((info.get('duration') or 0)/60)} min",
        f"Vistas: {info.get('view_count','')}",
        f"Miniatura: {info.get('thumbnail','')}",
    ]
    desc = (info.get("description") or "").strip()
    if desc:
        partes.append(f"\nDescripción:\n{desc[:1500]}")

    # pista original de subtítulos automáticos; si no, cualquier español
    auto = info.get("automatic_captions") or {}
    pista = None
    for clave in list(auto.keys()):
        if clave.endswith("-orig"):
            pista = auto[clave]
            break
    if pista is None:
        for clave in ("es", "en"):
            if clave in auto:
                pista = auto[clave]
                break
    if pista:
        vtt_url = next((f["url"] for f in pista if f.get("ext") == "vtt"), None)
        if vtt_url:
            try:
                with urllib.request.urlopen(vtt_url, timeout=45) as r:
                    texto = _vtt_a_texto(r.read().decode("utf-8", errors="replace"))
                if texto:
                    partes.append(f"\nTranscript:\n{texto[:_MAX_TRANSCRIPT]}")
            except Exception as exc:
                partes.append(f"\n[No se pudo bajar el transcript: {exc}]")
    else:
        partes.append("\n[El video no tiene subtítulos automáticos disponibles.]")

    return "\n".join(partes)


# --------------------------------------------------------------------------
# Instagram
# --------------------------------------------------------------------------
def _scrape_instagram(url: str) -> str:
    key = _apify_key()
    if not key:
        return (
            "[No se pudo leer el perfil de Instagram: falta la API key de Apify. "
            "Se carga en la pantalla de Conexión.]"
        )

    endpoint = (
        f"https://api.apify.com/v2/acts/{_APIFY_ACTOR}"
        f"/run-sync-get-dataset-items?token={key}"
    )
    payload = {
        "directUrls": [url],
        "resultsType": "details",
        "resultsLimit": _MAX_POSTS,
        "addParentData": False,
    }
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_APIFY) as r:
            items = json.loads(r.read().decode("utf-8"))
    except Exception as exc:
        return f"[No se pudo leer el perfil de Instagram ({exc}). Podés subir capturas a mano.]"

    if not items:
        return "[Apify no devolvió datos para ese perfil. Puede ser privado o no existir.]"

    d = items[0]

    # Apify no falla el request cuando el perfil no existe o es privado: devuelve
    # un item con `error` y los campos vacíos. Sin este chequeo el agente recibía
    # una ficha en blanco y la trataba como un perfil real sin bio ni posts.
    if d.get("error"):
        motivo = d.get("errorDescription") or d.get("error")
        return (
            f"[No existe el perfil @{d.get('username','')} en Instagram "
            f"({motivo}). Verificá el nombre de usuario.]"
        )
    partes = [
        "PERFIL DE INSTAGRAM DE REFERENCIA",
        f"Usuario: @{d.get('username','')}",
        f"Nombre: {d.get('fullName','')}",
        f"Seguidores: {d.get('followersCount','')}",
        f"Sigue a: {d.get('followsCount','')}",
        f"Publicaciones: {d.get('postsCount','')}",
        f"Verificado: {'sí' if d.get('verified') else 'no'}",
        f"Sitio: {d.get('externalUrl','') or '(sin link)'}",
        f"\nBio:\n{(d.get('biography') or '(vacía)').strip()}",
    ]

    posts = d.get("latestPosts") or []
    if posts:
        partes.append(f"\nÚltimas {min(len(posts), _MAX_POSTS)} publicaciones:")
        for p in posts[:_MAX_POSTS]:
            cap = re.sub(r"\s+", " ", (p.get("caption") or "")).strip()
            partes.append(
                f"- [{p.get('type','')}] likes {p.get('likesCount','?')} · "
                f"comentarios {p.get('commentsCount','?')}\n  {cap[:400]}"
            )
    return "\n".join(partes)


# --------------------------------------------------------------------------
# entrada pública
# --------------------------------------------------------------------------
def scrape_url(url: str, *, usar_cache: bool = True) -> str:
    plataforma = detect_platform(url)
    if not plataforma:
        return ""

    if usar_cache:
        with db_session:
            row = ScrapeCache.get(url=url)
            if row and row.created_at > datetime.utcnow() - timedelta(days=_CACHE_DIAS):
                return str(row.content)

    try:
        crudo = _scrape_youtube(url) if plataforma == "youtube" else _scrape_instagram(url)
        # Postgres recorta el espacio final al guardar LongStr; normalizamos acá
        # para que lo devuelto y lo cacheado sean siempre el mismo string.
        texto = (crudo or "").strip()
    except Exception as exc:
        print(f"scrape_url: {url} falló — {type(exc).__name__}: {exc}")
        return f"[No se pudo leer la referencia {url}: {exc}]"

    # Los errores no se cachean: la próxima corrida vuelve a intentar.
    if texto and not texto.startswith("["):
        now = datetime.utcnow()
        with db_session:
            row = ScrapeCache.get(url=url)
            if row is None:
                ScrapeCache(url=url, platform=plataforma, content=texto, created_at=now)
            else:
                row.content, row.created_at, row.platform = texto, now, plataforma
    return texto


def scrape_from_text(text: str, *, limite: int = 4) -> list[str]:
    """Lee todas las referencias que aparezcan en el texto del operador."""
    return [b for b in (scrape_url(u) for u in extract_urls(text)[:limite]) if b]
