"""coaching.py — Coaching endpoint
Receives pre-computed features + classification from the frontend,
generates the LLM lesson, returns structured coaching response.

The LLM NEVER analyzes chess positions directly.
It receives verified facts and writes the lesson text.
"""
from fastapi import APIRouter

router = APIRouter()


@router.post("/lesson")
async def generate_lesson():
    # TODO (Track B, Session 10-11): Accept CoachingRequest schema,
    # call coaching service, return structured lesson
    return {"status": "not_implemented"}


@router.post("/socratic")
async def generate_socratic_question():
    # TODO: Generate Think First mode question for a critical moment
    return {"status": "not_implemented"}
