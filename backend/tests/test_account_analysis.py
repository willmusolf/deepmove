"""Coverage for account-wide Training Plan analysis."""
from datetime import UTC, datetime

from app.models.account_analysis import AccountReport, AnalysisJob
from app.models.game import Game
from app.services.account_analysis import build_training_plan_payload, run_job

SAMPLE_PGN = """
[Event "Live Chess"]
[White "me"]
[Black "them"]
[Result "1-0"]
[Opening "Italian Game"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. h4 Nf6 5. Ng5 O-O 6. Nc3 d6 7. d3 Bg4 8. f3 Bd7 1-0
"""


def test_start_job_prevents_duplicate_active_job(auth_client):
    client, _token, _user = auth_client
    first = client.post("/account-analysis/jobs", json={"max_games": 500, "months": 12})
    assert first.status_code == 201, first.text
    second = client.post("/account-analysis/jobs", json={"max_games": 500, "months": 12})
    assert second.status_code == 201, second.text

    assert first.json()["job"]["id"] == second.json()["job"]["id"]
    assert second.json()["active_existing"] is True


def test_run_job_stores_report_snapshot(db_session, auth_client):
    _client, _token, user = auth_client
    game = Game(
        user_id=user["id"],
        platform="chesscom",
        platform_game_id="https://www.chess.com/game/live/report-1",
        pgn=SAMPLE_PGN,
        user_color="white",
        user_elo=1200,
        opponent="them",
        opponent_rating=1210,
        result="W",
        time_control="300+0",
        end_time=int(datetime.now(UTC).timestamp() * 1000),
    )
    db_session.add(game)
    job = AnalysisJob(
        user_id=user["id"],
        status="queued",
        stage="queued",
        progress_pct=0,
        account_scope={"platforms": ["chesscom"]},
        filters={"max_games": 500, "months": 12, "min_initial_seconds": 300},
        requested_game_ids=[],
        completed_game_ids=[],
    )
    db_session.add(job)
    db_session.commit()

    finished = run_job(db_session, job.id)

    assert finished.status == "complete"
    assert finished.report_id is not None
    report = db_session.query(AccountReport).filter(AccountReport.id == finished.report_id).one()
    assert report.scan_summary["eligible_games"] == 1
    assert report.current_focus["title"]
    assert isinstance(report.review_moments, list)


def test_scan_segments_blitz_and_selects_candidates():
    game = type("GameLike", (), {
        "id": 1,
        "platform": "chesscom",
        "platform_game_id": "g1",
        "pgn": SAMPLE_PGN,
        "user_color": "white",
        "opponent": "them",
        "result": "W",
        "time_control": "300+0",
        "end_time": int(datetime.now(UTC).timestamp() * 1000),
    })()

    report = build_training_plan_payload([game], {"months": 12, "max_games": 500})

    assert report["time_control_breakdown"][0]["segment"] == "blitz"
    assert report["scan_summary"]["candidate_positions"] > 0
    assert report["review_moments"][0]["game_id"] == 1
