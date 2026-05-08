"""Fail if the Alembic revision graph is inconsistent.

Checks:
1. No duplicate revision IDs are present
2. The history can be traversed cleanly
3. There is exactly one head revision
"""

from __future__ import annotations

import sys
import warnings

from alembic.config import Config
from alembic.script import ScriptDirectory


def main() -> int:
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        config = Config("alembic.ini")
        script = ScriptDirectory.from_config(config)

        duplicate_warnings = [
            warning
            for warning in caught
            if "present more than once" in str(warning.message)
        ]
        if duplicate_warnings:
            print("Alembic revision IDs must be unique.", file=sys.stderr)
            return 1

    heads = script.get_heads()
    if len(heads) != 1:
        print(
            f"Alembic must have exactly one head, found {len(heads)}: {', '.join(heads)}",
            file=sys.stderr,
        )
        return 1

    try:
        revisions = list(script.walk_revisions(base="base", head="heads"))
    except Exception as exc:  # pragma: no cover - defensive CLI failure path
        print(f"Alembic history traversal failed: {exc}", file=sys.stderr)
        return 1

    seen: set[str] = set()
    for revision in revisions:
        if revision.revision in seen:
            print(
                f"Duplicate Alembic revision encountered during traversal: {revision.revision}",
                file=sys.stderr,
            )
            return 1
        seen.add(revision.revision)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
