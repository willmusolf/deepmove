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
    principle_description = req.get("principle_description", "")
    principle_takeaway = req.get("principle_takeaway", "")
    verified_facts = req.get("verified_facts", [])
    engine_idea = req.get("engine_move_idea", "")
    game_phase = req.get("game_phase", "middlegame")

    facts_block = "\n".join(f"- {fact}" for fact in verified_facts)

    if confidence >= 70:
        principle_block = f"- Principle to teach: {principle_name}"
        if principle_description:
            principle_block += f"\n- What this principle means: {principle_description}"
        if principle_takeaway:
            principle_block += f'\n- Rule for the student to leave with: "{principle_takeaway}"'

        step4_instruction = f'Give ONE rule the student can use in their next game (1 sentence — use or rephrase: "{principle_takeaway}")' if principle_takeaway else 'Give ONE concrete rule (1 sentence, memorable)'

        return f"""STUDENT: {elo}-rated, {time_control} game.

WHAT WENT WRONG (verified by engine and position analysis):
- Move {move_number} of the {game_phase}
- User played: {move_played}
- Position worsened by {eval_swing} centipawns
{facts_block}
- Better approach: {engine_idea}

WHAT TO TEACH:
{principle_block}
- Classifier confidence: {confidence}%

FORMAT (follow exactly — no extra sections, no deviations):
Step 1: Name the move and what happened (1 sentence — reference the specific move)
Step 2: Point at the concrete problem in THIS position (1 sentence — use a specific fact from above, not a general statement)
Step 3: State the principle in plain language (1-2 sentences — anchor to the definition above)
Step 4: {step4_instruction}
Step 5: Show what better looks like and why it matters in this position (1-2 sentences)

Total: 6-8 sentences. Be specific to THIS game and THIS move.
Never say "this is an example of..." — say what matters directly."""

    else:
        # Low confidence — describe what changed without asserting a principle
        return f"""STUDENT: {elo}-rated, {time_control} game.

VERIFIED DATA:
- Move {move_number} of the {game_phase}
- User played: {move_played}
- Position dropped {eval_swing} centipawns
{facts_block}

The analysis detected a problem but isn't certain which principle explains it best.
Describe what concretely got worse using the facts above. Be honest and specific.
Do NOT name a principle or assert chess theory confidently.
If there is one actionable reminder, give it.

4 sentences maximum."""
