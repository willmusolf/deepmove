"""socratic.py — Think First mode prompt templates
Generates Socratic questions and blunder check checklists.
Sub-1400: blunder check checklist (3 questions)
1400+: single Socratic question about the position
"""


def build_blunder_check_prompt(req: dict) -> str:
    """For sub-1400 players at critical moments involving hanging pieces or ignored threats."""
    move_played = req.get("move_played", "?")
    opponent_threat = req.get("opponent_threat_description", "")

    return f"""STUDENT: {req.get('user_elo', 1200)}-rated. They just played {move_played}.

Generate the blunder check checklist for this position. Ask these 3 questions in order:
1. "What was your opponent threatening after their last move?"
2. "After your move, are any of your pieces undefended?"
3. "What changed on the board?"

Context for the reveal (after student responds):
{opponent_threat}

Be warm but direct. This is training a HABIT, not just teaching knowledge."""


def build_socratic_prompt(req: dict) -> str:
    """For 1400+ players — a single Socratic question about the position."""
    move_played = req.get("move_played", "?")
    principle_name = req.get("principle_name", "")
    verified_facts = req.get("verified_facts", [])
    facts_block = "\n".join(f"- {fact}" for fact in verified_facts)

    return f"""STUDENT: {req.get('user_elo', 1500)}-rated. They played {move_played}.

Verified facts about the position:
{facts_block}

The principle at stake: {principle_name}

Ask ONE question that leads the student to discover this principle themselves.
Don't give hints in the question. Don't reveal the answer. One question, maximum 2 sentences."""
