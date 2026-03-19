"""coaching.py — Coaching endpoint
Receives pre-computed features + classification from the frontend,
generates the LLM lesson, returns structured coaching response.

The LLM NEVER analyzes chess positions directly.
It receives verified facts and writes the lesson text.
"""
from fastapi import APIRouter, HTTPException

from app.schemas.coaching import CoachingRequest, CoachingResponse
from app.services import coaching as coaching_service

router = APIRouter()


@router.post("/lesson", response_model=CoachingResponse)
async def generate_lesson(request: CoachingRequest):
    """Generate a coaching lesson for a critical moment.

    Frontend sends pre-verified facts + classification result.
    Returns the LLM-generated 5-step lesson (or observation if confidence < 70).
    """
    try:
        result = await coaching_service.generate_lesson(request.model_dump())
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/socratic")
async def generate_socratic_question():
    # Think First blunder-check checklist is rendered client-side from classification data.
    # This endpoint is reserved for future server-side Socratic question generation.
    return {"status": "not_implemented"}
