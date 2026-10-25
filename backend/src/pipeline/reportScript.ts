// The reports tool installed on the Factory computer as settle/tools/report-vN.py.
// It computes the P&L, cash flow and breakdowns from the settled ledger rows,
// draws the dashboard (report.html, inline SVG, no scripts) and the workbook
// (report.xlsx, native Excel charts), and writes report.json for the agent's
// commentary. The agent runs it; it never writes or edits it.
//
// ASCII-only (non-ASCII as \u escapes) so the upload size is exact. Avoid "$"
// followed by "{" (template literal).
//
// Colors: Pacioli's warm neutrals from the design tokens. Charts are ink
// (money in), warm grey (money out) and secondary ink (totals), so no hue
// competes with the decide orange.

export const REPORT_VERSION = 'v4';
export const REPORT_PATH = `settle/tools/report-${REPORT_VERSION}.py`;

export const REPORT_SCRIPT = String.raw`# settle-report v4 -- provided by Pacioli. Do not edit.
# Run: python3 /home/factory-user/settle/tools/report-v4.py /home/factory-user/settle
"""Build report.json, report.html and report.xlsx from the settled rows of ledger.json."""
import datetime
import html
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]

SETTLED = ("ok", "refunded")
DOCUMENT_KINDS = ("bill", "invoice")
HELD = ("review", "void", "following_up")
# Pacioli tokens, orange accent, light (design-system/src/tokens/tokens.css).
# Money is ink and paper: no hue, so nothing in the report reads like the
# decide orange.
IN_COLOR = "#1f1a14"    # money in: --color-text-primary
OUT_COLOR = "#8a7f72"   # money out: --color-border-strong
TOTAL_COLOR = "#5c5248" # totals: --color-text-secondary
SURFACE = "#f8f5f0"     # --color-bg-surface
CANVAS = "#ffffff"      # --color-bg-canvas
GRID = "#e8e1d7"        # --color-border-default
SUNKEN = "#f0ebe3"      # --color-bg-sunken
TEXT = "#1f1a14"        # --color-text-primary
TEXT_2 = "#5c5248"      # --color-text-secondary


def money(cents, whole=False):
    value = int(cents) / 100
    text = "$" + format(abs(value), ",.0f" if whole else ",.2f")
    return ("\u2212" + text) if value < 0 else text


def load_rows():
    path = HERE / "ledger.json"
    data = json.loads(path.read_text()) if path.exists() else {"rows": []}
    return data.get("rows", [])


# ------------------------------------------------------------- numbers -----

def summarize(rows):
    # Bills and invoices say who owes whom; the money moves in the bank rows
    # that pay them, so only cash rows count (no money counted twice)
    rows = [r for r in rows if r.get("kind") not in DOCUMENT_KINDS]
    settled = [r for r in rows if r.get("status", "ok") in SETTLED]
    held = [r for r in rows if r.get("status") in HELD]
    amt = lambda r: int(r.get("amount_cents", 0))

    revenue, costs = {}, {}
    for r in settled:
        cat = r.get("category") or "Other"
        if amt(r) >= 0:
            key = cat if cat.startswith("Revenue") else "Other income"
            revenue[key] = revenue.get(key, 0) + amt(r)
        else:
            costs[cat] = costs.get(cat, 0) - amt(r)
    total_rev = sum(revenue.values())
    total_cost = sum(costs.values())
    net = total_rev - total_cost

    days = {}
    for r in settled:
        d = str(r.get("date", ""))[:10] or "unknown"
        day = days.setdefault(d, [0, 0])
        if amt(r) >= 0:
            day[0] += amt(r)
        else:
            day[1] -= amt(r)
    running, cash = 0, []
    for d in sorted(days):
        running += days[d][0] - days[d][1]
        cash.append({"date": d, "in": days[d][0], "out": days[d][1], "cumulative": running})

    vendors = {}
    for r in settled:
        if amt(r) < 0:
            name = r.get("counterparty") or "Unknown"
            vendors[name] = vendors.get(name, 0) - amt(r)
    top_vendors = sorted(vendors.items(), key=lambda kv: -kv[1])[:8]

    tickets, ticket_gross, refunds = {}, 0, 0
    for r in settled:
        cat = r.get("category") or ""
        desc = r.get("description") or r.get("counterparty") or ""
        if cat.startswith("Revenue") and "ticket" in cat.lower() and amt(r) > 0:
            ticket_gross += amt(r)
            m = re.search(r"(\d+)\s*x\s+([A-Za-z][A-Za-z ]*?)(?:\s+-|$)", r.get("counterparty", "") + " " + desc)
            raw = m.group(2).lower().replace(" package", "").replace(" ticket", "").strip() if m else "other"
            kind = {"ga": "GA", "vip": "VIP", "early bird": "Early bird"}.get(raw, raw.capitalize())
            qty = int(m.group(1)) if m else 1
            tickets[kind] = tickets.get(kind, 0) + qty
        if amt(r) < 0 and "refund" in (desc + " " + cat).lower():
            refunds -= amt(r)

    held_by = {}
    for r in held:
        h = held_by.setdefault(r.get("status"), {"rows": 0, "amount_cents": 0})
        h["rows"] += 1
        h["amount_cents"] += amt(r)

    return {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "rows_included": len(settled),
        "rows_held": len(held),
        "held": held_by,
        "pnl": {
            "revenue": dict(sorted(revenue.items(), key=lambda kv: -kv[1])),
            "costs": dict(sorted(costs.items(), key=lambda kv: -kv[1])),
            "total_revenue": total_rev,
            "total_costs": total_cost,
            "net": net,
            "margin_pct": round(net * 100 / total_rev, 1) if total_rev else None,
        },
        "cash": cash,
        "top_vendors": [{"name": n, "spend": v} for n, v in top_vendors],
        "tickets": {"by_type": dict(sorted(tickets.items(), key=lambda kv: -kv[1])),
                    "gross": ticket_gross, "refunds": refunds},
    }


# --------------------------------------------------------------- charts ----

def esc(s):
    return html.escape(str(s))


def bar_path(x, y, w, h, end):
    """A bar with a 4px rounded data-end and a square base. end: right|left|top."""
    r = min(4, w / 2, h / 2)
    if w <= 0 or h <= 0:
        return ""
    if end == "right":
        return ("M%.1f,%.1f H%.1f Q%.1f,%.1f %.1f,%.1f V%.1f Q%.1f,%.1f %.1f,%.1f H%.1f Z"
                % (x, y, x + w - r, x + w, y, x + w, y + r, y + h - r, x + w, y + h, x + w - r, y + h, x))
    if end == "left":
        return ("M%.1f,%.1f H%.1f V%.1f H%.1f Q%.1f,%.1f %.1f,%.1f V%.1f Q%.1f,%.1f %.1f,%.1f Z"
                % (x + w, y, x + w, y + h, x + r, x, y + h, x, y + h - r, y + r, x, y, x + r, y))
    return ("M%.1f,%.1f V%.1f Q%.1f,%.1f %.1f,%.1f H%.1f Q%.1f,%.1f %.1f,%.1f V%.1f Z"
            % (x, y + h, y + r, x, y, x + r, y, x + w - r, x + w, y, x + w, y + r, y + h))


def svg_open(width, height, label):
    return ('<svg viewBox="0 0 %d %d" width="100%%" role="img" aria-label="%s">' % (width, height, esc(label)))


def hbar_chart(items, color, label, label_top=3, fmt=None):
    """Horizontal bars, largest first. Labels the top few; the table carries the rest."""
    if not items:
        return '<p class="empty">Nothing settled yet.</p>'
    fmt = fmt or (lambda v, short=False: money(v, short))
    width, name_w, row, thick, pad_r = 560, 180, 30, 20, 90
    height = row * len(items) + 8
    top = max(v for _, v in items) or 1
    span = width - name_w - pad_r
    out = [svg_open(width, height, label)]
    out.append('<line x1="%d" y1="0" x2="%d" y2="%d" stroke="%s" stroke-width="1"/>' % (name_w, name_w, height, GRID))
    for i, (name, v) in enumerate(items):
        y = 4 + i * row + (row - thick) / 2
        w = max(2, v / top * span)
        out.append('<text x="%d" y="%.1f" class="axis" text-anchor="end" dominant-baseline="middle">%s</text>'
                   % (name_w - 8, y + thick / 2, esc(name[:26])))
        out.append('<path d="%s" fill="%s"><title>%s: %s</title></path>'
                   % (bar_path(name_w + 1, y, w, thick, "right"), color, esc(name), fmt(v)))
        if i < label_top:
            out.append('<text x="%.1f" y="%.1f" class="value" dominant-baseline="middle">%s</text>'
                       % (name_w + w + 6, y + thick / 2, fmt(v, True)))
    out.append("</svg>")
    return "".join(out)


def waterfall(pnl):
    """Revenue steps up (blue), each cost steps down (orange), net is the total (ink)."""
    steps = [(k, v, "in") for k, v in pnl["revenue"].items()] + [(k, -v, "out") for k, v in pnl["costs"].items()]
    if not steps:
        return '<p class="empty">Nothing settled yet.</p>'
    steps.append(("Net", pnl["net"], "total"))
    width, name_w, row, thick, pad = 560, 180, 30, 20, 70
    height = row * len(steps) + 8
    running, lo, hi, spans = 0, 0, 0, []
    for name, delta, kind in steps:
        start, end = (0, delta) if kind == "total" else (running, running + delta)
        if kind != "total":
            running = end
        spans.append((name, delta, kind, start, end))
        lo, hi = min(lo, start, end), max(hi, start, end)
    scale = (width - name_w - pad * 2) / ((hi - lo) or 1)
    x0 = lambda v: name_w + pad + (v - lo) * scale
    out = [svg_open(width, height, "Profit and loss waterfall")]
    out.append('<line x1="%.1f" y1="0" x2="%.1f" y2="%d" stroke="%s" stroke-width="1"/>' % (x0(0), x0(0), height, GRID))
    colors = {"in": IN_COLOR, "out": OUT_COLOR, "total": TOTAL_COLOR}
    for i, (name, delta, kind, start, end) in enumerate(spans):
        y = 4 + i * row + (row - thick) / 2
        a, b = sorted((x0(start), x0(end)))
        end_side = "right" if end >= start else "left"
        out.append('<text x="%d" y="%.1f" class="axis%s" text-anchor="end" dominant-baseline="middle">%s</text>'
                   % (name_w - 8, y + thick / 2, " strong" if kind == "total" else "", esc(name[:26])))
        out.append('<path d="%s" fill="%s"><title>%s: %s</title></path>'
                   % (bar_path(a, y, max(2, b - a), thick, end_side), colors[kind], esc(name), money(delta)))
        if kind == "total" or abs(delta) == max(abs(s[1]) for s in spans if s[2] != "total"):
            lx, anchor = (b + 6, "start") if end >= start else (a - 6, "end")
            out.append('<text x="%.1f" y="%.1f" class="value%s" text-anchor="%s" dominant-baseline="middle">%s</text>'
                       % (lx, y + thick / 2, " strong" if kind == "total" else "", anchor, money(delta, True)))
    out.append("</svg>")
    return "".join(out)


def cash_line(cash):
    """Cumulative net cash over time: one 2px line, endpoint labeled."""
    if len(cash) < 2:
        return '<p class="empty">Needs at least two days of settled activity.</p>'
    width, height, left, right, top, bottom = 560, 220, 70, 90, 16, 28
    vals = [c["cumulative"] for c in cash]
    lo, hi = min(0, min(vals)), max(0, max(vals))
    span = (hi - lo) or 1
    xs = lambda i: left + i * (width - left - right) / (len(cash) - 1)
    ys = lambda v: top + (hi - v) / span * (height - top - bottom)
    out = [svg_open(width, height, "Cumulative net cash")]
    for v in sorted({lo, 0, hi}):
        out.append('<line x1="%d" y1="%.1f" x2="%d" y2="%.1f" stroke="%s" stroke-width="1"/>' % (left, ys(v), width - right, ys(v), GRID))
        out.append('<text x="%d" y="%.1f" class="axis" text-anchor="end" dominant-baseline="middle">%s</text>' % (left - 8, ys(v), money(v, True)))
    pts = " ".join("%.1f,%.1f" % (xs(i), ys(v)) for i, v in enumerate(vals))
    out.append('<polyline points="%s" fill="none" stroke="%s" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' % (pts, IN_COLOR))
    for i, c in enumerate(cash):
        out.append('<circle cx="%.1f" cy="%.1f" r="6" fill="transparent"><title>%s: %s (in %s, out %s)</title></circle>'
                   % (xs(i), ys(c["cumulative"]), c["date"], money(c["cumulative"]), money(c["in"]), money(c["out"])))
    last = len(cash) - 1
    out.append('<circle cx="%.1f" cy="%.1f" r="4" fill="%s" stroke="%s" stroke-width="2"/>' % (xs(last), ys(vals[-1]), IN_COLOR, SURFACE))
    out.append('<text x="%.1f" y="%.1f" class="value strong" dominant-baseline="middle">%s</text>' % (xs(last) + 10, ys(vals[-1]), money(vals[-1], True)))
    out.append('<text x="%d" y="%d" class="axis">%s</text>' % (left, height - 8, esc(cash[0]["date"])))
    out.append('<text x="%d" y="%d" class="axis" text-anchor="end">%s</text>' % (width - right, height - 8, esc(cash[-1]["date"])))
    out.append("</svg>")
    return "".join(out)


def table(headers, rows, num_cols=()):
    out = ['<details><summary>Show table</summary><table><thead><tr>']
    out += ['<th class="%s">%s</th>' % ("num" if i in num_cols else "", esc(h)) for i, h in enumerate(headers)]
    out.append("</tr></thead><tbody>")
    for r in rows:
        out.append("<tr>" + "".join('<td class="%s">%s</td>' % ("num" if i in num_cols else "", esc(v)) for i, v in enumerate(r)) + "</tr>")
    out.append("</tbody></table></details>")
    return "".join(out)


CSS = """
*{box-sizing:border-box}
body{margin:0;padding:20px 24px;background:%(surface)s;color:%(text)s;
  font:13px/1.45 Geist,system-ui,-apple-system,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums}
h1{font-size:20px;font-weight:500;margin:0}
.headline{margin:6px 0 18px;color:%(text2)s;max-width:900px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(520px,1fr));gap:20px}
.card{border:1px solid %(grid)s;border-radius:8px;padding:14px 16px;background:%(canvas)s}
.card h2{font-size:14px;font-weight:500;margin:0 0 2px}
.card p.sub{margin:0 0 10px;color:%(text2)s}
.legend{display:flex;gap:16px;margin:0 0 6px;color:%(text2)s}
.legend span::before{content:"";display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px;background:var(--c)}
svg text{font:12px Geist,system-ui,sans-serif;fill:%(text2)s}
svg text.value{fill:%(text)s}
svg text.strong{font-weight:600;fill:%(text)s}
details{margin-top:8px;color:%(text2)s}
summary{cursor:pointer}
table{width:100%%;border-collapse:collapse;margin-top:6px}
th,td{padding:3px 6px;border-bottom:1px solid %(sunken)s;text-align:left}
th{font-weight:500;color:%(text2)s}
.num{text-align:right}
.empty{color:%(text2)s}
""" % {"surface": SURFACE, "text": TEXT, "text2": TEXT_2, "grid": GRID, "canvas": CANVAS, "sunken": SUNKEN}


def render_html(s):
    p = s["pnl"]
    margin = ("%.1f%% margin" % p["margin_pct"]) if p["margin_pct"] is not None else "no revenue yet"
    held_rows = s["rows_held"]
    held_amt = sum(h["amount_cents"] for h in s["held"].values())
    headline = ("Net %s on %s revenue and %s costs (%s), from %d settled rows. Held back %d %s (%s) "
                "pending review, voided or being followed up."
                % (money(p["net"], True), money(p["total_revenue"], True), money(p["total_costs"], True), margin,
                   s["rows_included"], held_rows, "row" if held_rows == 1 else "rows", money(held_amt, True)))

    rev_items = list(p["revenue"].items())
    cost_items = list(p["costs"].items())
    cats = [("in", k, v) for k, v in rev_items] + [("out", k, v) for k, v in cost_items]
    tix = s["tickets"]
    cards = [
        ("Profit and loss", "Revenue steps up, each cost steps down, ending at net.",
         '<div class="legend"><span style="--c:%s">Money in</span><span style="--c:%s">Money out</span>'
         '<span style="--c:%s">Net</span></div>' % (IN_COLOR, OUT_COLOR, TOTAL_COLOR) + waterfall(p)
         + table(["Line", "Amount"], [(k, money(v)) for k, v in rev_items] + [(k, money(-v)) for k, v in cost_items]
                 + [("Net", money(p["net"]))], (1,))),
        ("Cash position", "Cumulative net cash by day.", cash_line(s["cash"])
         + table(["Date", "In", "Out", "Cumulative"], [(c["date"], money(c["in"]), money(-c["out"]), money(c["cumulative"])) for c in s["cash"]], (1, 2, 3))),
        ("Costs by category", "Where the money went.", hbar_chart(cost_items, OUT_COLOR, "Costs by category")
         + table(["Category", "Spend"], [(k, money(v)) for k, v in cost_items], (1,))),
        ("Revenue by category", "Where the money came from.", hbar_chart(rev_items, IN_COLOR, "Revenue by category")
         + table(["Category", "Revenue"], [(k, money(v)) for k, v in rev_items], (1,))),
        ("Top vendors", "Largest settled spend by counterparty.",
         hbar_chart([(v["name"], v["spend"]) for v in s["top_vendors"]], OUT_COLOR, "Top vendors by spend")
         + table(["Vendor", "Spend"], [(v["name"], money(v["spend"])) for v in s["top_vendors"]], (1,))),
        ("Tickets", "Tickets sold by type. Gross %s, refunds %s." % (money(tix["gross"]), money(-tix["refunds"])),
         hbar_chart(list(tix["by_type"].items()), IN_COLOR, "Tickets sold by type",
                    fmt=lambda v, short=False: "%d ticket%s" % (v, "" if v == 1 else "s"))
         + table(["Type", "Tickets"], [(k, v) for k, v in tix["by_type"].items()], (1,))),
    ]
    body = "".join('<section class="card"><h2>%s</h2><p class="sub">%s</p>%s</section>' % (esc(t), esc(sub), html_) for t, sub, html_ in cards)
    return ("<!doctype html><html><head><meta charset='utf-8'><title>Show report</title><style>%s</style></head><body>"
            "<h1>Show report \u00b7 Oct 25</h1><p class='headline'>%s</p><div class='grid'>%s</div></body></html>"
            % (CSS, esc(headline), body))


# ----------------------------------------------------------------- xlsx ----

def ensure_openpyxl():
    import importlib
    import site
    try:
        import openpyxl  # noqa: F401
        return
    except ImportError:
        pass
    pip = [sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check"]
    for extra in (["--user", "--break-system-packages"], ["--break-system-packages"], ["--user"], []):
        if subprocess.run(pip + extra + ["openpyxl"], capture_output=True).returncode == 0:
            break
    if site.getusersitepackages() not in sys.path:
        sys.path.append(site.getusersitepackages())
    importlib.invalidate_caches()


def render_xlsx(s):
    ensure_openpyxl()
    from openpyxl import Workbook
    from openpyxl.chart import BarChart, LineChart, Reference
    from openpyxl.styles import Border, Font, Side

    fmt = '"$"#,##0.00;[Red]-"$"#,##0.00'
    bold = Font(bold=True)
    under = Border(bottom=Side(style="thin", color="808080"))
    top2 = Border(top=Side(style="double", color="404040"))
    p = s["pnl"]

    def header(ws, names, widths):
        ws.append(names)
        for i, (c, w) in enumerate(zip(ws[1], widths), start=1):
            c.font = bold
            c.border = under
            ws.column_dimensions[c.column_letter].width = w
        ws.freeze_panes = "A2"

    def bar(ws, title, n, color, col=2, anchor="D2"):
        if n == 0:
            return
        ch = BarChart()
        ch.type = "bar"
        ch.title = title
        ch.legend = None
        ch.add_data(Reference(ws, min_col=col, min_row=1, max_row=n + 1), titles_from_data=True)
        ch.set_categories(Reference(ws, min_col=1, min_row=2, max_row=n + 1))
        ch.series[0].graphicalProperties.solidFill = color.lstrip("#")
        ch.height, ch.width = 8, 16
        ws.add_chart(ch, anchor)

    wb = Workbook()
    ws = wb.active
    ws.title = "P&L"
    header(ws, ["Line", "Amount"], [34, 16])
    ws.append(["Revenue", None])
    ws["A2"].font = bold
    start = ws.max_row + 1
    for k, v in p["revenue"].items():
        ws.append(["  " + k, v / 100])
    rev_end = ws.max_row
    ws.append(["Total revenue", "=SUM(B%d:B%d)" % (start, rev_end) if rev_end >= start else 0])
    rev_total = ws.max_row
    ws.append([])
    ws.append(["Costs", None])
    ws.cell(ws.max_row, 1).font = bold
    cstart = ws.max_row + 1
    for k, v in p["costs"].items():
        ws.append(["  " + k, -v / 100])
    cend = ws.max_row
    ws.append(["Total costs", "=SUM(B%d:B%d)" % (cstart, cend) if cend >= cstart else 0])
    cost_total = ws.max_row
    ws.append([])
    ws.append(["Net profit", "=B%d+B%d" % (rev_total, cost_total)])
    net_row = ws.max_row
    ws.append(["Margin", "=IF(B%d=0,\"\",B%d/B%d)" % (rev_total, net_row, rev_total)])
    for r in range(2, ws.max_row + 1):
        ws.cell(r, 2).number_format = fmt
    ws.cell(ws.max_row, 2).number_format = "0.0%"
    for r in (rev_total, cost_total, net_row):
        ws.cell(r, 1).font = bold
        ws.cell(r, 2).font = bold
    ws.cell(net_row, 1).border = top2
    ws.cell(net_row, 2).border = top2
    ws.append([])
    ws.append(["Settled rows included", s["rows_included"]])
    ws.append(["Rows held back (review, void, following up)", s["rows_held"]])

    cf = wb.create_sheet("Cash flow")
    header(cf, ["Date", "Money in", "Money out", "Net", "Cumulative"], [12, 14, 14, 14, 14])
    for i, c in enumerate(s["cash"], start=2):
        try:
            d = datetime.date.fromisoformat(c["date"])
        except ValueError:
            d = c["date"]
        cf.append([d, c["in"] / 100, -c["out"] / 100, "=B%d+C%d" % (i, i), "=D%d" % i if i == 2 else "=E%d+D%d" % (i - 1, i)])
        for col in range(2, 6):
            cf.cell(i, col).number_format = fmt
        cf.cell(i, 1).number_format = "yyyy-mm-dd"
    if len(s["cash"]) >= 2:
        ln = LineChart()
        ln.title = "Cumulative net cash"
        ln.legend = None
        ln.add_data(Reference(cf, min_col=5, min_row=1, max_row=len(s["cash"]) + 1), titles_from_data=True)
        ln.set_categories(Reference(cf, min_col=1, min_row=2, max_row=len(s["cash"]) + 1))
        ln.series[0].graphicalProperties.line.solidFill = IN_COLOR.lstrip("#")
        ln.series[0].graphicalProperties.line.width = 25400
        ln.height, ln.width = 8, 16
        cf.add_chart(ln, "G2")

    bc = wb.create_sheet("Costs by category")
    header(bc, ["Category", "Spend"], [32, 14])
    for k, v in p["costs"].items():
        bc.append([k, v / 100])
        bc.cell(bc.max_row, 2).number_format = fmt
    bar(bc, "Costs by category", len(p["costs"]), OUT_COLOR)

    tv = wb.create_sheet("Top vendors")
    header(tv, ["Vendor", "Spend"], [32, 14])
    for v in s["top_vendors"]:
        tv.append([v["name"], v["spend"] / 100])
        tv.cell(tv.max_row, 2).number_format = fmt
    bar(tv, "Top vendors by spend", len(s["top_vendors"]), OUT_COLOR)

    tk = wb.create_sheet("Tickets")
    header(tk, ["Type", "Tickets"], [24, 12])
    for k, v in s["tickets"]["by_type"].items():
        tk.append([k, v])
    bar(tk, "Tickets sold by type", len(s["tickets"]["by_type"]), IN_COLOR)
    tk.cell(tk.max_row + 2, 1, "Ticket gross")
    tk.cell(tk.max_row, 2, s["tickets"]["gross"] / 100).number_format = fmt
    tk.cell(tk.max_row + 1, 1, "Refunds")
    tk.cell(tk.max_row, 2, -s["tickets"]["refunds"] / 100).number_format = fmt

    wb.save(HERE / "report.xlsx")


def main():
    summary = summarize(load_rows())
    (HERE / "report.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    (HERE / "report.html").write_text(render_html(summary), encoding="utf-8")
    try:
        render_xlsx(summary)
        xlsx = "report.xlsx"
    except Exception as err:
        xlsx = "report.xlsx failed: %s" % err
    print(json.dumps({"rows_included": summary["rows_included"], "rows_held": summary["rows_held"],
                      "net": summary["pnl"]["net"], "xlsx": xlsx}))


if __name__ == "__main__":
    main()
`;
