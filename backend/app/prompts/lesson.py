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
        tone_hint = (
            "This is a beginner. Use simple, concrete words. "
            "No chess jargon without explanation. Short sentences. "
            "Focus on one physical action they can do next game."
        )
    elif elo < 1200:
        tone_hint = (
            "This player is learning fundamentals. Be concrete with beginning "
            "conceptual framing. Explain chess terms when you use them."
        )
    elif elo < 1400:
        tone_hint = (
            "This player understands basics but struggles with 'what to do next.' "
            "Be conceptual but accessible. Connect the principle to their position."
        )
    elif elo < 1600:
        tone_hint = (
            "This player has strategic awareness. You can use standard chess "
            "concepts (piece activity, prophylaxis) but always tie to THIS position."
        )
    else:
        tone_hint = (
            "This is an experienced player. Be nuanced. Focus on the subtle "
            "positional or strategic error, not basic concepts."
        )

    # Time control awareness
    tc_hint = ""
    if time_control in ("bullet", "blitz"):
        tc_hint = (
            "This was a fast game — acknowledge that time pressure makes "
            "this kind of error more common, but the habit still matters."
        )
    elif time_control == "classical":
        tc_hint = (
            "This was a slow game — the student had time to think here, "
            "so this represents a genuine gap in their process."
        )

    # Think First: blunder checklist for TACTICAL_01 / TACTICAL_02
    is_tactical = principle_id in ("TACTICAL_01", "TACTICAL_02")
    checklist_block = ""
    if is_tactical and confidence >= 70:
        checklist_block = """
THINK FIRST CHECKLIST (include this BEFORE the 5-step lesson, separated by a blank line):
Write exactly 3 short questions the student should have asked themselves before making their move:
1. "What was your opponent threatening after their last move?"
2. "After your move, are any of your pieces undefended?"
3. "What changed on the board?"
Then write: "Let's see what happened..."
Then proceed with the 5-step lesson below.
"""

    if confidence >= 70:
        principle_block = f"- Principle to teach: {principle_name}"
        if principle_description:
            principle_block += f"\n- What this principle means: {principle_description}"
        if principle_takeaway:
            principle_block += (
                f'\n- Rule for the student to leave with: "{principle_takeaway}"'
            )

        step4_instruction = (
            f'Give ONE rule the student can use in their next game '
            f'(1 sentence — use or rephrase: "{principle_takeaway}")'
            if principle_takeaway
            else "Give ONE concrete rule (1 sentence, memorable)"
        )

        urgency = ""
        if eval_swing >= 300:
            urgency = (
                "- This was a BIG mistake. Be direct and urgent — "
                '"This is the one habit that will gain you 200 rating points."'
            )
        elif eval_swing >= 150:
            urgency = "- Significant error. Be clear and constructive."
        else:
            urgency = (
                "- Subtle error. Be curious and teaching: "
                '"Here\'s something interesting about this position..."'
            )

        return f"""STUDENT: {elo}-rated, {time_control} game, playing as {color}.
{tone_hint}
{tc_hint}

WHAT WENT WRONG (all facts verified by engine and position analysis):
- Move {move_number} of the {game_phase}
- User played: {move_played}
- Position worsened by {eval_swing} centipawns
{facts_block}
- Better approach: {engine_idea}
{urgency}

WHAT TO TEACH:
{principle_block}
- Classifier confidence: {confidence}%
{checklist_block}
FORMAT (follow EXACTLY — no extra sections, no preamble, no deviations):
Step 1: Name the move and moment (1 sentence — "On move {move_number}, you played {move_played}." then say what was happening in the game)
Step 2: Point at the concrete problem (1 sentence — use a SPECIFIC fact from above, not a general statement. Say what went wrong in plain English)
Step 3: Name the principle (1-2 sentences — state the principle name, then explain WHY it applies to THIS specific position using facts from above)
Step 4: {step4_instruction}
Step 5: Show what better looks like (1-2 sentences — describe the IDEA behind the better approach conceptually, never just a move. "Your bishop needed the long diagonal" not "Bg2 was better")

HARD RULES:
- Total: 6-8 sentences. No more.
- Never say "the engine suggests", "Stockfish recommends", "the analysis shows", or "this is an example of..."
- Never give the exact engine move as "the answer." Teach the CONCEPT.
- Use "you" — speak directly to the student about THEIR game.
- When using notation (like Bg2 or Rd1), immediately explain in words (like "moving the bishop to the long diagonal" or "placing the rook on the open file").
- End on a forward-looking note — the student should feel they learned something useful."""

    else:
        # Low confidence — describe what changed without asserting a principle
        return f"""STUDENT: {elo}-rated, {time_control} game, playing as {color}.
{tone_hint}

VERIFIED DATA:
- Move {move_number} of the {game_phase}
- User played: {move_played}
- Position dropped {eval_swing} centipawns
{facts_block}

The analysis detected a problem but isn't certain which principle explains it best.
Describe what concretely got worse in THIS position using the facts above.
Be honest, specific, and direct. Do NOT name a principle or assert chess theory confidently.
If there is one actionable reminder the student can use next game, give it.

4 sentences maximum. Never say "the engine suggests" or "Stockfish recommends."
Use "you" — make it personal."""
