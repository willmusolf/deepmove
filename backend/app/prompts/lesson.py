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
    color = req.get("color", "white")
    principle_id = req.get("principle_id", "")

    facts_block = "\n".join(f"- {fact}" for fact in verified_facts)

    # Elo-calibrated language guidance
    if elo < 1000:
        tone_hint = "Beginner. Use plain words. No chess terms without explanation. One concrete action."
    elif elo < 1200:
        tone_hint = "Learning fundamentals. Concrete language, simple framing. Explain chess terms when used."
    elif elo < 1400:
        tone_hint = "Understands basics, struggles with planning. Conceptual but accessible."
    elif elo < 1600:
        tone_hint = "Has strategic awareness. Can use standard chess concepts tied to THIS position."
    else:
        tone_hint = "Experienced player. Focus on the subtle error — skip basic concepts."

    # Time control awareness
    tc_hint = ""
    if time_control in ("bullet", "blitz"):
        tc_hint = "Fast game — time pressure makes this kind of mistake more common. But the habit still matters."
    elif time_control == "classical":
        tc_hint = "Slow game — the student had time here. This is a genuine gap in thinking process."

    # Think First: blunder checklist for TACTICAL_01 / TACTICAL_02 at high confidence
    is_tactical = principle_id in ("TACTICAL_01", "TACTICAL_02")
    checklist_block = ""
    if is_tactical and confidence >= 70:
        checklist_block = (
            "\nBEFORE THE LESSON — include these three questions first, "
            "as a compact block the student should have asked themselves:\n"
            '1. "What was my opponent threatening after their last move?"\n'
            '2. "After my move, am I leaving anything undefended?"\n'
            '3. "What changed on the board?"\n'
            'Then write "Here\'s what happened:" and continue with the lesson.\n'
        )

    if confidence >= 70:
        principle_block = f"Principle: {principle_name}"
        if principle_description:
            principle_block += f"\nWhat it means: {principle_description}"
        if principle_takeaway:
            principle_block += f"\nRule to leave with: {principle_takeaway}"

        urgency = ""
        if eval_swing >= 300:
            urgency = "Big mistake. Be direct and blunt."
        elif eval_swing >= 150:
            urgency = "Significant error. Be clear and constructive."
        else:
            urgency = "Subtle error. Be curious and teaching."

        return f"""STUDENT: {elo}-rated, {time_control} game, playing as {color}.
{tone_hint}
{tc_hint}

VERIFIED DATA (all facts confirmed by engine and position analysis — only state what is here):
- Move {move_number} of the {game_phase}
- Player moved: {move_played}
- Position worsened by {eval_swing} centipawns
{facts_block}
- Better approach: {engine_idea}
{urgency}

WHAT TO TEACH:
{principle_block}
{checklist_block}
WRITE 4-6 SENTENCES OF DIRECT PROSE. No headers, no labels, no emojis.
Start by naming the move and what concretely went wrong.
Explain the pattern or habit that caused it.
End with one specific rule the student can use in their next game.

Critical: Only state facts from VERIFIED DATA above. Do not infer what the opponent did, what was captured, or what happened after the move unless it is explicitly stated in the data above."""

    else:
        # Low confidence — describe what changed without asserting a principle
        return f"""STUDENT: {elo}-rated, {time_control} game, playing as {color}.
{tone_hint}

VERIFIED DATA (only state what is here — do not infer anything beyond this list):
- Move {move_number} of the {game_phase}
- Player moved: {move_played}
- Position dropped {eval_swing} centipawns
{facts_block}

The analysis caught a problem here but isn't sure which principle explains it best.
Describe concretely what got worse in this position, using only the facts above.
If there's one actionable reminder the student can take to their next game, give it.
4 sentences maximum. No headers, no emojis, no labels. Direct prose only."""
