"""lesson.py — Lesson prompt builder
Constructs the LLM prompt from deterministic coaching facts.
"""


def build_lesson_prompt(req: dict) -> str:
    elo = req.get("user_elo", 1200)
    time_control = req.get("time_control_label", "rapid")
    move_number = req.get("move_number", "?")
    move_played = req.get("move_played", "?")
    eval_swing = req.get("eval_swing_cp", 0)
    verified_facts = req.get("verified_facts", [])
    engine_idea = req.get("engine_move_idea", "")
    game_phase = req.get("game_phase", "middlegame")
    color = req.get("color", "white")
    category = req.get("category", "unknown")
    mistake_type = req.get("mistake_type", "strategic")

    facts_block = "\n".join(f"- {fact}" for fact in verified_facts)

    if elo < 1000:
        tone_hint = "Use plain language. Name the concrete problem fast."
    elif elo < 1400:
        tone_hint = "Be blunt and simple. Tie the lesson to one habit."
    elif elo < 1800:
        tone_hint = "Be direct. Use normal chess vocabulary, but stay concise."
    else:
        tone_hint = "Be terse and technical. No beginner filler."

    if eval_swing >= 300:
        urgency = "This was a major mistake. Sound firm."
    elif eval_swing >= 150:
        urgency = "This was a real mistake. Sound clear and direct."
    else:
        urgency = "This was smaller. Still be concise and concrete."

    time_hint = ""
    if time_control in ("bullet", "blitz"):
        time_hint = "Fast game: mention the habit without excusing the mistake."
    elif time_control == "classical":
        time_hint = "Slow game: you may call out that there was time to find the right idea."

    return f"""STUDENT CONTEXT:
- {elo}-rated player
- {time_control} game
- playing {color}
- move {move_number} in the {game_phase}
- played {move_played}
- category: {category}
- mistake type: {mistake_type}
- eval swing: {eval_swing} centipawns

TONE:
- {tone_hint}
- {urgency}
{f"- {time_hint}" if time_hint else ""}

VERIFIED DATA:
{facts_block}
{f"- Better idea: {engine_idea}" if engine_idea else ""}

WRITE 2-4 SENTENCES.
Sentence 1 must say what went wrong.
Do not name an engine move unless VERIFIED DATA already contains it.
Do not hedge. Do not moralize. Do not add extra concepts.
Last sentence must give one rule for the student's next game."""
