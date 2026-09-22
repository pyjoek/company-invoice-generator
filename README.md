# Company Invoice Generator

Generate professional company invoices in the browser.

## Features

- Choose a template: Classic, Modern, Minimal, Corporate
- Upload a company logo
- Auto-create a unique invoice ID (`INV-YYYYMMDD-SEQRAND`)
- Line items, tax, discount, currency
- Print the current invoice
- Invoice history stored in the browser
- Open or print any previous invoice

## Run locally

No build step. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Notes

- History and company profile (name, logo, tax rate) are saved in `localStorage`.
- Printing uses the browser print dialog. Choose "Save as PDF" if you need a file.
- Clearing site data removes invoice history on that browser.
