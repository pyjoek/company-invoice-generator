# Company Invoice Generator

Generate company invoices from one print template. Details live in a local SQLite file so history only recalls data — it does not store a second copy of the template.

## Approach

| Store once | Store per invoice | Never stored |
|---|---|---|
| Company name, address, tax ID, logo | Unique invoice ID, dates, notes, tax/discount | HTML/CSS template |
| Client companies (reused by name) | Line items | Printed PDF pages |

Open or Print on a past invoice loads rows from SQLite and fills the same Classic / Modern / Minimal / Corporate template.

## Run

Python 3 only. No extra packages.

```bash
python3 server.py
```

Open `http://127.0.0.1:8080`.

The database file is created next to the app as `invoices.db`.

## API

- `GET /api/bootstrap` — company profile, saved clients, invoice list
- `POST /api/invoices` — create or update; assigns `INV-YYYYMMDD-###XXXX` if needed
- `GET /api/invoices?q=` — history
- `GET /api/invoices/<id>` — full record used to refill the template

Logo is saved on the single `company` row, not duplicated on every invoice.
