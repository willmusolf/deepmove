"""Account-wide broad scan and Training Plan report generation."""
from __future__ import annotations

import io
import json
import logging
import re
import time
from collections import Counter, defaultdict
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

import chess  # type: ignore[import-not-found]
import chess.pgn  # type: ignore[import-not-found]
import httpx
from sqlalchemy.orm import Session

from app.models.account_analysis import AccountReport, AnalysisJob
from app.models.game import Game
from app.models.user import User
from app.schemas.account_analysis import StartAnalysisRequest

logger = logging.getLogger(__name__)

ACTIVE_JOB_STATUSES = ("queued", "running")
JOB_STAGES = {
    "queued": 0,
    "fetching_games": 10,
    "scanning_metadata": 30,
    "analyzing_candidates": 60,
    "deep_reviewing_examples": 82,
    "saving_report": 94,
    "complete": 100,
    "failed": 100,
    "cancelled": 100,
}
CHESSCOM_HEADERS = {"User-Agent": "DeepMove/1.0 Chess Coaching App (contact: hello@deepmove.app)"}
SECONDS_PER_MONTH = 31 * 24 * 60 * 60


def _now() -> datetime:
    return datetime.now(UTC)


def _platforms_for_user(user: User, requested: Sequence[str] | None) -> list[str]:
    available: list[str] = []
    if user.chesscom_username:
        available.append("chesscom")
    if user.lichess_username:
        available.append("lichess")
    if requested:
        requested_set = set(requested)
        return [platform for platform in available if platform in requested_set]
    return available


def start_analysis_job(db: Session, user: User, body: StartAnalysisRequest) -> tuple[AnalysisJob, bool]:
    active = (
        db.query(AnalysisJob)
        .filter(AnalysisJob.user_id == user.id, AnalysisJob.status.in_(ACTIVE_JOB_STATUSES))
        .order_by(AnalysisJob.created_at.desc())
        .first()
    )
    if active:
        return active, True

    platforms = _platforms_for_user(user, body.platforms)
    job = AnalysisJob(
        user_id=user.id,
        status="queued",
        stage="queued",
        progress_pct=0,
        account_scope={
            "platforms": platforms,
            "chesscom_username": user.chesscom_username,
            "lichess_username": user.lichess_username,
        },
        filters={
            "max_games": body.max_games,
            "months": body.months,
            "min_initial_seconds": body.min_initial_seconds,
        },
        requested_game_ids=[],
        completed_game_ids=[],
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job, False


def latest_report(db: Session, user_id: int) -> AccountReport | None:
    return (
        db.query(AccountReport)
        .filter(AccountReport.user_id == user_id)
        .order_by(AccountReport.created_at.desc())
        .first()
    )


def latest_job(db: Session, user_id: int) -> AnalysisJob | None:
    return (
        db.query(AnalysisJob)
        .filter(AnalysisJob.user_id == user_id)
        .order_by(AnalysisJob.created_at.desc())
        .first()
    )


def cancel_job(db: Session, user_id: int, job_id: int) -> AnalysisJob | None:
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id, AnalysisJob.user_id == user_id).first()
    if not job:
        return None
    if job.status in ("queued", "running"):
        job.status = "cancelled"
        job.stage = "cancelled"
        job.progress_pct = 100
        job.finished_at = _now()
        db.commit()
        db.refresh(job)
    return job


def retry_job(db: Session, user_id: int, job_id: int) -> AnalysisJob | None:
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id, AnalysisJob.user_id == user_id).first()
    if not job:
        return None
    if job.status in ("failed", "cancelled"):
        job.status = "queued"
        job.stage = "queued"
        job.progress_pct = 0
        job.error = None
        job.report_id = None
        job.result = None
        job.started_at = None
        job.finished_at = None
        db.commit()
        db.refresh(job)
    return job


def claim_next_job(db: Session) -> AnalysisJob | None:
    query = (
        db.query(AnalysisJob)
        .filter(AnalysisJob.status == "queued")
        .order_by(AnalysisJob.created_at.asc())
    )
    try:
        query = query.with_for_update(skip_locked=True)
    except TypeError:
        query = query.with_for_update()
    job = query.first()
    if not job:
        return None
    job.status = "running"
    job.stage = "fetching_games"
    job.progress_pct = JOB_STAGES["fetching_games"]
    job.started_at = _now()
    job.error = None
    db.commit()
    db.refresh(job)
    return job


def run_next_job(db: Session) -> AnalysisJob | None:
    job = claim_next_job(db)
    if not job:
        return None
    run_job(db, job.id)
    return db.query(AnalysisJob).filter(AnalysisJob.id == job.id).first()


def run_job(db: Session, job_id: int) -> AnalysisJob:
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
    if job is None:
        raise RuntimeError(f"Analysis job {job_id} was not found")
    if job.status == "cancelled":
        return job

    try:
        user = db.query(User).filter(User.id == job.user_id).one()
        _set_stage(db, job, "fetching_games")
        games = _load_or_fetch_games(db, user, job)
        job.requested_game_ids = [str(game.platform_game_id or game.id) for game in games]
        db.commit()

        _set_stage(db, job, "scanning_metadata")
        eligible = _filter_eligible_games(games, job.filters)
        _set_stage(db, job, "analyzing_candidates")
        scan = build_training_plan_payload(eligible, job.filters)
        _set_stage(db, job, "deep_reviewing_examples")
        scan["review_moments"] = scan["review_moments"][:3]

        _set_stage(db, job, "saving_report")
        report = AccountReport(
            user_id=job.user_id,
            source_platforms=scan["source_platforms"],
            scanned_range=scan["scanned_range"],
            scan_summary=scan["scan_summary"],
            time_control_breakdown=scan["time_control_breakdown"],
            top_trends=scan["top_trends"],
            current_focus=scan["current_focus"],
            review_moments=scan["review_moments"],
            opening_context=scan["opening_context"],
            technical_evidence=scan["technical_evidence"],
        )
        db.add(report)
        db.flush()
        job.status = "complete"
        job.stage = "complete"
        job.progress_pct = 100
        job.result = {"report_id": report.id}
        job.report_id = report.id
        job.completed_game_ids = [str(game.platform_game_id or game.id) for game in eligible]
        job.finished_at = _now()
        db.commit()
        db.refresh(job)
        return job
    except Exception as exc:
        logger.exception("account analysis job failed", extra={"job_id": job_id})
        job.status = "failed"
        job.stage = "failed"
        job.progress_pct = 100
        job.error = str(exc)
        job.finished_at = _now()
        db.commit()
        db.refresh(job)
        return job


def _set_stage(db: Session, job: AnalysisJob, stage: str) -> None:
    db.refresh(job)
    if job.status == "cancelled":
        raise RuntimeError("Analysis job was cancelled")
    job.status = "running"
    job.stage = stage
    job.progress_pct = JOB_STAGES[stage]
    db.commit()
    db.refresh(job)


def _load_or_fetch_games(db: Session, user: User, job: AnalysisJob) -> list[Game]:
    platforms = set(job.account_scope.get("platforms") or [])
    max_games = int(job.filters.get("max_games") or 500)

    _fetch_linked_games(db, user, job)

    query = db.query(Game).filter(Game.user_id == user.id)
    if platforms:
        query = query.filter(Game.platform.in_(platforms))
    return query.order_by(Game.end_time.desc().nullslast()).limit(max_games * 2).all()


def _fetch_linked_games(db: Session, user: User, job: AnalysisJob) -> None:
    """Best-effort account import for the first-run scan.

    Stored games are still used if external APIs fail. This keeps jobs useful for
    accounts that synced locally before backend fetching is fully reliable.
    """
    platforms = set(job.account_scope.get("platforms") or [])
    filters = job.filters or {}
    max_games = int(filters.get("max_games") or 500)
    months = int(filters.get("months") or 12)
    since_seconds = int((_now() - timedelta(days=months * 31)).timestamp())

    if "chesscom" in platforms and user.chesscom_username:
        try:
            for payload in _fetch_chesscom_games(user.chesscom_username, months, max_games):
                _upsert_external_game(db, user.id, payload)
                time.sleep(0.2)
        except Exception as exc:
            logger.warning("chesscom fetch failed for account analysis: %s", exc)

    if "lichess" in platforms and user.lichess_username:
        try:
            for payload in _fetch_lichess_games(user.lichess_username, since_seconds, max_games):
                _upsert_external_game(db, user.id, payload)
        except Exception as exc:
            logger.warning("lichess fetch failed for account analysis: %s", exc)

    db.commit()


def _fetch_chesscom_games(username: str, months: int, limit: int) -> list[dict[str, Any]]:
    with httpx.Client(headers=CHESSCOM_HEADERS, timeout=20) as client:
        archives_res = client.get(f"https://api.chess.com/pub/player/{username}/games/archives")
        if archives_res.status_code == 429:
            raise RuntimeError("Chess.com rate limit reached")
        archives_res.raise_for_status()
        archives = archives_res.json().get("archives", [])
        selected = archives[-max(1, min(months + 1, len(archives))):]
        games: list[dict[str, Any]] = []
        for archive in reversed(selected):
            res = client.get(archive)
            if res.status_code == 429:
                raise RuntimeError("Chess.com rate limit reached")
            res.raise_for_status()
            games.extend(res.json().get("games", []))
            if len(games) >= limit:
                break
    normalized = [_normalize_chesscom_game(game, username) for game in games]
    return [game for game in normalized if game is not None][:limit]


def _fetch_lichess_games(username: str, since_seconds: int, limit: int) -> list[dict[str, Any]]:
    url = (
        f"https://lichess.org/api/games/user/{username}"
        f"?max={limit}&since={since_seconds * 1000}&pgnInJson=true&clocks=true&opening=true"
    )
    with httpx.Client(headers={"Accept": "application/x-ndjson"}, timeout=30) as client:
        res = client.get(url)
        res.raise_for_status()
    games = [json.loads(line) for line in res.text.splitlines() if line.strip()]
    normalized = [_normalize_lichess_game(game, username) for game in games]
    return [game for game in normalized if game is not None][:limit]


def _normalize_chesscom_game(game: dict[str, Any], username: str) -> dict[str, Any] | None:
    pgn = game.get("pgn")
    url = game.get("url")
    if not isinstance(pgn, str) or not isinstance(url, str):
        return None
    white = game.get("white") or {}
    black = game.get("black") or {}
    user_is_white = str(white.get("username", "")).lower() == username.lower()
    user_blob = white if user_is_white else black
    opponent_blob = black if user_is_white else white
    return {
        "platform": "chesscom",
        "platform_game_id": url,
        "pgn": pgn,
        "user_color": "white" if user_is_white else "black",
        "user_elo": user_blob.get("rating"),
        "opponent": opponent_blob.get("username"),
        "opponent_rating": opponent_blob.get("rating"),
        "result": _chesscom_result(user_blob.get("result")),
        "time_control": str(game.get("time_control") or ""),
        "end_time": int(game.get("end_time") or 0) * 1000,
    }


def _normalize_lichess_game(game: dict[str, Any], username: str) -> dict[str, Any] | None:
    pgn = game.get("pgn")
    game_id = game.get("id")
    if not isinstance(pgn, str) or not isinstance(game_id, str):
        return None
    players = game.get("players") or {}
    white = players.get("white") or {}
    black = players.get("black") or {}
    white_name = ((white.get("user") or {}).get("name") or "").lower()
    user_is_white = white_name == username.lower()
    user_blob = white if user_is_white else black
    opponent_blob = black if user_is_white else white
    winner = game.get("winner")
    result = "D"
    if winner == ("white" if user_is_white else "black"):
        result = "W"
    elif winner in ("white", "black"):
        result = "L"
    clock = game.get("clock") or {}
    initial = clock.get("initial")
    increment = clock.get("increment")
    time_control = f"{initial}+{increment}" if initial is not None else str(game.get("speed") or "")
    return {
        "platform": "lichess",
        "platform_game_id": f"lichess:{game_id}",
        "pgn": pgn,
        "user_color": "white" if user_is_white else "black",
        "user_elo": user_blob.get("rating"),
        "opponent": (opponent_blob.get("user") or {}).get("name"),
        "opponent_rating": opponent_blob.get("rating"),
        "result": result,
        "time_control": time_control,
        "end_time": int(game.get("lastMoveAt") or game.get("createdAt") or 0),
    }


def _upsert_external_game(db: Session, user_id: int, payload: dict[str, Any]) -> None:
    existing = (
        db.query(Game)
        .filter(Game.user_id == user_id, Game.platform_game_id == payload["platform_game_id"])
        .first()
    )
    if existing:
        for key, value in payload.items():
            setattr(existing, key, value)
        existing.synced_at = _now()
        return
    db.add(Game(user_id=user_id, **payload))


def _chesscom_result(result: Any) -> str:
    if result == "win":
        return "W"
    if result in ("agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"):
        return "D"
    return "L"


def _filter_eligible_games(games: list[Game], filters: dict[str, Any]) -> list[Game]:
    max_games = int(filters.get("max_games") or 500)
    months = int(filters.get("months") or 12)
    min_initial_seconds = int(filters.get("min_initial_seconds") or 300)
    cutoff_ms = int((_now() - timedelta(days=months * 31)).timestamp() * 1000)
    eligible = [
        game for game in games
        if game.end_time
        and game.end_time >= cutoff_ms
        and _initial_seconds(game.time_control) >= min_initial_seconds
        and game.platform in ("chesscom", "lichess")
        and game.pgn
    ]
    return sorted(eligible, key=lambda game: game.end_time or 0, reverse=True)[:max_games]


def build_training_plan_payload(games: list[Game], filters: dict[str, Any]) -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []
    segment_counts: Counter[str] = Counter()
    result_counts: Counter[str] = Counter()
    platform_counts: Counter[str] = Counter()
    opening_counts: Counter[str] = Counter()
    trend_counts: Counter[str] = Counter()
    trend_segments: dict[str, Counter[str]] = defaultdict(Counter)
    parsed_games = 0

    for game in games:
        segment = _time_control_segment(game.time_control)
        segment_counts[segment] += 1
        result_counts[game.result or "unknown"] += 1
        platform_counts[game.platform] += 1
        opening = _opening_name(game.pgn)
        opening_counts[opening] += 1
        game_candidates, parse_ok = _extract_candidates(game, segment)
        if parse_ok:
            parsed_games += 1
        for candidate in game_candidates:
            candidates.append(candidate)
            trend_counts[candidate["category"]] += 1
            trend_segments[candidate["category"]][segment] += 1

    top_category = _select_focus_category(trend_counts)
    current_focus = _focus_for_category(top_category, trend_counts[top_category], len(games))
    review_moments = [
        _candidate_to_review_moment(candidate)
        for candidate in sorted(
            [candidate for candidate in candidates if candidate["category"] == top_category],
            key=lambda item: (item["severity"], item["end_time"]),
            reverse=True,
        )[:3]
    ]
    top_trends = [
        {
            "category": category,
            "label": _category_label(category),
            "count": count,
            "confidence": "verified_examples" if category == top_category and review_moments else "trend_signal",
            "segments": dict(trend_segments[category]),
        }
        for category, count in trend_counts.most_common(5)
    ]

    end_times = [game.end_time for game in games if game.end_time]
    return {
        "source_platforms": list(platform_counts.keys()),
        "scanned_range": {
            "start": min(end_times) if end_times else None,
            "end": max(end_times) if end_times else None,
            "months": filters.get("months", 12),
        },
        "scan_summary": {
            "eligible_games": len(games),
            "parsed_games": parsed_games,
            "candidate_positions": len(candidates),
            "result_counts": dict(result_counts),
            "engine_note": "Candidate positions are selected server-side from PGN signals; deep engine verification is an adapter seam for the next worker upgrade.",
        },
        "time_control_breakdown": [
            {"segment": segment, "games": count}
            for segment, count in segment_counts.most_common()
        ],
        "top_trends": top_trends,
        "current_focus": current_focus,
        "review_moments": review_moments,
        "opening_context": [
            {"opening": opening, "games": count}
            for opening, count in opening_counts.most_common(8)
        ],
        "technical_evidence": {
            "trend_counts": dict(trend_counts),
            "platform_counts": dict(platform_counts),
            "filters": filters,
            "candidate_selector": "checks, captures, quiet moves with loose-piece or forcing-move signals",
        },
    }


def _extract_candidates(game: Game, segment: str) -> tuple[list[dict[str, Any]], bool]:
    parsed = chess.pgn.read_game(io.StringIO(game.pgn))
    if parsed is None:
        return [], False
    board = parsed.board()
    user_color = chess.WHITE if game.user_color != "black" else chess.BLACK
    candidates: list[dict[str, Any]] = []
    previous_opponent_check = False

    for ply_index, move in enumerate(parsed.mainline_moves(), start=1):
        mover = board.turn
        move_number = board.fullmove_number
        try:
            san = board.san(move)
        except Exception:
            san = move.uci()
        if mover == user_color:
            legal_moves = list(board.legal_moves)
            forcing_count = sum(1 for legal in legal_moves if board.is_capture(legal) or board.gives_check(legal))
            before_hanging = _hanging_piece_count(board, user_color)
            is_capture = board.is_capture(move)
            gives_check = board.gives_check(move)
            board.push(move)
            after_hanging = _hanging_piece_count(board, user_color)
            category, severity, note = _classify_candidate(
                move_number=move_number,
                san=san,
                is_capture=is_capture,
                gives_check=gives_check,
                forcing_count=forcing_count,
                before_hanging=before_hanging,
                after_hanging=after_hanging,
                previous_opponent_check=previous_opponent_check,
                board_after=board,
                user_color=user_color,
            )
            if category:
                candidates.append({
                    "category": category,
                    "severity": severity,
                    "game_id": game.id,
                    "platform_game_id": game.platform_game_id,
                    "platform": game.platform,
                    "pgn": game.pgn,
                    "opponent": game.opponent,
                    "result": game.result,
                    "time_control": game.time_control,
                    "segment": segment,
                    "move_number": move_number,
                    "color": "white" if user_color == chess.WHITE else "black",
                    "move_played": san,
                    "coach_note": note,
                    "end_time": game.end_time or 0,
                })
            previous_opponent_check = False
        else:
            previous_opponent_check = board.gives_check(move)
            board.push(move)

    return candidates, True


def _classify_candidate(
    *,
    move_number: int,
    san: str,
    is_capture: bool,
    gives_check: bool,
    forcing_count: int,
    before_hanging: int,
    after_hanging: int,
    previous_opponent_check: bool,
    board_after: chess.Board,
    user_color: chess.Color,
) -> tuple[str | None, int, str]:
    if after_hanging > before_hanging:
        return (
            "hung_piece",
            90 + min(20, (after_hanging - before_hanging) * 10),
            "A piece became easier to attack or was left without enough support after this move.",
        )
    if previous_opponent_check and not is_capture and not gives_check:
        return (
            "ignored_threat",
            80,
            "The previous move created forcing pressure; this response should be reviewed for threat awareness.",
        )
    if not is_capture and not gives_check and forcing_count >= 4:
        return (
            "missed_tactic",
            70 + min(20, forcing_count),
            "There were several forcing candidate moves available, but the game move was quiet.",
        )
    if move_number <= 12 and _king_uncastled(board_after, user_color) and not _looks_like_castle(san):
        return (
            "didnt_castle",
            60,
            "King safety stayed unresolved while the opening was moving into the middlegame.",
        )
    if move_number >= 14 and not is_capture and not gives_check and forcing_count <= 1:
        return (
            "aimless_move",
            45,
            "This quiet move did not create an obvious forcing threat or resolve a visible tactical issue.",
        )
    return None, 0, ""


def _candidate_to_review_moment(candidate: dict[str, Any]) -> dict[str, Any]:
    label = _category_label(candidate["category"])
    return {
        "game_id": candidate["game_id"],
        "platform_game_id": candidate["platform_game_id"],
        "platform": candidate["platform"],
        "opponent": candidate["opponent"],
        "result": candidate["result"],
        "time_control": candidate["time_control"],
        "segment": candidate["segment"],
        "move_number": candidate["move_number"],
        "color": candidate["color"],
        "move_played": candidate["move_played"],
        "title": f"{label}: move {candidate['move_number']} {candidate['move_played']}",
        "coach_note": candidate["coach_note"],
        "pgn": candidate["pgn"],
    }


def _hanging_piece_count(board: chess.Board, color: chess.Color) -> int:
    count = 0
    opponent = not color
    for square, piece in board.piece_map().items():
        if piece.color != color or piece.piece_type == chess.KING:
            continue
        attacked = board.is_attacked_by(opponent, square)
        defended = board.is_attacked_by(color, square)
        if attacked and not defended:
            count += 1
    return count


def _king_uncastled(board: chess.Board, color: chess.Color) -> bool:
    king_square = board.king(color)
    if king_square is None:
        return False
    return king_square in (chess.E1, chess.E8)


def _looks_like_castle(san: str) -> bool:
    return san.startswith("O-O") or san.startswith("0-0")


def _select_focus_category(counts: Counter[str]) -> str:
    if not counts:
        return "baseline"
    priority = {
        "hung_piece": 6,
        "missed_tactic": 5,
        "ignored_threat": 4,
        "didnt_castle": 3,
        "aimless_move": 2,
        "baseline": 0,
    }
    return sorted(counts, key=lambda key: (counts[key], priority.get(key, 0)), reverse=True)[0]


def _focus_for_category(category: str, count: int, game_count: int) -> dict[str, Any]:
    copy = {
        "hung_piece": (
            "Stop leaving pieces loose.",
            "Loose-piece signals showed up repeatedly in the broad scan.",
            ["What is attacked?", "What is undefended?", "What changes if I move this piece?"],
        ),
        "missed_tactic": (
            "Check forcing moves before quiet moves.",
            "The scan found positions where checks, captures, or threats were available before a quiet move.",
            ["List checks.", "List captures.", "List direct threats before choosing a quiet move."],
        ),
        "ignored_threat": (
            "Answer the opponent's last idea first.",
            "Threat-awareness signals appeared in games where the previous move created forcing pressure.",
            ["What did their last move attack?", "What threat exists if I pass?", "Does my move answer it?"],
        ),
        "didnt_castle": (
            "Resolve king safety earlier.",
            "Several openings kept the king in the center while the position was opening up.",
            ["Can I castle now?", "If not, what move makes castling possible?", "Is the center about to open?"],
        ),
        "aimless_move": (
            "Give quiet moves a job.",
            "Quiet moves often appeared without an obvious forcing threat or defensive purpose.",
            ["What piece improves?", "What threat is stopped?", "What pressure is created?"],
        ),
        "baseline": (
            "Build your first review baseline.",
            "DeepMove did not find a repeated trend in the eligible games yet.",
            ["Review the three sharpest moments.", "Look for repeated causes.", "Rerun after more games."],
        ),
    }
    title, summary, habit = copy.get(category, copy["baseline"])
    return {
        "category": category,
        "title": title,
        "summary": f"{summary} Found {count} signal{'s' if count != 1 else ''} across {game_count} eligible games.",
        "habit": habit,
        "confidence": "verified_examples" if count > 0 else "trend_signal",
    }


def _category_label(category: str) -> str:
    return {
        "hung_piece": "Loose pieces",
        "missed_tactic": "Forcing moves",
        "ignored_threat": "Opponent threats",
        "didnt_castle": "King safety",
        "aimless_move": "Quiet move purpose",
        "baseline": "Baseline",
    }.get(category, category.replace("_", " ").title())


def _initial_seconds(time_control: str | None) -> int:
    if not time_control:
        return 0
    text = str(time_control).strip().lower()
    if text in ("-", "unknown"):
        return 0
    if "/" in text:
        return 0
    match = re.match(r"^(\d+)(?:\+\d+)?$", text)
    if match:
        return int(match.group(1))
    match = re.match(r"^(\d+)\s*min", text)
    if match:
        return int(match.group(1)) * 60
    return 0


def _time_control_segment(time_control: str | None) -> str:
    initial = _initial_seconds(time_control)
    if initial < 300:
        return "bullet"
    if initial < 600:
        return "blitz"
    if initial < 1800:
        return "rapid"
    return "classical"


def _opening_name(pgn: str) -> str:
    parsed = chess.pgn.read_game(io.StringIO(pgn))
    if not parsed:
        return "Unknown Opening"
    for key in ("Opening", "ECOUrl"):
        value = parsed.headers.get(key)
        if value:
            return str(value).split("/")[-1].replace("-", " ")[:80]
    board = parsed.board()
    sans: list[str] = []
    for index, move in enumerate(parsed.mainline_moves()):
        if index >= 6:
            break
        sans.append(board.san(move))
        board.push(move)
    return " ".join(sans) if sans else "Unknown Opening"
