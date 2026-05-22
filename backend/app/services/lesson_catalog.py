"""Lesson definitions used by account-wide Insights.

The frontend already has a richer principle taxonomy for per-game coaching.
This backend catalog is intentionally smaller: it defines the launch lessons
that the broad account scan is allowed to nominate and teach.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LessonDefinition:
    id: str
    category: str
    title: str
    report_title: str
    summary: str
    habit: tuple[str, ...]
    ai_context: str
    practice_prompt: str
    min_move: int
    max_move: int
    priority: int


LESSONS: dict[str, LessonDefinition] = {
    "loose_pieces": LessonDefinition(
        id="loose_pieces",
        category="hung_piece",
        title="Loose pieces / blunder check",
        report_title="Stop leaving pieces loose.",
        summary=(
            "Your games keep reaching positions where one move changes what is defended. "
            "The fastest fix is a short blunder check before you commit."
        ),
        habit=(
            "What is attacked?",
            "What is undefended?",
            "What stops being defended if I move this piece?",
        ),
        ai_context=(
            "Teach the student to notice loose material and defender removal. "
            "Do not turn this into a generic tactics lecture."
        ),
        practice_prompt="Find the move that keeps your material defended or wins the loose piece.",
        min_move=4,
        max_move=28,
        priority=60,
    ),
    "opponent_threats": LessonDefinition(
        id="opponent_threats",
        category="ignored_threat",
        title="Answer the opponent's threat",
        report_title="Answer the opponent's idea first.",
        summary=(
            "Several positions were less about your plan and more about the opponent's last move. "
            "Your first job is to name their threat."
        ),
        habit=(
            "What did their last move attack?",
            "What happens if I pass?",
            "Does my move actually answer it?",
        ),
        ai_context=(
            "Teach the student to read the opponent's last move before starting their own plan."
        ),
        practice_prompt="Name the opponent's threat, then find the move that answers it.",
        min_move=4,
        max_move=30,
        priority=50,
    ),
    "forcing_moves": LessonDefinition(
        id="forcing_moves",
        category="missed_tactic",
        title="Forcing moves before quiet moves",
        report_title="Check forcing moves before quiet moves.",
        summary=(
            "The clearest missed chances came from positions where checks, captures, or direct threats "
            "deserved attention before a quiet move."
        ),
        habit=(
            "List checks.",
            "List captures.",
            "List direct threats before choosing a quiet move.",
        ),
        ai_context=(
            "Teach the checks-captures-threats habit using the verified better move."
        ),
        practice_prompt="Look for checks, captures, and threats before revealing the better move.",
        min_move=6,
        max_move=30,
        priority=45,
    ),
    "complete_development": LessonDefinition(
        id="complete_development",
        category="didnt_develop",
        title="Complete development",
        report_title="Bring the rest of your pieces into the game.",
        summary=(
            "Your opening positions sometimes moved ahead before enough pieces were helping. "
            "The lesson is not memorization; it is getting the whole army involved."
        ),
        habit=(
            "Which minor pieces are still home?",
            "Can I develop while answering the threat?",
            "Is my queen or flank pawn moving before my pieces?",
        ),
        ai_context="Teach development as piece activity, not opening memorization.",
        practice_prompt="Find the developing move that brings another piece into the game.",
        min_move=4,
        max_move=14,
        priority=35,
    ),
    "king_safety": LessonDefinition(
        id="king_safety",
        category="didnt_castle",
        title="Castle earlier / king safety",
        report_title="Resolve king safety earlier.",
        summary=(
            "The examples reached sharp positions while your king was still in the center. "
            "The lesson is to settle king safety before the center opens."
        ),
        habit=(
            "Can I castle now?",
            "If not, what makes castling possible?",
            "Is the center about to open?",
        ),
        ai_context="Teach castling and king safety as a practical defensive habit.",
        practice_prompt="Find the move that gets the king safe or makes castling possible.",
        min_move=6,
        max_move=14,
        priority=30,
    ),
    "quiet_move_job": LessonDefinition(
        id="quiet_move_job",
        category="aimless_move",
        title="Quiet moves need a job",
        report_title="Give quiet moves a job.",
        summary=(
            "The scan found quiet moves that did not clearly improve a piece, stop a threat, "
            "or create pressure. Make every quiet move earn its tempo."
        ),
        habit=(
            "What piece improves?",
            "What threat is stopped?",
            "What pressure is created?",
        ),
        ai_context="Teach purposeful quiet moves and avoid overclaiming tactics.",
        practice_prompt="Find the purposeful move: improve a piece, stop a threat, or create pressure.",
        min_move=12,
        max_move=30,
        priority=20,
    ),
}

CATEGORY_TO_LESSON_ID = {lesson.category: lesson.id for lesson in LESSONS.values()}


def lesson_for_category(category: str) -> LessonDefinition | None:
    lesson_id = CATEGORY_TO_LESSON_ID.get(category)
    if lesson_id is None:
        return None
    return LESSONS[lesson_id]


def lesson_payload(lesson: LessonDefinition) -> dict:
    return {
        "id": lesson.id,
        "category": lesson.category,
        "title": lesson.title,
        "report_title": lesson.report_title,
        "summary": lesson.summary,
        "habit": list(lesson.habit),
        "ai_context": lesson.ai_context,
        "practice_prompt": lesson.practice_prompt,
    }
