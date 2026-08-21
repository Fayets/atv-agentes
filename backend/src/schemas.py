from datetime import datetime

from pydantic import BaseModel, Field


class AgentFile(BaseModel):
    name: str
    media_type: str
    data: str


class AgentRunRequest(BaseModel):
    client_id: str
    agent_id: str
    input_doc: str = ""
    files: list[AgentFile] = Field(default_factory=list)


class AgentRunResponse(BaseModel):
    session_id: int
    output: str


class AgentChatRequest(BaseModel):
    session_id: int
    message: str = ""
    files: list[AgentFile] = Field(default_factory=list)


class AgentChatResponse(BaseModel):
    session_id: int
    reply: str


class AgentHistoryResponse(BaseModel):
    session_id: int
    messages: list[dict]


class AgentSessionSummary(BaseModel):
    session_id: int
    created_at: str
    updated_at: str
    preview: str
    title: str = ""
    message_count: int


class AgentSessionRenameRequest(BaseModel):
    title: str


class AgentSessionListResponse(BaseModel):
    sessions: list[AgentSessionSummary]


class AgentLatestSessionResponse(BaseModel):
    session_id: int | None = None
    messages: list[dict] = Field(default_factory=list)


class AgentExampleCreate(BaseModel):
    agent_id: str
    title: str
    content: str
    media_type: str | None = None
    file_data: str | None = None
    filename: str | None = None


class AgentExampleResponse(BaseModel):
    id: int
    agent_id: str
    title: str
    content: str
    created_at: datetime
    media_type: str | None = None
    filename: str | None = None
    has_file: bool = False
