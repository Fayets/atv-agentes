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
    message_count: int


class AgentSessionListResponse(BaseModel):
    sessions: list[AgentSessionSummary]


class AgentLatestSessionResponse(BaseModel):
    session_id: int | None = None
    messages: list[dict] = Field(default_factory=list)
