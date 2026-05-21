"""Simple polling worker for account-wide Training Plan jobs."""
import logging
import os
import time

from app.database import SessionLocal
from app.logging_utils import configure_logging
from app.services.account_analysis import run_next_job

POLL_SECONDS = float(os.environ.get("ANALYSIS_WORKER_POLL_SECONDS", "2"))


def main() -> None:
    configure_logging(os.environ.get("ENVIRONMENT", "development"))
    logging.getLogger(__name__).info("account analysis worker started")
    while True:
        if SessionLocal is None:
            time.sleep(POLL_SECONDS)
            continue
        db = SessionLocal()
        try:
            job = run_next_job(db)
            if job is None:
                time.sleep(POLL_SECONDS)
        finally:
            db.close()


if __name__ == "__main__":
    main()
