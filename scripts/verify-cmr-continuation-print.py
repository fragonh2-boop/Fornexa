#!/usr/bin/env python3
"""Manual Chromium harness for CMR continuation printing.

Synthetic fixture only: no FORNEXA authentication and no customer data.
Requires Python Playwright, pypdf and a Chromium binary.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright
from pypdf import PdfReader

COLUMNS = ["6 Marcas y números", "7 Nº bultos", "8 Embalaje", "9 Naturaleza", "10 N.º estadístico", "11 Peso bruto", "12 Volumen"]
CSS = r"""
@page{size:A4 portrait;margin:9mm}*{box-sizing:border-box}html,body{margin:0;font-family:Arial,sans-serif}.paper{width:192mm;max-width:192mm;min-height:279mm;height:auto;max-height:none;overflow:visible;border:1px solid #000;display:flex;flex-direction:column}.paperHeader{display:grid;grid-template-columns:1fr 44mm;flex:0 0 auto;border-bottom:2px solid #26354a;break-inside:avoid}.paperHeader>div{padding:4px 6px}.paperHeader strong{font-size:9px}.paperHeader span{display:block;font-size:5.5px}.documentNumber{border-left:1px solid #26354a}.gridTwo,.gridTwoBottom{display:grid;grid-template-columns:1fr 1fr}.gridTwo{flex:5 1 0;grid-auto-rows:minmax(18mm,1fr)}.gridTwoBottom{flex:2 1 0;grid-auto-rows:minmax(18mm,1fr)}.gridTwo article,.gridTwoBottom article{padding:4px 5px 3px 18px;border-right:1px solid #26354a;border-bottom:1px solid #26354a;font-size:5.8px;overflow-wrap:anywhere;break-inside:avoid}.gridTwo article:nth-child(even),.gridTwoBottom article:nth-child(even){border-right:0}.goods{flex:0 0 auto;width:100%;table-layout:fixed;border-collapse:collapse;border-spacing:0;border-bottom:1px solid #26354a}.goods thead{display:table-header-group}.goods tbody{display:table-row-group}.goodsIdentity{display:table-row}.goodsIdentity th{padding:1.1mm 2mm .8mm;background:#fff;border-bottom:1px solid #26354a;font-size:4.8px;font-weight:800;text-transform:uppercase;text-align:left}.goodsHead{break-inside:avoid}.goodsHead th{background:#eef2f7;font-size:4.8px;padding:3px 2px;text-transform:uppercase;text-align:left;border-right:1px solid #26354a}.goodsRow{break-inside:avoid;page-break-inside:avoid}.goodsRow td{height:10mm;padding:3px 2px;font-size:5.5px;line-height:1.05;vertical-align:top;overflow-wrap:anywhere;border-right:1px solid #26354a}.goodsHead th:last-child,.goodsRow td:last-child{border-right:0}.goodsHead th:nth-child(1){width:17.48%}.goodsHead th:nth-child(2){width:9.62%}.goodsHead th:nth-child(3){width:13.11%}.goodsHead th:nth-child(4){width:23.60%}.goodsHead th:nth-child(5){width:12.24%}.goodsHead th:nth-child(6){width:12.59%}.goodsHead th:nth-child(7){width:11.36%}.adrBox{flex:0 0 auto;padding:3px 5px;font-size:5.2px;border-bottom:1px solid #26354a;break-inside:avoid}.signatures{display:grid;grid-template-columns:repeat(3,1fr);flex:0 0 32mm;break-inside:avoid}.signatures article{padding:4px;font-size:5.5px;border-right:1px solid #26354a}.paperFooter{flex:0 0 auto;padding:3px 5px;font-size:4.8px;border-top:1px solid #26354a;break-inside:avoid}
"""


def goods(count: int, long_row: bool) -> str:
    rows = []
    for i in range(1, count + 1):
        desc = f"Mercancía de prueba {i}"
        if long_row and i == count // 2:
            desc = " ".join(["DESCRIPCIÓN-LARGA-DE-PRUEBA"] * 45)
        rows.append(f"<tr class='goodsRow'><td>MK-{i}</td><td>{i}</td><td>PAL</td><td>{desc}</td><td>STAT-{i}</td><td>{100+i} kg</td><td>{i/10:.1f} m³</td></tr>")
    return "".join(rows)


def fixture(cmr: str, count: int, long_row: bool) -> str:
    heads = "".join(f"<th scope='col'>{value}</th>" for value in COLUMNS)
    top = "".join(f"<article>Bloque superior {i}<br>Contenido de prueba</article>" for i in range(1, 11))
    bottom = "".join(f"<article>Bloque final {i}</article>" for i in range(13, 17))
    return f"""<!doctype html><meta charset='utf-8'><style>{CSS}</style><section class='paper'><div class='paperHeader'><div><strong>CARTA DE PORTE INTERNACIONAL</strong><span>Convention relative au contrat de transport international de marchandises par route (CMR)</span></div><div class='documentNumber'><span>N.º CMR</span><strong>{cmr}</strong></div></div><div class='gridTwo'>{top}</div><table class='goods'><thead><tr class='goodsIdentity'><th scope='colgroup' colspan='7'>CMR {cmr} · Mercancías</th></tr><tr class='goodsHead'>{heads}</tr></thead><tbody>{goods(count,long_row)}</tbody></table><section class='adrBox'><strong>MERCANCÍA PELIGROSA (ADR)</strong><p>Sin ADR en este fixture.</p></section><div class='gridTwoBottom'>{bottom}</div><section class='signatures'><article>22 Firma expedidor</article><article>23 Firma transportista</article><article>24 Firma destinatario</article></section><footer class='paperFooter'>Generado por FORNEXA · {cmr}</footer></section>"""


def verify(browser, out: Path, name: str, rows: int, long_row: bool, expected_pages: int) -> dict:
    cmr = f"TEST-{name.upper()}"
    page = browser.new_page()
    page.set_content(fixture(cmr, rows, long_row), wait_until="load")
    page.emulate_media(media="print")
    pdf = out / f"cmr-{name}.pdf"
    page.pdf(path=str(pdf), format="A4", print_background=True, prefer_css_page_size=True, display_header_footer=False)
    page.close()
    texts = [(p.extract_text() or "") for p in PdfReader(str(pdf)).pages]
    if len(texts) != expected_pages:
        raise AssertionError(f"{name}: expected {expected_pages} pages, got {len(texts)}")
    joined = "\n".join(texts)
    missing = [i for i in range(1, rows + 1) if not re.search(rf"\bMK-{i}\b", joined)]
    if missing:
        raise AssertionError(f"{name}: missing markers {missing}")
    goods_pages = [i + 1 for i, text in enumerate(texts) if re.search(r"\bMK-\d+\b", text)]
    for i in goods_pages:
        rendered = texts[i - 1].upper()
        if f"CMR {cmr} · MERCANCÍAS" not in rendered or "6 MARCAS Y NÚMEROS" not in rendered:
            raise AssertionError(f"{name}: repeated heading missing on page {i}")
    if any(not text.strip() for text in texts):
        raise AssertionError(f"{name}: blank page detected")
    return {"name": name, "rows": rows, "pages": len(texts), "goods_pages": goods_pages, "sha256": hashlib.sha256(pdf.read_bytes()).hexdigest()}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--out-dir", default="/tmp/fornexa-cmr-print")
    args = parser.parse_args()
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    print(subprocess.check_output([args.chromium, "--version"], text=True).strip())
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=args.chromium, args=["--no-sandbox"])
        try:
            results = [verify(browser, out, "normal", 2, False, 1), verify(browser, out, "42", 42, False, 3), verify(browser, out, "42-longrow", 42, True, 3), verify(browser, out, "80", 80, False, 5)]
        finally:
            browser.close()
    for result in results:
        print(f"{result['name']}: rows={result['rows']} pages={result['pages']} goods_pages={result['goods_pages']} sha256={result['sha256']}")


if __name__ == "__main__":
    main()
