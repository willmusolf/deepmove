#!/usr/bin/env python3
"""
DeepMove Daily Slideshow Generator
Generates TikTok/Instagram slideshow images for manual posting.

Usage:
    python scripts/slideshow_generator.py

Output:
    scripts/output/slideshows/YYYY-MM-DD/
        slide_01.png ... slide_N.png
        caption.txt

Cron (run daily at 8am):
    0 8 * * * cd ~/deepmove-dev && python scripts/slideshow_generator.py
"""

import os
import sys
import json
import textwrap
import datetime
import urllib.request
from pathlib import Path

# ── deps ──────────────────────────────────────────────────────────────────────
try:
    import anthropic
except ImportError:
    sys.exit("Missing: pip install anthropic")

try:
    import openai
except ImportError:
    sys.exit("Missing: pip install openai")

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Missing: pip install Pillow")

try:
    from dotenv import load_dotenv
except ImportError:
    sys.exit("Missing: pip install python-dotenv")

# ── config ────────────────────────────────────────────────────────────────────
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not ANTHROPIC_API_KEY:
    sys.exit("Missing ANTHROPIC_API_KEY in .env")
if not OPENAI_API_KEY:
    sys.exit("Missing OPENAI_API_KEY in .env")

SLIDE_W, SLIDE_H = 1080, 1080          # square for Instagram / TikTok cover
FONT_DIR = Path(__file__).parent / "assets" / "fonts"
LOGO_PATH = Path(__file__).parent / "assets" / "logo.png"
OUTPUT_BASE = Path(__file__).parent / "output" / "slideshows"

BRAND_COLOR = (99, 102, 241)           # indigo-500 — matches DeepMove UI
ACCENT_COLOR = (255, 255, 255)
OVERLAY_ALPHA = 180                    # darkens background so text pops

# ── feature pitches (rotates daily) ──────────────────────────────────────────
PITCHES = [
    {
        "id": "free_game_review",
        "name": "Free Game Review",
        "hook": "Your games. Your mistakes. Taught back to you.",
        "description": (
            "DeepMove gives you a free, interactive game review board — "
            "eval bar, move grades, best lines — plus AI coaching that "
            "explains the CONCEPTS behind your mistakes, not just engine lines."
        ),
        "cta": "Try it free at deepmove.io",
        "dalle_style": (
            "A sleek, modern chess interface on a dark screen showing a chess board "
            "with evaluation bars and colored move annotations. Clean UI, professional, "
            "dark theme with subtle purple/indigo accents. No text in the image."
        ),
    },
    {
        "id": "analysis_board",
        "name": "Analysis Board",
        "hook": "Free chess analysis. Sleek. Fast. Smart.",
        "description": (
            "Lichess-quality analysis — completely free, no account needed. "
            "Stockfish runs in your browser for instant, private analysis. "
            "Eval graph, best lines, and move grades on every game you import."
        ),
        "cta": "Analyze your games free at deepmove.io",
        "dalle_style": (
            "A beautiful chess analysis board with an evaluation graph below it, "
            "showing colored move quality indicators. Dark theme, modern interface, "
            "professional chess software look. No text in the image."
        ),
    },
    {
        "id": "ai_coach",
        "name": "AI Chess Coach",
        "hook": "Not 'Rd1 is better.' WHY your rook belongs there.",
        "description": (
            "Every chess app tells you WHAT to play. DeepMove teaches you WHY. "
            "Our AI coach identifies the 2-3 moments in your game where a concept "
            "went wrong — and explains the principle behind it in plain language."
        ),
        "cta": "Get coached free at deepmove.io",
        "dalle_style": (
            "An AI chess coaching panel alongside a chess board showing a highlighted "
            "critical moment. The coaching panel has clean typography with a lesson card. "
            "Dark theme, professional, modern UI. No text in the image."
        ),
    },
    {
        "id": "move_grading",
        "name": "Move Grading",
        "hook": "Every move graded. Instantly. Like Chess.com — but free.",
        "description": (
            "Best move, excellent, good, inaccuracy, mistake, blunder — "
            "every single move in your game gets graded by Stockfish. "
            "See your accuracy score and find exactly where things went wrong."
        ),
        "cta": "Grade your games free at deepmove.io",
        "dalle_style": (
            "A chess board with colored move grade indicators — green for best moves, "
            "yellow for inaccuracies, red for blunders. Clean accuracy percentage display. "
            "Dark theme, polished UI. No text in the image."
        ),
    },
    {
        "id": "tactics_trainer",
        "name": "Tactics Trainer (Premium)",
        "hook": "Your missed forks, served back as puzzles.",
        "description": (
            "DeepMove Premium finds every tactic you missed across your last 50 games "
            "and builds a personal puzzle set from them. Spaced repetition until "
            "you stop making the same mistakes. Nobody else does this."
        ),
        "cta": "Try Premium at deepmove.io — $5/mo",
        "dalle_style": (
            "A chess puzzle interface showing a tactical position with a highlighted "
            "knight fork opportunity. Puzzle-style board with 'Your turn' indicator. "
            "Dark theme, clean UI with puzzle statistics. No text in the image."
        ),
    },
    {
        "id": "play_vs_bot",
        "name": "Play vs Bot",
        "hook": "Practice against any Elo. Then review with AI coaching.",
        "description": (
            "Play against a bot at exactly your level — any Elo from 500 to 3000. "
            "When you lose, hit 'Review' and get the full coaching breakdown: "
            "what went wrong and what principle to fix next."
        ),
        "cta": "Play and improve free at deepmove.io",
        "dalle_style": (
            "A chess game in progress against a computer opponent, showing a player's "
            "perspective with a clock, move list, and clean board. Dark theme, "
            "modern chess app UI. No text in the image."
        ),
    },
]


# ── Claude: generate slide copy ───────────────────────────────────────────────
def generate_slide_copy(pitch: dict) -> dict:
    """Ask Claude to write 6-8 slide texts + a post caption for this pitch."""
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    prompt = f"""You are writing copy for a TikTok/Instagram slideshow promoting DeepMove, a free AI chess coaching web app.

FEATURE TO PROMOTE: {pitch['name']}
HOOK (slide 1): {pitch['hook']}
DESCRIPTION: {pitch['description']}
CTA (last slide): {pitch['cta']}

Write 6-8 slides. Return ONLY valid JSON in this exact format:
{{
  "slides": [
    {{"title": "short punchy title (max 8 words)", "body": "1-2 sentences of copy (max 25 words)"}},
    ...
  ],
  "caption": "Instagram/TikTok post caption (2-3 sentences, casual tone, include relevant hashtags)"
}}

Rules:
- Slide 1 title = the hook exactly: "{pitch['hook']}"
- Slide 1 body: set the pain point or promise
- Middle slides: each highlights one concrete benefit or feature detail
- Second-to-last slide: social proof angle ("free", "no account needed", compare to Chess.com/Lichess)
- Last slide title: call to action, last slide body: "{pitch['cta']}"
- Tone: direct, confident, slightly punchy — not corporate, not cringe
- No emojis in slide text. Emojis ok in caption."""

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    # strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


# ── DALL-E 3: generate background image ──────────────────────────────────────
def generate_background(dalle_style: str, slide_index: int, total: int) -> Image.Image:
    """Generate a 1024x1024 background via DALL-E 3, return as PIL Image."""
    oai = openai.OpenAI(api_key=OPENAI_API_KEY)

    # vary the prompt slightly for visual variety across slides
    variation = ""
    if slide_index == 0:
        variation = "Wide establishing shot, full composition."
    elif slide_index == total - 1:
        variation = "Clean, minimal — focus on the call-to-action energy."
    else:
        variation = f"Detail shot, variation {slide_index}."

    full_prompt = f"{dalle_style} {variation} Cinematic lighting, 4K quality."

    response = oai.images.generate(
        model="dall-e-3",
        prompt=full_prompt,
        size="1024x1024",
        quality="standard",
        n=1,
    )

    url = response.data[0].url
    with urllib.request.urlopen(url) as resp:
        img_data = resp.read()

    import io
    img = Image.open(io.BytesIO(img_data)).convert("RGBA")
    return img.resize((SLIDE_W, SLIDE_H), Image.LANCZOS)


# ── font loading ──────────────────────────────────────────────────────────────
def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """Load Inter or fall back to default."""
    candidates = [
        FONT_DIR / ("Inter-Bold.ttf" if bold else "Inter-Regular.ttf"),
        FONT_DIR / ("Inter-Bold.otf" if bold else "Inter-Regular.otf"),
        Path("/System/Library/Fonts/Helvetica.ttc"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
             else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for p in candidates:
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size)
            except Exception:
                continue
    return ImageFont.load_default()


# ── compositing ───────────────────────────────────────────────────────────────
def composite_slide(
    bg: Image.Image,
    title: str,
    body: str,
    slide_num: int,
    total: int,
    pitch_name: str,
) -> Image.Image:
    """Overlay title, body, branding onto background. Returns final image."""
    result = bg.copy().convert("RGBA")

    # dark gradient overlay so text is always readable
    overlay = Image.new("RGBA", (SLIDE_W, SLIDE_H), (0, 0, 0, 0))
    draw_ov = ImageDraw.Draw(overlay)
    # bottom 60% of image — gradient from transparent to dark
    for y in range(SLIDE_H // 2, SLIDE_H):
        alpha = int(OVERLAY_ALPHA * (y - SLIDE_H // 2) / (SLIDE_H // 2))
        draw_ov.line([(0, y), (SLIDE_W, y)], fill=(10, 10, 20, alpha))
    result = Image.alpha_composite(result, overlay)

    # top left brand bar
    brand_bar = Image.new("RGBA", (SLIDE_W, 60), (*BRAND_COLOR, 220))
    result.alpha_composite(brand_bar, (0, 0))

    draw = ImageDraw.Draw(result)

    # brand name in top bar
    font_brand = load_font(26, bold=True)
    draw.text((24, 16), "DeepMove", font=font_brand, fill=(255, 255, 255, 255))

    # slide counter top right
    font_counter = load_font(20)
    counter_text = f"{slide_num}/{total}"
    draw.text((SLIDE_W - 70, 20), counter_text, font=font_counter, fill=(220, 220, 220, 200))

    # title text — large, bold
    font_title = load_font(58, bold=True)
    margin = 48
    max_title_w = SLIDE_W - margin * 2
    wrapped_title = _wrap_text(title, font_title, max_title_w)
    title_y = SLIDE_H - 340
    draw.text((margin, title_y), wrapped_title, font=font_title, fill=(255, 255, 255, 255))

    # body text — smaller, regular
    font_body = load_font(34)
    title_bbox = draw.textbbox((margin, title_y), wrapped_title, font=font_title)
    body_y = title_bbox[3] + 20
    wrapped_body = _wrap_text(body, font_body, max_title_w)
    draw.text((margin, body_y), wrapped_body, font=font_body, fill=(210, 210, 220, 230))

    # bottom accent bar with feature tag
    accent_bar = Image.new("RGBA", (SLIDE_W, 50), (*BRAND_COLOR, 180))
    result.alpha_composite(accent_bar, (0, SLIDE_H - 50))
    font_tag = load_font(22)
    draw2 = ImageDraw.Draw(result)
    draw2.text((24, SLIDE_H - 36), pitch_name.upper(), font=font_tag, fill=(200, 200, 255, 200))

    # logo watermark (if exists)
    if LOGO_PATH.exists():
        try:
            logo = Image.open(LOGO_PATH).convert("RGBA")
            logo_size = 48
            logo = logo.resize((logo_size, logo_size), Image.LANCZOS)
            result.alpha_composite(logo, (SLIDE_W - logo_size - 16, SLIDE_H - logo_size - 16 - 50))
        except Exception:
            pass

    return result.convert("RGB")


def _wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int) -> str:
    """Word-wrap text to fit within max_width pixels."""
    words = text.split()
    lines = []
    current = []
    # create a temporary draw surface to measure text
    tmp = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    for word in words:
        test = " ".join(current + [word])
        bbox = tmp.textbbox((0, 0), test, font=font)
        if bbox[2] > max_width and current:
            lines.append(" ".join(current))
            current = [word]
        else:
            current.append(word)
    if current:
        lines.append(" ".join(current))
    return "\n".join(lines)


# ── main ──────────────────────────────────────────────────────────────────────
def main():
    today = datetime.date.today()
    day_index = today.timetuple().tm_yday  # 1-365
    pitch = PITCHES[day_index % len(PITCHES)]

    out_dir = OUTPUT_BASE / today.isoformat()
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[DeepMove Slideshow] {today} — Pitch: {pitch['name']}")
    print("Generating slide copy with Claude...")

    copy_data = generate_slide_copy(pitch)
    slides = copy_data["slides"]
    caption = copy_data["caption"]
    total = len(slides)

    print(f"  {total} slides generated.")
    print("Generating backgrounds with DALL-E 3...")

    for i, slide in enumerate(slides):
        slide_num = i + 1
        print(f"  Slide {slide_num}/{total}: {slide['title'][:40]}...")

        bg = generate_background(pitch["dalle_style"], i, total)
        final = composite_slide(
            bg,
            title=slide["title"],
            body=slide["body"],
            slide_num=slide_num,
            total=total,
            pitch_name=pitch["name"],
        )

        out_path = out_dir / f"slide_{slide_num:02d}.png"
        final.save(out_path, "PNG", optimize=True)
        print(f"    Saved: {out_path.name}")

    # write caption
    caption_path = out_dir / "caption.txt"
    caption_path.write_text(caption, encoding="utf-8")
    print(f"\nCaption saved: caption.txt")
    print(f"\nDone! Check: {out_dir}")
    print(f"\n--- POST CAPTION PREVIEW ---\n{caption}\n")


if __name__ == "__main__":
    main()
