"""principle.py — SQLAlchemy Principle tracking model"""
# TODO (Track D): Define UserPrincipleHistory model
# Tracks which principles a user keeps triggering across games.
# Powers the weakness profile dashboard and recurring mistake detection.
# Fields: id, user_id (FK), principle_id, trigger_count, last_seen, games (JSON array)
