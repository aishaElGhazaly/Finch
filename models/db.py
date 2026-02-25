import sqlite3

DB_PATH = "finch.db"

def get_db():
    conn = sqlite3.connect(
        DB_PATH,
        timeout=30,
        detect_types=sqlite3.PARSE_DECLTYPES
    )
    conn.row_factory = sqlite3.Row
    return conn


def begin_immediate(conn):
    conn.execute("BEGIN IMMEDIATE")
