#!/usr/bin/env python3
"""Company invoice API backed by a local SQLite file."""

from __future__ import annotations

import json
import random
import sqlite3
import string
from datetime import date, datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "invoices.db"


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS company (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              name TEXT DEFAULT '',
              address TEXT DEFAULT '',
              email TEXT DEFAULT '',
              phone TEXT DEFAULT '',
              tax_id TEXT DEFAULT '',
              logo TEXT DEFAULT '',
              template TEXT DEFAULT 'classic',
              tax_rate REAL DEFAULT 18,
              currency TEXT DEFAULT 'USD'
            );
            INSERT OR IGNORE INTO company (id) VALUES (1);

            CREATE TABLE IF NOT EXISTS clients (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL UNIQUE,
              address TEXT DEFAULT '',
              email TEXT DEFAULT '',
              phone TEXT DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS invoices (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              invoice_id TEXT NOT NULL UNIQUE,
              client_id INTEGER NOT NULL,
              issue_date TEXT,
              due_date TEXT,
              po_number TEXT DEFAULT '',
              notes TEXT DEFAULT '',
              tax_rate REAL DEFAULT 0,
              discount_rate REAL DEFAULT 0,
              currency TEXT DEFAULT 'USD',
              template TEXT DEFAULT 'classic',
              created_at TEXT NOT NULL,
              FOREIGN KEY (client_id) REFERENCES clients(id)
            );

            CREATE TABLE IF NOT EXISTS line_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              invoice_pk INTEGER NOT NULL,
              description TEXT DEFAULT '',
              qty REAL DEFAULT 0,
              unit REAL DEFAULT 0,
              FOREIGN KEY (invoice_pk) REFERENCES invoices(id) ON DELETE CASCADE
            );
            """
        )


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row else None


def next_invoice_id(conn: sqlite3.Connection) -> str:
    today = date.today().strftime("%Y%m%d")
    count = conn.execute("SELECT COUNT(*) FROM invoices").fetchone()[0] + 1
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"INV-{today}-{count:03d}{suffix}"


def upsert_client(conn: sqlite3.Connection, payload: dict) -> int:
    name = (payload.get("toName") or "").strip()
    if not name:
        raise ValueError("Client company name is required")
    existing = conn.execute("SELECT id FROM clients WHERE name = ?", (name,)).fetchone()
    fields = (name, payload.get("toAddress") or "", payload.get("toEmail") or "", payload.get("toPhone") or "")
    if existing:
        conn.execute("UPDATE clients SET name=?, address=?, email=?, phone=? WHERE id=?", (*fields, existing["id"]))
        return existing["id"]
    cur = conn.execute("INSERT INTO clients (name, address, email, phone) VALUES (?, ?, ?, ?)", fields)
    return cur.lastrowid


def save_company(conn: sqlite3.Connection, payload: dict) -> None:
    conn.execute(
        """
        UPDATE company SET
          name=?, address=?, email=?, phone=?, tax_id=?,
          logo=COALESCE(NULLIF(?, ''), logo),
          template=?, tax_rate=?, currency=?
        WHERE id=1
        """,
        (
            payload.get("fromName") or "",
            payload.get("fromAddress") or "",
            payload.get("fromEmail") or "",
            payload.get("fromPhone") or "",
            payload.get("fromTax") or "",
            payload.get("logoDataUrl") or "",
            payload.get("template") or "classic",
            float(payload.get("taxRate") or 0),
            (payload.get("currency") or "USD").upper(),
        ),
    )


def invoice_payload(conn: sqlite3.Connection, invoice_row: sqlite3.Row) -> dict:
    company = conn.execute("SELECT * FROM company WHERE id=1").fetchone()
    client = conn.execute("SELECT * FROM clients WHERE id=?", (invoice_row["client_id"],)).fetchone()
    items = conn.execute(
        "SELECT description, qty, unit FROM line_items WHERE invoice_pk=? ORDER BY id",
        (invoice_row["id"],),
    ).fetchall()
    return {
        "invoiceId": invoice_row["invoice_id"],
        "template": invoice_row["template"],
        "logoDataUrl": company["logo"] if company else "",
        "fromName": company["name"] if company else "",
        "fromAddress": company["address"] if company else "",
        "fromEmail": company["email"] if company else "",
        "fromPhone": company["phone"] if company else "",
        "fromTax": company["tax_id"] if company else "",
        "toName": client["name"] if client else "",
        "toAddress": client["address"] if client else "",
        "toEmail": client["email"] if client else "",
        "toPhone": client["phone"] if client else "",
        "issueDate": invoice_row["issue_date"],
        "dueDate": invoice_row["due_date"],
        "poNumber": invoice_row["po_number"],
        "notes": invoice_row["notes"],
        "taxRate": invoice_row["tax_rate"],
        "discountRate": invoice_row["discount_rate"],
        "currency": invoice_row["currency"],
        "items": [dict(i) for i in items],
        "createdAt": invoice_row["created_at"],
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _json(self, status: int, payload) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/bootstrap":
            with db() as conn:
                company = row_to_dict(conn.execute("SELECT * FROM company WHERE id=1").fetchone())
                clients = [dict(r) for r in conn.execute("SELECT * FROM clients ORDER BY name").fetchall()]
                invoices = [
                    dict(r)
                    for r in conn.execute(
                        """
                        SELECT invoices.invoice_id, invoices.issue_date, invoices.currency,
                               invoices.tax_rate, invoices.discount_rate, clients.name AS client_name,
                               company.name AS company_name,
                               (SELECT COALESCE(SUM(qty * unit), 0) FROM line_items WHERE invoice_pk = invoices.id) AS subtotal
                        FROM invoices
                        JOIN clients ON clients.id = invoices.client_id
                        JOIN company ON company.id = 1
                        ORDER BY invoices.id DESC
                        """
                    ).fetchall()
                ]
            self._json(200, {"company": company, "clients": clients, "invoices": invoices})
            return
        if parsed.path.startswith("/api/invoices/"):
            invoice_id = parsed.path.rsplit("/", 1)[-1]
            with db() as conn:
                row = conn.execute("SELECT * FROM invoices WHERE invoice_id=?", (invoice_id,)).fetchone()
                if not row:
                    self._json(404, {"error": "Invoice not found"})
                    return
                self._json(200, invoice_payload(conn, row))
            return
        if parsed.path == "/api/invoices":
            qs = parse_qs(parsed.query)
            q = (qs.get("q") or [""])[0].lower()
            with db() as conn:
                rows = conn.execute(
                    """
                    SELECT invoices.invoice_id, invoices.issue_date, invoices.currency,
                           invoices.tax_rate, invoices.discount_rate, clients.name AS client_name,
                           company.name AS company_name,
                           (SELECT COALESCE(SUM(qty * unit), 0) FROM line_items WHERE invoice_pk = invoices.id) AS subtotal
                    FROM invoices
                    JOIN clients ON clients.id = invoices.client_id
                    JOIN company ON company.id = 1
                    ORDER BY invoices.id DESC
                    """
                ).fetchall()
            out = []
            for r in rows:
                if q and q not in f"{r['invoice_id']} {r['client_name']} {r['company_name']}".lower():
                    continue
                out.append(dict(r))
            self._json(200, out)
            return
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/company":
            payload = self._read_json()
            with db() as conn:
                save_company(conn, payload)
            self._json(200, {"ok": True})
            return
        if parsed.path == "/api/invoices":
            payload = self._read_json()
            if not (payload.get("fromName") or "").strip():
                self._json(400, {"error": "Company name is required"})
                return
            try:
                with db() as conn:
                    save_company(conn, payload)
                    client_id = upsert_client(conn, payload)
                    invoice_id = payload.get("invoiceId") or next_invoice_id(conn)
                    existing = conn.execute("SELECT id FROM invoices WHERE invoice_id=?", (invoice_id,)).fetchone()
                    now = datetime.utcnow().isoformat(timespec="seconds") + "Z"
                    values = (
                        client_id,
                        payload.get("issueDate") or "",
                        payload.get("dueDate") or "",
                        payload.get("poNumber") or "",
                        payload.get("notes") or "",
                        float(payload.get("taxRate") or 0),
                        float(payload.get("discountRate") or 0),
                        (payload.get("currency") or "USD").upper(),
                        payload.get("template") or "classic",
                    )
                    if existing:
                        conn.execute(
                            """UPDATE invoices SET client_id=?, issue_date=?, due_date=?, po_number=?,
                              notes=?, tax_rate=?, discount_rate=?, currency=?, template=? WHERE id=?""",
                            (*values, existing["id"]),
                        )
                        pk = existing["id"]
                        conn.execute("DELETE FROM line_items WHERE invoice_pk=?", (pk,))
                    else:
                        cur = conn.execute(
                            """INSERT INTO invoices (
                              invoice_id, client_id, issue_date, due_date, po_number, notes,
                              tax_rate, discount_rate, currency, template, created_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                            (invoice_id, *values, now),
                        )
                        pk = cur.lastrowid
                    for item in payload.get("items") or []:
                        conn.execute(
                            "INSERT INTO line_items (invoice_pk, description, qty, unit) VALUES (?, ?, ?, ?)",
                            (pk, item.get("description") or "", float(item.get("qty") or 0), float(item.get("unit") or 0)),
                        )
                    row = conn.execute("SELECT * FROM invoices WHERE id=?", (pk,)).fetchone()
                    self._json(200, invoice_payload(conn, row))
            except ValueError as exc:
                self._json(400, {"error": str(exc)})
            return
        self._json(404, {"error": "Not found"})

    def log_message(self, fmt: str, *args) -> None:
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))


if __name__ == "__main__":
    init_db()
    port = 8080
    print(f"Company invoice server on http://127.0.0.1:{port}")
    print(f"SQLite file: {DB_PATH}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
