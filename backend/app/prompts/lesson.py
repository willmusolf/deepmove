"""lesson.py — Lesson prompt builder
Constructs the full LLM prompt from pre-verified feature data.
The LLM receives structured facts, never raw positions.
"""


def build_lesson_prompt(req: dict) -> str:
    confidence = req.get("confidence", 0)
    elo = req.get("user_elo", 1200)
    time_control = req.get("time_control_label", "rapid")
    move_number = req.get("move_number", "?")
    move_played = req.get("move_played", "?")
    eval_swing = req.get("eval_swing_cp", 0)
    principle_name = req.get("principle_name", "")
    verified_facts = req.get("verified_facts", [])
    engine_idea = req.get("engine_move_idea", "")
    game_phase = req.get("game_phase", "middlegame")

    facts_block = "\n".join(f"- {fact}" for fact in verified_facts)

    if confidence >= 70:
        return f"""STUDENT: {elo}-rated, {time_control} game.

VERIFIED DATA (all facts confirmed by our analysis engine):
- Move {move_number} of the {game_phase}
- User played: {move_played}
- Eval swing: {eval_swing} centipawns against the student
- Engine's main idea: {engine_idea}
{facts_block}
- Classifier confidence: {confidence}% → {principle_name}

FORMAT (follow exactly, no deviations):
Step 1: Identify the moment (1 sentence)
Step 2: Highlight the issue (1 sentence)
Step 3: Name the principle (1-2 sentences)
Step 4: Give a concrete rule (1 sentence, memorable)
Step 5: Show what's better and why (1-2 sentences)

Total: 6-8 sentences maximum. Be direct. Talk like a chess club coach."""
    else:
        # Low confidence — describe what changed without asserting a principle
        return f"""STUDENT: {elo}-rated, {time_control} game.

VERIFIED DATA:
- Move {move_number} of the {game_phase}
- User played: {move_played}
- Eval swing: {eval_swing} centipawns against the student
{facts_block}

The analysis isn't certain which principle applies here. Describe what changed in the
position in simple terms without naming a specific principle. Be honest: "this position
got worse because..." is better than confidently teaching the wrong concept.

Maximum 4 sentences. Direct and honest."""
