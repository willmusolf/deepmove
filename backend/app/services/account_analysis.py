"""Account-wide broad scan and Training Plan report generation."""
from __future__ import annotations

import io
import json
import logging
import re
import time
from collections import Counter, defaultdict
from collections.abc import Callable, Sequence
from dataclasses import dataclass
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
from app.services.lesson_catalog import (
    LESSONS,
    LessonDefinition,
    lesson_for_category,
    lesson_payload,
)

logger = logging.getLogger(__name__)

ACTIVE_JOB_STATUSES = ("queued", "running")
JOB_STAGES = {
    "queued": 0,
    "fetching_games": 8,
    "scanning_metadata": 24,
    "analyzing_candidates": 30,
    "deep_reviewing_examples": 86,
    "saving_report": 96,
    "complete": 100,
    "failed": 100,
    "cancelled": 100,
}
CHESSCOM_HEADERS = {"User-Agent": "DeepMove/1.0 Chess Coaching App (contact: hello@deepmove.app)"}
SECONDS_PER_MONTH = 31 * 24 * 60 * 60
MIN_LESSON_SAMPLE_GAMES = 50
MAX_VERIFICATION_CANDIDATES = 40


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


def run_queued_job_by_id(job_id: int) -> None:
    """Run one queued job from a fresh session.

    This is a web-process safety net for environments where the dedicated
    worker process has not been provisioned yet. Row locking keeps it compatible
    with the real worker: whichever process claims the job first owns it.
    """
    from app.database import SessionLocal

    if SessionLocal is None:
        logger.warning("account analysis background kick skipped: database unavailable")
        return

    db = SessionLocal()
    try:
        query = db.query(AnalysisJob).filter(AnalysisJob.id == job_id, AnalysisJob.status == "queued")
        try:
            query = query.with_for_update(skip_locked=True)
        except TypeError:
            query = query.with_for_update()
        job = query.first()
        if job is None:
            return
        job.status = "running"
        job.stage = "fetching_games"
        job.progress_pct = JOB_STAGES["fetching_games"]
        job.started_at = _now()
        job.error = None
        db.commit()
        run_job(db, job_id)
    except Exception:
        logger.exception("account analysis background kick failed", extra={"job_id": job_id})
    finally:
        db.close()


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
        scan = build_training_plan_payload(
            eligible,
            job.filters,
            progress_callback=lambda scanned, total: _set_scan_progress(db, job, scanned, total),
        )
        _set_stage(db, job, "deep_reviewing_examples")

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


def _set_scan_progress(db: Session, job: AnalysisJob, scanned: int, total: int) -> None:
    if total <= 0:
        return
    db.refresh(job)
    if job.status == "cancelled":
        raise RuntimeError("Analysis job was cancelled")
    start = JOB_STAGES["analyzing_candidates"]
    end = JOB_STAGES["deep_reviewing_examples"] - 1
    pct = start + round((end - start) * min(scanned, total) / total)
    if pct <= job.progress_pct:
        return
    job.status = "running"
    job.stage = "analyzing_candidates"
    job.progress_pct = min(end, pct)
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


@dataclass(frozen=True)
class VerificationResult:
    better_move_san: str
    better_move_uci: str
    eval_loss_cp: int
    win_pct_loss: float
    reason: str
    theme_facts: list[str]


class CandidateVerifier:
    """Adapter seam for deeper engine review.

    Production can replace the default heuristic implementation with Stockfish
    without changing the account-analysis report builder. Tests inject fakes
    through `build_training_plan_payload(..., verifier=...)`.
    """

    method = "lesson_heuristic"

    def verify(self, candidate: dict[str, Any], lesson: LessonDefinition) -> VerificationResult | None:
        raise NotImplementedError


class HeuristicCandidateVerifier(CandidateVerifier):
    method = "lesson_prompt"

    def verify(self, candidate: dict[str, Any], lesson: LessonDefinition) -> VerificationResult | None:
        if int(candidate.get("legal_move_count") or 0) <= 1:
            return None
        if candidate.get("move_number", 0) < lesson.min_move or candidate.get("move_number", 0) > lesson.max_move:
            return None

        try:
            board = chess.Board(candidate["fen_before"])
        except Exception:
            return None

        played_uci = str(candidate.get("move_uci") or "")
        best = _best_lesson_move(board, lesson, played_uci)
        if best is None:
            return None

        try:
            best_san = board.san(best)
        except Exception:
            best_san = best.uci()

        if best.uci() == played_uci or best_san == candidate.get("move_played"):
            return None

        severity = int(candidate.get("severity") or 0)
        eval_loss_cp = max(90, min(500, severity * 2))
        if lesson.category in ("hung_piece", "missed_tactic", "ignored_threat"):
            eval_loss_cp = max(eval_loss_cp, 180)

        return VerificationResult(
            better_move_san=best_san,
            better_move_uci=best.uci(),
            eval_loss_cp=eval_loss_cp,
            win_pct_loss=round(min(35.0, eval_loss_cp / 18), 1),
            reason=_verification_reason(lesson, best_san),
            theme_facts=[
                candidate.get("coach_note") or lesson.summary,
                _verification_reason(lesson, best_san),
            ],
        )


def build_training_plan_payload(
    games: list[Game],
    filters: dict[str, Any],
    verifier: CandidateVerifier | None = None,
    progress_callback: Callable[[int, int], None] | None = None,
) -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []
    segment_counts: Counter[str] = Counter()
    result_counts: Counter[str] = Counter()
    platform_counts: Counter[str] = Counter()
    opening_counts: Counter[tuple[str, str]] = Counter()
    trend_counts: Counter[str] = Counter()
    trend_segments: dict[str, Counter[str]] = defaultdict(Counter)
    parsed_games = 0
    verifier = verifier or HeuristicCandidateVerifier()

    total_games = len(games)
    for index, game in enumerate(games, start=1):
        segment = _time_control_segment(game.time_control)
        segment_counts[segment] += 1
        result_counts[game.result or "unknown"] += 1
        platform_counts[game.platform] += 1
        opening = _opening_name(game.pgn)
        color = game.user_color if game.user_color in ("white", "black") else "white"
        opening_counts[(color, opening)] += 1
        game_candidates, parse_ok = _extract_candidates(game, segment)
        if parse_ok:
            parsed_games += 1
        for candidate in game_candidates:
            candidates.append(candidate)
            trend_counts[candidate["category"]] += 1
            trend_segments[candidate["category"]][segment] += 1
        if progress_callback and (index == total_games or index == 1 or index % 20 == 0):
            progress_callback(index, total_games)

    small_sample = len(games) < MIN_LESSON_SAMPLE_GAMES
    selected_lesson, verified_candidates, rejected = (
        (None, [], []) if small_sample else _select_verified_lesson(candidates, trend_counts, verifier)
    )
    trusted_count = sum(1 for candidate in verified_candidates if candidate.get("verified") is True)
    top_category = selected_lesson.category if selected_lesson else _select_focus_category(trend_counts)
    current_focus = _focus_for_lesson(selected_lesson, trusted_count, len(games), small_sample)
    review_moments = [_candidate_to_review_moment(candidate) for candidate in verified_candidates]
    top_trends = [
        {
            "category": category,
            "label": _category_label(category),
            "count": count,
            "confidence": "verified_examples" if category == top_category and trusted_count > 0 else "trend_signal",
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
            "report_version": "insights_beta_v2",
            "eligible_games": len(games),
            "parsed_games": parsed_games,
            "candidate_positions": len(candidates),
            "result_counts": dict(result_counts),
            "minimum_lesson_games": MIN_LESSON_SAMPLE_GAMES,
            "sample_status": "small_sample" if small_sample else "ready",
            "verification_method": verifier.method,
        },
        "time_control_breakdown": [
            {"segment": segment, "games": count}
            for segment, count in segment_counts.most_common()
        ],
        "top_trends": top_trends,
        "current_focus": current_focus,
        "review_moments": review_moments,
        "opening_context": [
            {"opening": opening, "color": color, "games": count}
            for (color, opening), count in opening_counts.most_common(10)
        ],
        "technical_evidence": {
            "trend_counts": dict(trend_counts),
            "platform_counts": dict(platform_counts),
            "filters": filters,
            "candidate_selector": "lesson-aware PGN signals checked by the candidate verifier",
            "lesson_context": _lesson_context_payload(selected_lesson, verified_candidates, small_sample),
            "verified_examples": review_moments,
            "quality_summary": {
                "candidate_count": len(candidates),
                "checked_count": min(len(candidates), MAX_VERIFICATION_CANDIDATES),
                "verified_count": trusted_count,
                "review_prompt_count": len(verified_candidates) - trusted_count,
                "rejected_count": len(rejected),
                "rejected_reasons": dict(Counter(item["reason"] for item in rejected)),
            },
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
            fen_before = board.fen()
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
                    "move_uci": move.uci(),
                    "fen_before": fen_before,
                    "fen_after": board.fen(),
                    "legal_move_count": len(legal_moves),
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
            "A piece became easier to attack or lost support after this move. Review goal: identify which defender changed jobs.",
        )
    if previous_opponent_check and not is_capture and not gives_check:
        return (
            "ignored_threat",
            80,
            "The previous move created forcing pressure. Review goal: name the threat before choosing your response.",
        )
    if not is_capture and not gives_check and forcing_count >= 4:
        return (
            "missed_tactic",
            70 + min(20, forcing_count),
            "There were several forcing candidate moves available, but the game move was quiet. Review goal: compare this move with the strongest forcing try.",
        )
    if 6 <= move_number <= 12 and _king_uncastled(board_after, user_color) and not _looks_like_castle(san):
        return (
            "didnt_castle",
            60,
            "King safety stayed unresolved while the opening was moving into the middlegame. Review goal: find the move that would have made castling possible sooner.",
        )
    if move_number >= 14 and not is_capture and not gives_check and forcing_count <= 1:
        return (
            "aimless_move",
            45,
            "This quiet move did not create an obvious threat or fix a visible problem. Review goal: decide what job the move was supposed to do.",
        )
    return None, 0, ""


def _candidate_to_review_moment(candidate: dict[str, Any]) -> dict[str, Any]:
    label = _category_label(candidate["category"])
    move_ref = _move_reference(candidate["move_number"], candidate["color"], candidate["move_played"])
    lesson = lesson_for_category(candidate["category"])
    example_id = f"{candidate['game_id']}:{candidate['move_number']}:{candidate['color']}:{candidate.get('better_move_uci', '')}"
    return {
        "id": example_id,
        "example_id": example_id,
        "lesson_id": lesson.id if lesson else candidate["category"],
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
        "played_san": candidate["move_played"],
        "fen_before": candidate.get("fen_before"),
        "fen_after": candidate.get("fen_after"),
        "better_move_san": candidate.get("better_move_san"),
        "better_move_uci": candidate.get("better_move_uci"),
        "eval_loss_cp": candidate.get("eval_loss_cp"),
        "win_pct_loss": candidate.get("win_pct_loss"),
        "verification_method": candidate.get("verification_method"),
        "verified": candidate.get("verified", False),
        "theme_facts": candidate.get("theme_facts", []),
        "practice_prompt": candidate.get("practice_prompt") or (lesson.practice_prompt if lesson else ""),
        "title": f"{label}: {move_ref}",
        "coach_note": candidate.get("verification_reason") or candidate["coach_note"],
        "pgn": candidate["pgn"],
    }


def _move_reference(move_number: int, color: str, move_played: str) -> str:
    if color == "black":
        return f"{move_number}... {move_played}"
    return f"{move_number}. {move_played}"


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


def _select_review_moments(candidates: list[dict[str, Any]], category: str, max_examples: int = 5) -> list[dict[str, Any]]:
    if not candidates or category == "baseline":
        return []

    focus_candidates = [
        candidate
        for candidate in candidates
        if candidate["category"] == category and _is_teachable_example(candidate)
    ]
    ranked = sorted(
        focus_candidates,
        key=lambda item: (_candidate_example_score(item), item["severity"], item["end_time"]),
        reverse=True,
    )

    selected: list[dict[str, Any]] = []
    seen_games: set[str] = set()

    for candidate in ranked:
        game_key = str(candidate["platform_game_id"] or candidate["game_id"])
        if game_key in seen_games:
            continue
        selected.append(_candidate_to_review_moment(candidate))
        seen_games.add(game_key)
        if len(selected) >= max_examples:
            return selected

    return selected


def _select_verified_lesson(
    candidates: list[dict[str, Any]],
    trend_counts: Counter[str],
    verifier: CandidateVerifier,
    max_examples: int = 3,
) -> tuple[LessonDefinition | None, list[dict[str, Any]], list[dict[str, Any]]]:
    rejected: list[dict[str, Any]] = []
    lesson_order = sorted(
        (lesson for lesson in LESSONS.values() if trend_counts[lesson.category] > 0),
        key=lambda lesson: (trend_counts[lesson.category], lesson.priority),
        reverse=True,
    )

    checked = 0
    best_lesson: LessonDefinition | None = None
    best_verified: list[dict[str, Any]] = []

    for lesson in lesson_order:
        if not _lesson_allowed_for_verifier(lesson, verifier):
            rejected.append({"category": lesson.category, "reason": "needs_engine_verification"})
            continue
        lesson_candidates = sorted(
            [
                candidate
                for candidate in candidates
                if candidate["category"] == lesson.category and _is_teachable_example(candidate)
            ],
            key=lambda item: (_candidate_example_score(item), item["severity"], item["end_time"]),
            reverse=True,
        )
        verified: list[dict[str, Any]] = []
        seen_games: set[str] = set()
        for candidate in lesson_candidates:
            if checked >= MAX_VERIFICATION_CANDIDATES:
                break
            checked += 1
            game_key = str(candidate["platform_game_id"] or candidate["game_id"])
            if game_key in seen_games:
                rejected.append({"category": lesson.category, "reason": "duplicate_game"})
                continue
            result = verifier.verify(candidate, lesson)
            if result is None:
                rejected.append({"category": lesson.category, "reason": "no_clear_fix"})
                continue
            is_engine_verified = verifier.method == "engine"
            verified_candidate = {
                **candidate,
                "lesson_id": lesson.id,
                "verified": is_engine_verified,
                "verification_method": verifier.method,
                "better_move_san": result.better_move_san if is_engine_verified else None,
                "better_move_uci": result.better_move_uci if is_engine_verified else None,
                "eval_loss_cp": result.eval_loss_cp,
                "win_pct_loss": result.win_pct_loss,
                "verification_reason": result.reason if is_engine_verified else _review_prompt_reason(lesson),
                "theme_facts": result.theme_facts if is_engine_verified else [_review_prompt_reason(lesson)],
                "practice_prompt": lesson.practice_prompt,
            }
            verified.append(verified_candidate)
            seen_games.add(game_key)
            if len(verified) >= max_examples:
                break

        if len(verified) > len(best_verified):
            best_lesson = lesson
            best_verified = verified
        if len(verified) >= 2:
            return lesson, verified, rejected
        if checked >= MAX_VERIFICATION_CANDIDATES:
            break

    if best_verified:
        return best_lesson, best_verified, rejected
    return None, [], rejected


def _lesson_allowed_for_verifier(lesson: LessonDefinition, verifier: CandidateVerifier) -> bool:
    if verifier.method == "engine":
        return True
    # A missed-tactic lesson is only useful when deeper review proves the tactic
    # actually matters. Cheap "a check existed" heuristics produce too many
    # trivial pawn wins and already-winning positions.
    return lesson.category != "missed_tactic"


def _review_prompt_reason(lesson: LessonDefinition) -> str:
    if lesson.category == "hung_piece":
        return "This position matched a loose-piece pattern, but it still needs engine review before DeepMove can name a best move."
    if lesson.category == "ignored_threat":
        return "This position matched an opponent-threat pattern, but it still needs engine review before DeepMove can name the answer."
    if lesson.category == "didnt_castle":
        return "This position matched a king-safety pattern, but it still needs engine review before DeepMove can name the cleanest fix."
    if lesson.category == "didnt_develop":
        return "This position matched a development pattern, but it still needs engine review before DeepMove can name the cleanest move."
    if lesson.category == "aimless_move":
        return "This position matched a quiet-move pattern, but it still needs engine review before DeepMove can name a better plan."
    return "This position matched a lesson pattern, but it still needs engine review before DeepMove can name a best move."


PIECE_CP = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 0,
}


def _best_lesson_move(board: chess.Board, lesson: LessonDefinition, played_uci: str) -> chess.Move | None:
    scored: list[tuple[int, chess.Move]] = []
    color = board.turn
    for move in board.legal_moves:
        if move.uci() == played_uci:
            continue
        score = _lesson_move_score(board, move, lesson, color)
        if score > 0:
            scored.append((score, move))
    if not scored:
        return None
    scored.sort(key=lambda item: item[0], reverse=True)
    if scored[0][0] < 12:
        return None
    return scored[0][1]


def _lesson_move_score(
    board: chess.Board,
    move: chess.Move,
    lesson: LessonDefinition,
    color: chess.Color,
) -> int:
    score = 0
    if board.gives_check(move):
        score += 18
    if board.is_capture(move):
        captured = board.piece_at(move.to_square)
        score += 16 + (PIECE_CP.get(captured.piece_type, 0) // 100 if captured else 0)
    if lesson.category == "didnt_castle":
        try:
            san = board.san(move)
        except Exception:
            san = move.uci()
        if _looks_like_castle(san):
            score += 80
    if lesson.category == "didnt_develop" and _develops_minor_piece(board, move, color):
        score += 55
    if lesson.category == "hung_piece":
        before_hanging = _hanging_piece_count(board, color)
        next_board = board.copy(stack=False)
        next_board.push(move)
        after_hanging = _hanging_piece_count(next_board, color)
        if after_hanging < before_hanging:
            score += 65
        if after_hanging == 0:
            score += 20
    if lesson.category == "ignored_threat":
        if board.is_capture(move) or board.gives_check(move):
            score += 30
        next_board = board.copy(stack=False)
        next_board.push(move)
        if _hanging_piece_count(next_board, color) == 0:
            score += 20
    if lesson.category == "missed_tactic" and (board.is_capture(move) or board.gives_check(move)):
        score += 50
    if lesson.category == "aimless_move":
        if _develops_minor_piece(board, move, color):
            score += 22
        if board.is_capture(move) or board.gives_check(move):
            score += 24
        if _improves_piece_centrality(move):
            score += 16
    return score


def _develops_minor_piece(board: chess.Board, move: chess.Move, color: chess.Color) -> bool:
    piece = board.piece_at(move.from_square)
    if piece is None or piece.color != color or piece.piece_type not in (chess.KNIGHT, chess.BISHOP):
        return False
    start_squares = (
        {chess.B1, chess.C1, chess.F1, chess.G1}
        if color == chess.WHITE
        else {chess.B8, chess.C8, chess.F8, chess.G8}
    )
    return move.from_square in start_squares and move.to_square not in start_squares


def _improves_piece_centrality(move: chess.Move) -> bool:
    center = {chess.D4, chess.E4, chess.D5, chess.E5, chess.C4, chess.F4, chess.C5, chess.F5}
    return move.to_square in center


def _verification_reason(lesson: LessonDefinition, move_san: str) -> str:
    if lesson.category == "hung_piece":
        return f"{move_san} was the clearer way to address the loose-piece problem."
    if lesson.category == "ignored_threat":
        return f"{move_san} was the clearer response to the opponent's immediate idea."
    if lesson.category == "missed_tactic":
        return f"{move_san} was the forcing move to check before playing quietly."
    if lesson.category == "didnt_develop":
        return f"{move_san} brought another piece into the game."
    if lesson.category == "didnt_castle":
        return f"{move_san} handled king safety before the position became sharper."
    if lesson.category == "aimless_move":
        return f"{move_san} gave the move a clearer job."
    return f"{move_san} was the clearer practical idea."


def _lesson_context_payload(
    lesson: LessonDefinition | None,
    examples: list[dict[str, Any]],
    small_sample: bool,
) -> dict[str, Any]:
    if small_sample:
        return {
            "id": "small_sample",
            "category": "baseline",
            "title": "Play a few more games first.",
            "report_title": "Play a few more games first.",
            "summary": (
                f"DeepMove needs about {MIN_LESSON_SAMPLE_GAMES} eligible games before it can "
                "trust a lesson pattern."
            ),
            "habit": ["Play more blitz-or-longer games.", "Run Insights again.", "Review the clearest game manually."],
            "practice_prompt": "",
            "example_count": 0,
        }
    if lesson is None:
        return {
            "id": "baseline",
            "category": "baseline",
            "title": "No clean lesson survived review.",
            "report_title": "No clean lesson survived review.",
            "summary": "DeepMove saw signals, but none were clear enough to teach as flagship examples.",
            "habit": ["Review the sharpest games.", "Look for repeated causes.", "Run Insights again later."],
            "practice_prompt": "",
            "example_count": 0,
        }
    return {
        **lesson_payload(lesson),
        "example_count": len(examples),
    }


def _candidate_example_score(candidate: dict[str, Any]) -> int:
    move_number = int(candidate.get("move_number") or 0)
    category = str(candidate.get("category") or "")
    severity = int(candidate.get("severity") or 0)

    target_move = {
        "didnt_castle": 8,
        "hung_piece": 16,
        "missed_tactic": 18,
        "ignored_threat": 16,
        "aimless_move": 18,
    }.get(category, 16)

    timing_bonus = max(0, 18 - abs(move_number - target_move))
    loss_penalty = 10 if move_number > 28 else 0
    return severity + timing_bonus - loss_penalty


def _is_teachable_example(candidate: dict[str, Any]) -> bool:
    move_number = int(candidate.get("move_number") or 0)
    category = str(candidate.get("category") or "")

    if category == "didnt_castle":
        return 6 <= move_number <= 12
    if category == "aimless_move":
        return 14 <= move_number <= 26
    return 4 <= move_number <= 28


def _focus_for_category(category: str, count: int, game_count: int) -> dict[str, Any]:
    copy = {
        "hung_piece": (
            "Stop leaving pieces loose.",
            "The broad scan kept finding positions where one move loosened a defender or left a piece easier to attack. Start with the clearest examples below.",
            ["What is attacked?", "What is undefended?", "What changes if I move this piece?"],
        ),
        "missed_tactic": (
            "Check forcing moves before quiet moves.",
            "The broad scan found repeated spots where checks, captures, or direct threats were available before a quieter move. Review the examples below before turning this into practice.",
            ["List checks.", "List captures.", "List direct threats before choosing a quiet move."],
        ),
        "ignored_threat": (
            "Answer the opponent's last idea first.",
            "Several games featured a forcing opponent move followed by a reply that did not fully answer the threat. Review the sharpest examples first.",
            ["What did their last move attack?", "What threat exists if I pass?", "Does my move answer it?"],
        ),
        "didnt_castle": (
            "Resolve king safety earlier.",
            "Several openings kept the king in the center while the position was opening up. The examples below are the clearest places to review what would have made castling possible sooner.",
            ["Can I castle now?", "If not, what move makes castling possible?", "Is the center about to open?"],
        ),
        "aimless_move": (
            "Give quiet moves a job.",
            "The scan found quiet moves that did not clearly improve a piece, stop a threat, or create pressure. Review the examples below and ask what each move was trying to accomplish.",
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
        "summary": summary if count > 0 and game_count > 0 else copy["baseline"][1],
        "habit": habit,
        "confidence": "verified_examples" if count > 0 else "trend_signal",
    }


def _focus_for_lesson(
    lesson: LessonDefinition | None,
    verified_count: int,
    game_count: int,
    small_sample: bool,
) -> dict[str, Any]:
    if small_sample:
        return {
            "category": "baseline",
            "lesson_id": "small_sample",
            "title": "Play a few more games first.",
            "summary": (
                f"DeepMove found {game_count} eligible games. It needs about "
                f"{MIN_LESSON_SAMPLE_GAMES} before choosing a lesson from account-wide patterns."
            ),
            "habit": ["Play more blitz-or-longer games.", "Run Insights again.", "Review one recent loss manually."],
            "confidence": "trend_signal",
        }
    if lesson is None:
        return _focus_for_category("baseline", 0, game_count)
    return {
        "category": lesson.category,
        "lesson_id": lesson.id,
        "title": lesson.report_title,
        "summary": lesson.summary,
        "habit": list(lesson.habit),
        "confidence": "verified_examples" if verified_count > 0 else "trend_signal",
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
