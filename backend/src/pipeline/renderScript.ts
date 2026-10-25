// The ledger renderer installed on the Factory computer as settle/render.py.
// The agent runs it; it never writes or edits it. Bump RENDER_VERSION when the
// script changes and the pipeline re-installs it before the next run.
//
// Kept ASCII-only (non-ASCII is written as \u escapes) so its byte size equals
// its length for the upload. Avoid "$" followed by "{" (template literal).

export const RENDER_VERSION = 'v6';
// Versioned name: Factory's upload won't overwrite an existing file, and an
// older agent-written settle/render.py may still be on the computer
export const RENDER_PATH = `settle/tools/render-${RENDER_VERSION}.py`;

export const RENDER_SCRIPT = String.raw`# settle-render v6 -- provided by Settle. Do not edit.
# Run: python3 /home/factory-user/settle/tools/render-v6.py /home/factory-user/settle
"""Render settle/ledger.json into ledger.html (an Excel-style window) and ledger.xlsx."""
import datetime
import html
import json
import subprocess
import sys
from pathlib import Path

# The ledger folder: first argument, or the parent of this tools/ folder
HERE = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]

COLUMNS = [
    ("#", 44), ("Date", 92), ("Source", 74), ("Counterparty", 180), ("Description", 230),
    ("Category", 190), ("Amount", 104), ("Status", 96), ("Note", 300),
]
STATUS_LABEL = {
    "ok": "\u2713 OK",
    "void": "\u2715 Void",
    "review": "! Review",
    "refunded": "\u21ba Refunded",
    "following_up": "\u2709 Following up",
}
SOURCE_LABEL = {"nessie": "Nessie", "stripe": "Stripe", "ledger": "QuickBooks"}
FILLS = {
    "void": ("FFC7CE", "9C0006"),
    "review": ("FFEB9C", "9C5700"),
    "refunded": ("EDEDED", "404040"),
    "following_up": ("DDEBF7", "1F4E78"),
}


def money(cents):
    value = int(cents) / 100
    text = "$" + format(abs(value), ",.2f")
    return ("\u2212" + text) if value < 0 else text


def letter(n):
    out = ""
    while n:
        n, rem = divmod(n - 1, 26)
        out = chr(65 + rem) + out
    return out


def load_rows():
    path = HERE / "ledger.json"
    data = json.loads(path.read_text()) if path.exists() else {"rows": []}
    rows = data.get("rows", [])
    return sorted(rows, key=lambda r: int(r.get("row", 0)))


def cells(row, with_recommendation=False):
    status = row.get("status", "ok")
    values = [
        str(row.get("row", "")),
        str(row.get("date", "")),
        SOURCE_LABEL.get(row.get("source", ""), row.get("source", "")),
        row.get("counterparty", ""),
        row.get("description", ""),
        row.get("category", ""),
        money(row.get("amount_cents", 0)),
        STATUS_LABEL.get(status, status),
        row.get("note", "") or "",
    ]
    if with_recommendation:
        values.append((row.get("recommendation") or "").replace("_", " ").capitalize())
    return values


# ---------------------------------------------------------------- HTML -------

CSS = """
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{display:flex;flex-direction:column;font:12px Aptos,Calibri,"Segoe UI",system-ui,sans-serif;
  color:#1f1f1f;background:#fff;font-variant-numeric:tabular-nums}
input.tab{display:none}
.sheets{flex:1;min-height:0;position:relative}
.sheet{display:none;position:absolute;inset:0;flex-direction:column}
#t1:checked~.sheets .s1,#t2:checked~.sheets .s2,#t3:checked~.sheets .s3{display:flex}
.fx{height:28px;flex:none;display:flex;align-items:center;border-bottom:1px solid #d4d4d4;background:#fff}
.fx .name{width:72px;height:100%;display:flex;align-items:center;padding:0 8px;border-right:1px solid #d4d4d4}
.fx .f{width:36px;text-align:center;font-style:italic;color:#666;border-right:1px solid #d4d4d4}
.fx .formula{padding:0 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.grid{flex:1;overflow:auto}
table{border-collapse:separate;border-spacing:0;table-layout:fixed}
th,td{height:21px;padding:0 6px;border-right:1px solid #e1e1e1;border-bottom:1px solid #e1e1e1;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
thead th{position:sticky;top:0;z-index:2;background:#f3f3f3;color:#444;font-weight:400;font-size:11px;
  height:20px;text-align:center;border-color:#d4d4d4}
th.rn{position:sticky;left:0;z-index:1;background:#f3f3f3;color:#444;font-weight:400;font-size:11px;
  text-align:right;border-color:#d4d4d4;width:40px}
thead th.corner{left:0;z-index:3}
thead th.on{background:#d3f0e0;color:#107c41;border-bottom:2px solid #107c41}
th.rn.on{background:#d3f0e0;color:#107c41;border-right:2px solid #107c41}
tr.hdr td{font-weight:700;background:#fff}
td.a1{outline:2px solid #107c41;outline-offset:-2px}
td.num{text-align:right}
tr.void td{background:#ffc7ce;color:#9c0006}
tr.void td.num{text-decoration:line-through}
tr.review td{background:#ffeb9c;color:#9c5700}
tr.refunded td{background:#ededed;color:#404040}
tr.following_up td{background:#ddebf7;color:#1f4e78}
tr.total td{font-weight:700;border-top:3px double #444}
.tabs{height:28px;flex:none;display:flex;align-items:stretch;background:#f3f3f3;border-top:1px solid #d4d4d4;
  padding-left:44px}
.tabs label{display:flex;align-items:center;padding:0 16px;color:#444;cursor:pointer;
  border-right:1px solid #d4d4d4}
#t1:checked~.tabs label[for=t1],#t2:checked~.tabs label[for=t2],#t3:checked~.tabs label[for=t3]{
  background:#fff;color:#107c41;font-weight:700;box-shadow:inset 0 -2px 0 #107c41}
.status{height:22px;flex:none;display:flex;align-items:center;justify-content:space-between;
  padding:0 10px;background:#107c41;color:#fff;font-size:11px}
.status span+span{margin-left:16px}
"""


def html_grid(headers, rows, widths, total=None, num_cols=()):
    ncols = len(headers)
    out = ['<div class="grid"><table><colgroup><col style="width:40px">']
    out += ['<col style="width:%dpx">' % w for w in widths]
    out.append('</colgroup><thead><tr><th class="corner rn"></th>')
    out += ['<th class="%s">%s</th>' % ("on" if i == 0 else "", letter(i + 1)) for i in range(ncols)]
    out.append("</tr></thead><tbody>")
    out.append('<tr class="hdr"><th class="rn on">1</th>')
    out += ['<td class="%s%s">%s</td>' % ("a1 " if i == 0 else "", "num" if i in num_cols else "", html.escape(h))
            for i, h in enumerate(headers)]
    out.append("</tr>")
    for n, (values, cls) in enumerate(rows, start=2):
        out.append('<tr class="%s"><th class="rn">%d</th>' % (cls, n))
        out += ['<td class="%s" title="%s">%s</td>' % ("num" if i in num_cols else "", html.escape(str(v)), html.escape(str(v)))
                for i, v in enumerate(values)]
        out.append("</tr>")
    if total is not None:
        n = len(rows) + 3
        out.append('<tr><th class="rn">%d</th>%s</tr>' % (n - 1, "<td></td>" * ncols))
        out.append('<tr class="total"><th class="rn">%d</th>' % n)
        out += ['<td class="%s">%s</td>' % ("num" if i in num_cols else "", html.escape(str(v))) for i, v in enumerate(total)]
        out.append("</tr>")
    out.append("</tbody></table></div>")
    return "".join(out)


def fx(name, formula):
    return ('<div class="fx"><div class="name">%s</div><div class="f">fx</div>'
            '<div class="formula">%s</div></div>') % (html.escape(name), html.escape(formula))


def summary_rows(rows):
    by_cat = {}
    for r in rows:
        if r.get("status") == "void":
            continue
        c = by_cat.setdefault(r.get("category") or "Other", [0, 0, 0])
        amount = int(r.get("amount_cents", 0))
        c[0] += 1
        if amount >= 0:
            c[1] += amount
        else:
            c[2] += amount
    return sorted(by_cat.items())


def render_html(rows):
    headers = [c[0] for c in COLUMNS]
    widths = [c[1] for c in COLUMNS]
    n = len(rows)
    counted = [r for r in rows if r.get("status") != "void"]
    total_in = sum(int(r["amount_cents"]) for r in counted if int(r["amount_cents"]) > 0)
    total_out = sum(int(r["amount_cents"]) for r in counted if int(r["amount_cents"]) < 0)
    net = total_in + total_out
    last = n + 1

    ledger_rows = [(cells(r), r.get("status", "ok")) for r in rows]
    ledger_total = ["", "", "", "Total", "", "In " + money(total_in) + " \u00b7 Out " + money(total_out), money(net), "", ""]
    review = [r for r in rows if r.get("status") == "review"]
    review_rows = [(cells(r, True), "review") for r in review]
    cats = summary_rows(rows)
    summary = [((cat, str(v[0]), money(v[1]), money(v[2]), money(v[1] + v[2])), "") for cat, v in cats]
    summary_total = ("Total", str(sum(v[0] for _, v in cats)), money(total_in), money(total_out), money(net))

    return "".join([
        "<!doctype html><html><head><meta charset='utf-8'><title>Master ledger</title><style>", CSS,
        "</style></head><body>",
        '<input class="tab" type="radio" name="tab" id="t1" checked>',
        '<input class="tab" type="radio" name="tab" id="t2">',
        '<input class="tab" type="radio" name="tab" id="t3">',
        '<div class="sheets">',
        '<section class="sheet s1">', fx("G%d" % (last + 2), "=SUM(G2:G%d)" % max(last, 2)),
        html_grid(headers, ledger_rows, widths, ledger_total, num_cols=(6,)), "</section>",
        '<section class="sheet s2">', fx("J1", "Recommended action"),
        html_grid(headers + ["Recommended action"], review_rows, widths + [150], None, num_cols=(6,)), "</section>",
        '<section class="sheet s3">', fx("B2", "=COUNTIF(Ledger!F:F,A2)"),
        html_grid(["Category", "Rows", "Money in", "Money out", "Net"], summary, [220, 70, 120, 120, 120],
                  summary_total, num_cols=(1, 2, 3, 4)), "</section>",
        "</div>",
        '<nav class="tabs"><label for="t1">Ledger</label><label for="t2">Needs review (%d)</label>'
        '<label for="t3">Summary</label></nav>' % len(review),
        '<div class="status"><span>Ready</span><span><span>Count: %d</span><span>Sum: %s</span></span></div>'
        % (n, money(net)),
        "</body></html>",
    ])


# ---------------------------------------------------------------- XLSX -------

def ensure_openpyxl():
    """Import openpyxl, installing it on first use. System Pythons block plain
    pip installs (PEP 668), so try the usual ways in turn."""
    import importlib
    import site
    try:
        import openpyxl  # noqa: F401
        return
    except ImportError:
        pass
    pip = [sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check"]
    attempts = [
        pip + ["--user", "--break-system-packages", "openpyxl"],
        pip + ["--break-system-packages", "openpyxl"],
        pip + ["--user", "openpyxl"],
        pip + ["openpyxl"],
    ]
    if subprocess.run([sys.executable, "-m", "pip", "--version"], capture_output=True).returncode != 0:
        subprocess.run([sys.executable, "-m", "ensurepip", "--user"], capture_output=True)
    errors = []
    for cmd in attempts:
        done = subprocess.run(cmd, capture_output=True, text=True)
        if done.returncode == 0:
            break
        errors.append((done.stderr or done.stdout).strip().splitlines()[-1:] or ["?"])
    user_site = site.getusersitepackages()
    if user_site not in sys.path:
        sys.path.append(user_site)
    importlib.invalidate_caches()
    try:
        import openpyxl  # noqa: F401
    except ImportError:
        raise RuntimeError("could not install openpyxl: %s" % "; ".join(e[0] for e in errors))


def render_xlsx(rows):
    ensure_openpyxl()
    from openpyxl import Workbook
    from openpyxl.formatting.rule import FormulaRule
    from openpyxl.styles import Border, Font, PatternFill, Side

    money_fmt = '"$"#,##0.00;[Red]-"$"#,##0.00'
    bold = Font(bold=True)
    under = Border(bottom=Side(style="thin", color="808080"))

    wb = Workbook()
    ws = wb.active
    ws.title = "Ledger"
    headers = [c[0] for c in COLUMNS]
    ws.append(headers)
    for r in rows:
        values = cells(r)
        try:
            date = datetime.date.fromisoformat(str(r.get("date", ""))[:10])
        except ValueError:
            date = r.get("date", "")
        ws.append([int(r.get("row", 0)), date, values[2], values[3], values[4], values[5],
                   int(r.get("amount_cents", 0)) / 100, values[7], values[8]])
    last = max(len(rows) + 1, 2)
    for row in ws.iter_rows(min_row=2, max_row=last):
        row[1].number_format = "yyyy-mm-dd"
        row[6].number_format = money_fmt
    total_row = last + 2
    ws.cell(total_row, 4, "Total").font = bold
    ws.cell(total_row, 7, "=SUMIF(H2:H%d,\"<>\u2715 Void\",G2:G%d)" % (last, last)).number_format = money_fmt
    ws.cell(total_row, 7).font = bold
    ws.cell(total_row + 1, 4, "Money in")
    ws.cell(total_row + 1, 7, "=SUMIFS(G2:G%d,G2:G%d,\">0\",H2:H%d,\"<>\u2715 Void\")" % (last, last, last)).number_format = money_fmt
    ws.cell(total_row + 2, 4, "Money out")
    ws.cell(total_row + 2, 7, "=SUMIFS(G2:G%d,G2:G%d,\"<0\",H2:H%d,\"<>\u2715 Void\")" % (last, last, last)).number_format = money_fmt

    def style_sheet(sheet, widths, last_row):
        for i, w in enumerate(widths, start=1):
            sheet.column_dimensions[letter(i)].width = max(8, w / 7)
        for cell in sheet[1]:
            cell.font = bold
            cell.border = under
        sheet.freeze_panes = "A2"
        span = "A2:%s%d" % (letter(len(widths)), max(last_row, 2))
        for status, (fill, font) in FILLS.items():
            label = STATUS_LABEL[status]
            sheet.conditional_formatting.add(span, FormulaRule(
                formula=['$H2="%s"' % label],
                fill=PatternFill(start_color=fill, end_color=fill, fill_type="solid"),
                font=Font(color=font)))

    style_sheet(ws, [c[1] for c in COLUMNS], last)

    rv = wb.create_sheet("Needs review")
    rv.append(headers + ["Recommended action"])
    review = [r for r in rows if r.get("status") == "review"]
    for r in review:
        values = cells(r, True)
        rv.append([int(r.get("row", 0)), values[1], values[2], values[3], values[4], values[5],
                   int(r.get("amount_cents", 0)) / 100, values[7], values[8], values[9]])
        rv.cell(rv.max_row, 7).number_format = money_fmt
    style_sheet(rv, [c[1] for c in COLUMNS] + [150], len(review) + 1)

    sm = wb.create_sheet("Summary")
    sm.append(["Category", "Rows", "Money in", "Money out", "Net"])
    cats = summary_rows(rows)
    rng = "Ledger!$%s$2:$%s$" + str(last)
    for i, (cat, _) in enumerate(cats, start=2):
        cat_rng, amt_rng, st_rng = rng % ("F", "F"), rng % ("G", "G"), rng % ("H", "H")
        not_void = '"<>\u2715 Void"'
        sm.append([
            cat,
            "=COUNTIFS(%s,A%d,%s,%s)" % (cat_rng, i, st_rng, not_void),
            "=SUMIFS(%s,%s,A%d,%s,\">0\",%s,%s)" % (amt_rng, cat_rng, i, amt_rng, st_rng, not_void),
            "=SUMIFS(%s,%s,A%d,%s,\"<0\",%s,%s)" % (amt_rng, cat_rng, i, amt_rng, st_rng, not_void),
            "=C%d+D%d" % (i, i),
        ])
    end = len(cats) + 1
    sm.append(["Total", "=SUM(B2:B%d)" % max(end, 2), "=SUM(C2:C%d)" % max(end, 2),
               "=SUM(D2:D%d)" % max(end, 2), "=SUM(E2:E%d)" % max(end, 2)])
    for row in sm.iter_rows(min_row=2, max_row=sm.max_row):
        for cell in row[2:]:
            cell.number_format = money_fmt
    for cell in sm[sm.max_row]:
        cell.font = bold
    for i, w in enumerate([220, 70, 120, 120, 120], start=1):
        sm.column_dimensions[letter(i)].width = w / 7
    for cell in sm[1]:
        cell.font = bold
        cell.border = under
    sm.freeze_panes = "A2"

    wb.save(HERE / "ledger.xlsx")


def main():
    rows = load_rows()
    (HERE / "ledger.html").write_text(render_html(rows), encoding="utf-8")
    try:
        render_xlsx(rows)
        xlsx = "ledger.xlsx"
    except Exception as err:  # the HTML still renders if openpyxl is unavailable
        xlsx = "ledger.xlsx failed: %s" % err
    print(json.dumps({"rows": len(rows), "html": "ledger.html", "xlsx": xlsx}))


if __name__ == "__main__":
    main()
`;
