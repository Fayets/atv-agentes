from fastapi import APIRouter, BackgroundTasks, File, UploadFile
from pydantic import BaseModel

from src.schemas import (
    AgentChatRequest,
    AgentChatResponse,
    AgentExampleCreate,
    AgentExampleResponse,
    AgentHistoryResponse,
    AgentJobRef,
    AgentJobStatus,
    AgentLatestSessionResponse,
    AgentRunRequest,
    AgentRunResponse,
    AgentSessionListResponse,
    AgentSessionRenameRequest,
)
from src.services import agent_service

router = APIRouter(prefix="/api/agents", tags=["agents"])


class AgentConfigSaveRequest(BaseModel):
    tone_doc: str = ""
    system_prompt: str


class ToneSaveRequest(BaseModel):
    tone_doc: str


class ClaudeKeyRequest(BaseModel):
    api_key: str


@router.post("/run", response_model=AgentJobRef)
def run(payload: AgentRunRequest, background: BackgroundTasks):
    """Arranca la generación y devuelve al instante. El resultado se busca
    en /jobs/{job_id} — una corrida puede tardar varios minutos."""
    job_id = agent_service.create_job("run", payload.agent_id)
    background.add_task(
        agent_service.execute_run_job,
        job_id,
        payload.client_id,
        payload.agent_id,
        payload.input_doc,
        payload.files,
    )
    return AgentJobRef(job_id=job_id)


@router.post("/chat", response_model=AgentJobRef)
def chat(payload: AgentChatRequest, background: BackgroundTasks):
    job_id = agent_service.create_job("chat")
    background.add_task(
        agent_service.execute_chat_job,
        job_id,
        payload.session_id,
        payload.message,
        payload.files,
    )
    return AgentJobRef(job_id=job_id)


@router.get("/jobs/{job_id}", response_model=AgentJobStatus)
def job_status(job_id: str):
    return agent_service.get_job(job_id)


@router.get("/history/{session_id}", response_model=AgentHistoryResponse)
def history(session_id: int):
    return agent_service.get_history(session_id)


@router.get("/sessions", response_model=AgentSessionListResponse)
def sessions(client_id: str, agent_id: str):
    return agent_service.list_client_sessions(client_id, agent_id)


@router.get("/sessions/latest", response_model=AgentLatestSessionResponse)
def latest_session(client_id: str, agent_id: str):
    return agent_service.get_latest_session(client_id, agent_id)


@router.patch("/sessions/{session_id}")
def rename_session(session_id: int, payload: AgentSessionRenameRequest):
    return agent_service.rename_session(session_id, payload.title)


@router.delete("/sessions/{session_id}")
def delete_session(session_id: int):
    return agent_service.delete_session(session_id)


@router.get("/catalog")
def list_agents():
    return {"agents": agent_service.list_agents()}


@router.get("/config/{agent_id}")
def get_config(agent_id: str):
    return agent_service.get_agent_config(agent_id)


@router.post("/config/{agent_id}")
def save_config(agent_id: str, payload: AgentConfigSaveRequest):
    agent_service.save_agent_config(agent_id, payload.tone_doc, payload.system_prompt)
    return {"ok": True}


@router.get("/tone")
def get_tone():
    return {"tone_doc": agent_service.get_tone_doc()}


@router.post("/tone")
def save_tone(payload: ToneSaveRequest):
    return agent_service.save_tone_doc(payload.tone_doc)


@router.get("/claude")
def get_claude():
    return agent_service.get_claude_status()


@router.post("/claude")
def save_claude(payload: ClaudeKeyRequest):
    return agent_service.save_claude_key(payload.api_key)


@router.get("/examples/{agent_id}", response_model=list[AgentExampleResponse])
def list_examples(agent_id: str):
    return agent_service.get_agent_examples(agent_id)


@router.post("/examples", response_model=AgentExampleResponse)
def create_example(payload: AgentExampleCreate):
    return agent_service.create_agent_example(
        payload.agent_id,
        payload.title,
        payload.content,
        payload.media_type,
        payload.file_data,
        payload.filename,
    )


@router.post("/examples/extract")
async def extract_example(file: UploadFile = File(...)):
    raw = await file.read()
    return agent_service.extract_example_document(file.filename or "ejemplo", raw)


@router.delete("/examples/{example_id}")
def delete_example(example_id: int):
    return agent_service.delete_agent_example(example_id)
