import json
import sqlite3
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parents[2]
DB_DIR = BASE_DIR / "data"
DB_PATH = DB_DIR / "navigator.db"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = _connect()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS project_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_name TEXT NOT NULL,
                framework TEXT NOT NULL,
                rows_processed INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                result_json TEXT NOT NULL
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def save_project_result(project_name: str, framework: str, rows_processed: int, result: dict[str, Any]) -> int:
    conn = _connect()
    try:
        cursor = conn.execute(
            """
            INSERT INTO project_results (project_name, framework, rows_processed, result_json)
            VALUES (?, ?, ?, ?)
            """,
            (project_name, framework, rows_processed, json.dumps(result)),
        )
        conn.commit()
        return int(cursor.lastrowid)
    finally:
        conn.close()


def list_project_results(limit: int = 100) -> list[dict[str, Any]]:
    conn = _connect()
    try:
        rows = conn.execute(
            """
            SELECT id, project_name, framework, rows_processed, created_at
            FROM project_results
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_project_result(project_id: int) -> dict[str, Any] | None:
    conn = _connect()
    try:
        row = conn.execute(
            """
            SELECT id, project_name, framework, rows_processed, created_at, result_json
            FROM project_results
            WHERE id = ?
            """,
            (project_id,),
        ).fetchone()
        if row is None:
            return None
        payload = dict(row)
        payload["result"] = json.loads(payload.pop("result_json"))
        return payload
    finally:
        conn.close()


def delete_project_result(project_id: int) -> bool:
    conn = _connect()
    try:
        cursor = conn.execute(
            "DELETE FROM project_results WHERE id = ?",
            (project_id,),
        )
        conn.commit()
        deleted = cursor.rowcount > 0
        if deleted:
            # When the table is fully empty, reset the AUTOINCREMENT counter so
            # the next saved project starts at ID 1 again.
            remaining = conn.execute(
                "SELECT COUNT(*) FROM project_results"
            ).fetchone()[0]
            if remaining == 0:
                conn.execute(
                    "DELETE FROM sqlite_sequence WHERE name = 'project_results'"
                )
                conn.commit()
        return deleted
    finally:
        conn.close()
