# DeepMove Marketing, Launch & Monetization

Extracted from TODO.md.

---

## Monetization Model

### Free Tier (the viral engine)
- Unlimited Stockfish analysis — client-side, $0 cost
- Move grades, accuracy scores, eval bar, eval graph — all client-side, $0
- 1 AI coaching lesson per week — picks the worst moment from whichever game they review
  - Full Sonnet-quality lesson to maximize wow factor
  - After the free lesson: "DeepMove found 2 more coaching moments. Upgrade to unlock all coaching."
  - Rest of the week: analysis-only with "upgrade for coaching" prompts on critical moments
- 1 small tasteful ad banner (Carbon Ads / EthicalAds) — bottom of page, never intrusive

### Premium ($5/mo or $40/year)
- All coaching moments unlocked (unlimited games)
- Deep Game Scan: bulk analyze last 50–100 games → recurring weakness report
- Tactics Trainer: puzzles from YOUR missed tactics + Lichess puzzles, spaced repetition
- Improvement tracking dashboard (weakness trends over time)
- Weekly coaching digest email
- Lesson history & bookmarking
- No ads
- Sonnet-quality lessons always (free tier falls back to Haiku if costs spike)

**Why subscription, not one-time:** Tactics trainer + tracking get better the more you play. Ongoing value = justified recurring charge.

---

## Cost & Revenue Projections

| Scale | MAU | LLM cost/mo | Hosting | Total cost | Premium (3%) | Ad rev | Total rev | Profit |
|-------|-----|-------------|---------|------------|--------------|--------|-----------|--------|
| Launch | 1K | ~$30 | $25 | **$55** | $150 | $50 | $200 | +$145 |
| Growth | 10K | ~$300 | $50 | **$350** | $1,500 | $500 | $2,000 | +$1,650 |
| Traction | 50K | ~$1,500 | $100 | **$1,600** | $7,500 | $2,500 | $10,000 | +$8,400 |
| Scale | 300K | ~$9,000 | $300 | **$9,300** | $45,000 | $10,000 | $55,000 | +$45,700 |

**Key facts:**
- Stockfish runs client-side = $0 server cost for analysis (competitors pay for this)
- Break-even: ~70 premium subscribers (~2,300 MAU at 3% conversion)
- Model routing: Haiku ($0.005/lesson) for free tier, Sonnet ($0.02/lesson) for premium

---

## Positioning & Messaging

- **Primary tagline:** "Every chess app tells you WHAT to play. DeepMove teaches you WHY."
- **Analysis tagline:** "Free chess analysis. Sleek. Fast. Smart."
- **Core pitch (coaching):** "Free game analysis with AI coaching that teaches chess principles from your own games."
- **Core pitch (analysis):** "Lichess-quality analysis, free, no account needed — plus AI coaching on your worst moments."
- **vs Chessigma:** They show analysis. We teach concepts. Their Supercoach is vaporware; our pipeline is built.
- **vs Chess.com:** Free, 1 tasteful ad, coaching teaches principles not engine lines.
- **vs Lichess:** Same free analysis quality, but with AI coaching layered on top.
- **NEVER** say "Chess.com alternative" — Lichess fans will attack.
- **DO** say "for all chess players" — support both platforms, respect both communities.

---

## Launch Sequence

- [ ] Soft launch in chess Discord servers for beta feedback
- [ ] r/chess post (expect removal — doesn't matter, gets picked up externally)
- [ ] r/chessbeginners post (friendlier audience, our core 1000–1400 demographic)
- [ ] Chess.com forums post
- [ ] Lichess forums post — "for all chess players" NOT "Chess.com alternative"
- [ ] Product Hunt launch
- [ ] Hacker News "Show HN" post

---

## Short-Form Video Strategy

**Seed content (make ourselves) — YouTube Shorts, TikTok, Instagram Reels:**
- "DeepMove roasted my chess game" — screen record coaching moments, relatable
- "I found my biggest weakness" — Deep Scan finding recurring patterns, aspirational
- "This free app taught me more than Chess.com Premium" — direct comparison, spicy
- Build-in-public content — showing development, design decisions

**Daily TikTok/Instagram slideshows:**
- Run: `python scripts/slideshow_generator.py`
- Output: `scripts/output/slideshows/YYYY-MM-DD/` — PNGs + caption.txt
- Rotates through 6 feature pitches: game review, analysis board, AI coach, move grading, tactics trainer, play vs bot
- Requires `OPENAI_API_KEY` in `.env`
- Cron (8am daily): `0 8 * * * cd ~/deepmove-dev && python scripts/slideshow_generator.py`

**Note:** Chessigma's 3 mostly-dormant YouTube videos got 8K+ views with zero promotion. A random YouTuber finding the Reddit post drove 100K visitors in week 1.

---

## Shareable Features to Build

- [ ] Shareable lesson cards — OG image with coaching moment summary for social posts
- [ ] "Share my coaching report" — public URL showing game highlights + coaching
- [ ] Social meta tags (OG image, Twitter card) on all shared links
- [ ] "Can you find the right move?" — shareable puzzle card from coaching moments

---

## SEO Strategy

- [ ] Blog targeting chess improvement searches:
  - "how to stop blundering in chess"
  - "free chess game analysis"
  - "chess improvement plan for beginners"
  - "how to analyze your chess games"
  - "best free chess coaching app"
- [ ] Each blog post funnels to the tool (search → blog → try tool → convert)
- [ ] Translate blog posts into all supported languages (multiplier effect)
- [ ] Technical SEO: fast Vite build, proper meta tags, sitemap.xml, robots.txt

---

## Community (Day 1)

- [ ] Discord server — feedback, beta testing, engagement, translation help
- [ ] Chess.com club ("DeepMove — Free AI Chess Coaching")
- [ ] Lichess team
- [ ] r/deepmove subreddit (own the namespace)

---

## i18n (8–10 Languages, Pre-Launch)

- [ ] Install react-i18next framework
- [ ] Extract all UI strings to translation JSON files
- [ ] Target languages: EN, ES, PT, FR, DE, RU, Hindi, Chinese (Simplified), Arabic, Turkish
- [ ] Beat Chessigma's 6-language coverage (they're missing Hindi, Chinese, Arabic, Turkish)
- [ ] Use Claude API for initial translations; native speaker review via Discord community
- [ ] SEO: each language gets own URL path (/es/, /hi/, /ru/) for Google indexing
- [ ] Research which languages Chessigma does NOT support → prioritize those

---

## Tactics Trainer as Premium Anchor (Marketing Role)

- **The flywheel:** more games → more missed tactics → bigger personal puzzle set → more sub value → user stays subscribed
- **Nobody else does this** — Lichess puzzles are random, Chess.com puzzles are curated, DeepMove puzzles are YOURS
- **Deep Game Scan + Tactics Trainer = the premium selling point**
  - Scan 100 games → extract every missed fork/pin/skewer → build 50–200 personal puzzles
  - Spaced repetition until you stop making those specific mistakes
- **Shareable content:** "DeepMove showed me I've been missing knight forks for 6 months" — video writes itself
