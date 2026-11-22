import operator
from typing import Annotated, Literal, Optional
from typing_extensions import TypedDict
from pydantic import BaseModel, Field


# ==========================================
# Pydantic Schemas for Structured LLM Output
# ==========================================

class DecomposedClaims(BaseModel):
    """Structured output for breaking a complex claim into atomic sub-claims."""
    sub_claims: list[str] = Field(
        min_length=1,
        max_length=4,
        description="2 to 3 atomic, independently falsifiable sub-claims",
    )


class ArgumentOutput(BaseModel):
    """Structured output for proponent and skeptic debate arguments."""
    search_query: str = Field(
        description="Single focused search query used to retrieve evidence",
    )
    argument: str = Field(
        description="Concise ~180-word cited argument supporting or refuting the claim",
    )
    cited_urls: list[str] = Field(
        default_factory=list,
        description="URLs of evidence sources explicitly cited in the argument",
    )


class ClaimBreakdownItem(BaseModel):
    """Evaluation breakdown for an individual sub-claim."""
    sub_claim: str = Field(description="The atomic sub-claim being evaluated")
    status: Literal["VERIFIED_TRUE", "VERIFIED_FALSE", "AMBIGUOUS", "UNSUPPORTED"] = Field(
        description="Factual verification status of this specific sub-claim"
    )
    rationale: str = Field(description="Brief explanation of the verdict on this sub-claim")


class CitationAuditItem(BaseModel):
    """Credibility and relevance audit of an evidence source."""
    url: str = Field(description="Source URL")
    reliability: Literal["HIGH", "MEDIUM", "LOW", "QUESTIONABLE"] = Field(
        description="Assessed reliability of the domain or source"
    )
    relevance: str = Field(description="How this source informs the verdict")


class VerdictSchema(BaseModel):
    """Final judge verdict synthesizing all debate rounds and evidence."""
    verdict: Literal["SUPPORTED", "REFUTED", "MIXED", "UNVERIFIABLE"] = Field(
        description="Definitive verdict on the core claim"
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence score from 0.0 to 1.0",
    )
    summary: str = Field(
        description="Comprehensive executive synthesis explaining the verdict",
    )
    claim_breakdown: list[ClaimBreakdownItem] = Field(
        default_factory=list,
        description="Sub-claim by sub-claim factual analysis",
    )
    citation_audit: list[CitationAuditItem] = Field(
        default_factory=list,
        description="Credibility and relevance audit of all cited sources",
    )


# ==========================================
# LangGraph State Schema
# ==========================================

class DebateState(TypedDict):
    """Thread-scoped state passed across LangGraph nodes."""
    thread_id: Optional[str]
    raw_claim: str
    sub_claims: list[str]
    round: int
    max_rounds: int
    proponent_args: Annotated[list[dict], operator.add]
    skeptic_args: Annotated[list[dict], operator.add]
    evidence_urls: Annotated[list[dict], operator.add]
    human_context: Optional[str]
    verdict: Optional[dict]
    token_usage: Annotated[int, operator.add]
    guard_flagged: Optional[bool]
    rescored: Optional[bool]
