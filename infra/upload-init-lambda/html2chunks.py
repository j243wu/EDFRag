#!/usr/bin/env python3
# confluence_html_to_chunks.py (patched v3)
# HTML → Clean text & tables → Chunks → JSONL with metadata
# Config-driven (no CLI). Edit the CONFIG dict below.

import json
import re
import sys
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

from urllib.parse import quote
from bs4 import BeautifulSoup, NavigableString, Tag

# =========================
# CONFIG: EDIT THESE VALUES
# =========================
CONFIG: Dict[str, Any] = {
    # Input folder containing Confluence-exported HTML pages
    "input_dir": "./knowledgeBase2/html",
    # Output JSONL file (one line per chunk). Will be created if missing.
    "output_jsonl": "./knowledgeBase2/edf_kb_chunks.jsonl",
    # Glob pattern to find HTML files under input_dir (recursive)
    "glob": "**/*.htm*",

    # Text chunking (approximate tokens; heuristic ~4 chars/token)
    "chunk_tokens": 800,          # target tokens per text chunk
    "overlap_tokens": 120,        # overlap tokens between text chunks (10–20%)

    # Table chunking
    "table_rows_per_chunk": 20,   # rows per table chunk
    "table_format": "markdown",   # "markdown" or "json"

    # File writing mode: "append" or "overwrite"
    "write_mode": "overwrite",

    # Optional: add a tag for confidentiality (e.g., "internal", "restricted")
    "default_confidentiality": None,

    # Log every file processed
    "verbose": True,
}

# =========================
# INTERNAL DEFAULTS
# =========================
AVG_CHARS_PER_TOKEN = 4.0
MAIN_SELECTORS = [
    "#main-content", ".ak-renderer-document", "#content",
    ".wiki-content", "article", "main", "body"
]
NOISE_TAGS = ["script", "style", "nav", "header", "footer", "aside", "form"]
HeadingLevel = {"h1": 1, "h2": 2, "h3": 3, "h4": 4, "h5": 5, "h6": 6}

# =========================
# UTILITIES
# =========================
def approx_token_count(text: str) -> int:
    return max(1, int(len(text) / AVG_CHARS_PER_TOKEN))

def sha256_str(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()

def normalize_ws(text: str) -> str:
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

def text_from_inline(tag: Tag) -> str:
    if isinstance(tag, NavigableString):
        return str(tag)
    name = getattr(tag, "name", "") or ""
    if name == "a":
        t = tag.get_text(" ", strip=True)
        href = (tag.get("href") or "").strip()
        if href and not href.startswith("#"):
            return f"{t} ({href})" if t else href
        return t
    if name in ("em", "i"):
        return f"*{tag.get_text(' ', strip=True)}*"
    if name in ("strong", "b"):
        return f"**{tag.get_text(' ', strip=True)}**"
    return tag.get_text(" ", strip=True)

def codeblock_to_markdown(pre: Tag) -> str:
    code = pre.get_text("\n", strip=False)
    lang = ""
    code_el = pre.find("code")
    if code_el and code_el.has_attr("class"):
        for cls in code_el["class"]:
            if cls.startswith("language-"):
                lang = cls.replace("language-", "")
                break
    return f"```{lang}\n{code.rstrip()}\n```"

def bullet_list_to_text(ul_or_ol: Tag) -> str:
    lines = []
    ordered = (ul_or_ol.name == "ol")
    idx = 1
    for li in ul_or_ol.find_all("li", recursive=False):
        t = normalize_ws(li.get_text(" ", strip=True))
        prefix = f"{idx}. " if ordered else "- "
        lines.append(prefix + t)
        idx += 1
    return "\n".join(lines)

def choose_main_container(soup: BeautifulSoup) -> Tag:
    for sel in MAIN_SELECTORS:
        node = soup.select_one(sel)
        if node:
            return node
    return soup.body or soup

def remove_noise(container: Tag):
    for tag in container.find_all(NOISE_TAGS):
        tag.decompose()

# -------------------------
# BMO URL building helpers
# -------------------------

def _strip_edf_prefix(title: str) -> str:
    if not title:
        return ''
    # Remove leading 'Enterprise Data Fabric : ' with flexible spacing/case
    return re.sub(r'^\s*Enterprise\s+Data\s+Fabric\s*:\s*', '', title, flags=re.IGNORECASE)


def _build_bmo_url(page_id: str, title: str) -> str:
    """Build URL as:
    https://bmo.atlassian.net/wiki/spaces/EDF/pages/{page_id}/{title-without-EDF-prefix}
    The trailing title segment is URL-encoded safely.
    """
    cleaned = _strip_edf_prefix(title or '')
    if not cleaned:
        cleaned = title or 'Page'
    slug = quote(cleaned, safe='')
    return f"https://bmo.atlassian.net/wiki/spaces/EDF/pages/{page_id}/{slug}"

# =========================
# PAGE ID DISCOVERY
# =========================

def _find_page_id(soup: BeautifulSoup, src_path: Path) -> Optional[str]:
    """
    Robust page_id discovery for Confluence exports.
    Order:
      1) meta tags (ajs-page-id, confluence-page-id, ajs-content-id, page-id, etc.)
      2) data attributes (data-content-id, data-page-id)
      3) URL patterns in HTML (viewpage.action?pageId=..., /spaces/.../pages/<id>/, /pages/<id>/)
      4) attachment paths (absolute or relative; 'download/attachments/<id>/' or 'attachments/<id>/')
      5) filename suffix or pure numeric name (Title_<id>.html, Title-<id>.html, <id>.html)
    Returns the first match (as a string) or None.
    """
    html_text = soup.decode() if hasattr(soup, "decode") else str(soup)

    # 1) Meta tags
    meta_keys = [
        "ajs-page-id", "confluence-page-id", "ajs-content-id",
        "page-id", "ajs-pageId", "confluence-pageId", "dc.identifier",
    ]
    for key in meta_keys:
        el = soup.find("meta", attrs={"name": key}) or soup.find("meta", attrs={"property": key})
        if el and el.get("content"):
            m = re.search(r"(\d{6,})", el.get("content"))
            if m:
                return m.group(1)

    # 2) Data attributes on containers
    for attr in ("data-content-id", "data-page-id", "data-entity-id"):
        el = soup.find(attrs={attr: True})
        if el:
            m = re.search(r"(\d{6,})", str(el.get(attr)))
            if m:
                return m.group(1)

    # 3) URL patterns (absolute or relative)
    patterns = [
        r"viewpage\.action\?pageId=(\d+)",
        r"/spaces/[^/]+/pages/(\d+)",
        r"/pages/(\d+)/",
    ]
    for pat in patterns:
        m = re.search(pat, html_text)
        if m:
            return m.group(1)

    # 4) Attachments path (match '/attachments/<id>/' or 'attachments/<id>/' and 'download/attachments/<id>/')
    m = re.search(r"\b(?:download/)?attachments/(\d+)/", html_text)
    if m:
        return m.group(1)

    # 5) Filename suffix or pure numeric filename
    name = src_path.name
    m = re.search(r"(?:^|[_-])(\d{6,})(?:\.html?)?$", name)
    if m:
        return m.group(1)

    return None

# =========================
# METADATA EXTRACTION
# =========================

def extract_meta(soup: BeautifulSoup, src_path: Path, default_confidentiality=None) -> Dict[str, Any]:
    meta: Dict[str, Any] = {}

    def m(attr, key):
        el = soup.find("meta", attrs={attr: key})
        return (el.get("content").strip() if el and el.get("content") else None)

    meta["source_file"] = str(src_path)
    meta["title"] = (soup.title.string.strip() if soup.title and soup.title.string else None)
    meta["url"] = m("property", "og:url") or m("name", "origin-url") or m("name", "dc.identifier") or None
    meta["space_key"] = m("name", "ajs-space-key") or m("name", "confluence-space-key")

    # Robust page_id detection across export variants
    meta["page_id"] = _find_page_id(soup, src_path)

    # Build deterministic BMO URL when page_id is known
    if meta.get("page_id"):
        meta["url"] = _build_bmo_url(str(meta["page_id"]), meta.get("title") or "")

    meta["labels"] = []
    labels_meta = m("name", "labels")
    if labels_meta:
        meta["labels"] = [x.strip() for x in labels_meta.split(",") if x.strip()]

    meta["last_updated"] = (
        m("name", "ajs-page-modified")
        or m("name", "last-modified")
        or m("property", "article:modified_time")
    )
    if not meta["last_updated"]:
        try:
            ts = datetime.fromtimestamp(src_path.stat().st_mtime).isoformat()
            meta["last_updated"] = ts
        except Exception:
            meta["last_updated"] = None

    meta["confidentiality"] = default_confidentiality
    return meta

# =========================
# TABLE PARSING & CHUNKING
# =========================

def parse_html_table(table: Tag) -> Tuple[List[str], List[List[str]], Optional[str]]:
    caption_el = table.find("caption")
    caption = normalize_ws(caption_el.get_text(" ", strip=True)) if caption_el else None

    headers: List[str] = []
    thead = table.find("thead")
    if thead:
        headers = [normalize_ws(text_from_inline(th)) for th in thead.find_all("th")]

    if not headers:
        first_row = table.find("tr")
        if first_row:
            cells = first_row.find_all(["th", "td"])
            headers = [normalize_ws(text_from_inline(c)) for c in cells]
            first_row.extract()

    rows: List[List[str]] = []
    for tr in table.find_all("tr"):
        cells = tr.find_all(["td", "th"])
        row = [normalize_ws(text_from_inline(td)) for td in cells]
        if row:
            rows.append(row)

    if headers:
        width = len(headers)
        norm_rows = []
        for r in rows:
            if len(r) < width:
                r = r + [""] * (width - len(r))
            elif len(r) > width:
                r = r[:width]
            norm_rows.append(r)
        rows = norm_rows

    return (headers, rows, caption)


def rows_to_markdown(headers: List[str], rows: List[List[str]]) -> str:
    if not headers and rows:
        width = max(len(r) for r in rows)
        headers = [f"Column {i}" for i in range(1, width + 1)]
    if not headers:
        return ""
    header_line = "| " + " | ".join(headers) + " |"
    sep_line =    "| " + " | ".join(["---"] * len(headers)) + " |"
    row_lines = ["| " + " | ".join(r) + " |" for r in rows]
    return "\n".join([header_line, sep_line, *row_lines])


def chunk_table_rows(rows: List[List[str]], rows_per_chunk: int) -> List[Tuple[int, int]]:
    ranges: List[Tuple[int, int]] = []
    n = len(rows)
    i = 0
    if rows_per_chunk <= 0:
        rows_per_chunk = 20
    while i < n:
        j = min(i + rows_per_chunk, n)
        ranges.append((i, j - 1))
        i = j
    return ranges

# =========================
# SECTIONIZATION & TEXT CHUNKING
# =========================

def iter_blocks(container: Tag):
    for el in container.find_all(recursive=False):
        if isinstance(el, NavigableString):
            txt = str(el).strip()
            if txt:
                yield ("para", txt)
            continue
        name = (getattr(el, "name", "") or "").lower()
        if name in NOISE_TAGS:
            continue
        if name in HeadingLevel:
            yield ("heading", HeadingLevel[name], el.get_text(" ", strip=True))
        elif name in ("p", "span"):
            txt = normalize_ws(el.get_text(" ", strip=True))
            if txt:
                yield ("para", txt)
        elif name == "pre":
            cb = codeblock_to_markdown(el)
            if cb.strip():
                yield ("code", cb)
        elif name in ("ul", "ol"):
            bl = bullet_list_to_text(el)
            if bl.strip():
                yield ("list", bl)
        elif name == "table":
            headers, rows, caption = parse_html_table(el)
            yield ("table_struct", headers, rows, caption)
        else:
            for sub in iter_blocks(el):
                yield sub


def build_sections(container: Tag) -> List[Dict[str, Any]]:
    sections: List[Dict[str, Any]] = []
    heading_stack: List[Tuple[int, str]] = []
    current_lines: List[str] = []
    table_counter = 0

    def path_str():
        return " / ".join([h[1] for h in heading_stack]) if heading_stack else ""

    def flush_text():
        nonlocal current_lines
        text = normalize_ws("\n\n".join(current_lines))
        if text:
            sections.append({"type": "text", "section_path": path_str(), "text": text})
        current_lines = []

    for block in iter_blocks(container):
        kind = block[0]
        if kind == "heading":
            flush_text()
            level, title = block[1], block[2]
            while heading_stack and heading_stack[-1][0] >= level:
                heading_stack.pop()
            heading_stack.append((level, title))
        elif kind in ("para", "list", "code"):
            current_lines.append(block[1])
        elif kind == "table_struct":
            flush_text()
            headers, rows, caption = block[1], block[2], block[3]
            table_counter += 1
            sections.append({
                "type": "table",
                "section_path": path_str(),
                "headers": headers,
                "rows": rows,
                "caption": caption,
                "table_index": table_counter,
            })
            flush_text()

    if not sections:
        text = normalize_ws(container.get_text("\n", strip=True))
        if text:
            sections = [{"type": "text", "section_path": "", "text": text}]

    return sections


def chunk_text(text: str, chunk_tokens: int, overlap_tokens: int) -> List[str]:
    paragraphs = [p for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: List[str] = []
    current: List[str] = []
    current_tokens = 0

    def push():
        nonlocal current, current_tokens
        if current:
            ctext = normalize_ws("\n\n".join(current))
            if ctext:
                chunks.append(ctext)
        current = []
        current_tokens = 0

    for p in paragraphs:
        ptoks = approx_token_count(p)
        if ptoks > chunk_tokens * 1.2:
            # break on sentences when a single paragraph is too large
            sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", p)
            buf, buf_toks = [], 0
            for s in sentences:
                st = approx_token_count(s)
                if buf_toks + st > chunk_tokens and buf:
                    chunks.append(normalize_ws(" ".join(buf)))
                    if overlap_tokens > 0:
                        carry, toks = [], 0
                        for t in reversed(buf):
                            tt = approx_token_count(t)
                            if toks + tt <= overlap_tokens:
                                carry.insert(0, t)
                                toks += tt
                            else:
                                break
                        buf, buf_toks = carry, sum(approx_token_count(x) for x in carry)
                    else:
                        buf, buf_toks = [], 0
                buf.append(s)
                buf_toks += st
            if buf:
                chunks.append(normalize_ws(" ".join(buf)))
            continue

        if current_tokens + ptoks <= chunk_tokens:
            current.append(p)
            current_tokens += ptoks
        else:
            push()
            if overlap_tokens > 0 and chunks:
                last = chunks[-1]
                last_paras = [pp for pp in re.split(r"\n\s*\n", last) if pp.strip()]
                carry, toks = [], 0
                for t in reversed(last_paras):
                    tt = approx_token_count(t)
                    if toks + tt <= overlap_tokens:
                        carry.insert(0, t)
                        toks += tt
                    else:
                        break
                current = carry[:] + [p]
                current_tokens = sum(approx_token_count(x) for x in carry) + ptoks
            else:
                current = [p]
                current_tokens = ptoks

    push()
    return chunks

# =========================
# RECORD FACTORIES
# =========================

def make_text_record(base_meta: Dict[str, Any], path: Path, sec_idx: int, pos: int, content: str) -> Dict[str, Any]:
    return {
        "chunk_id": f"{base_meta.get('page_id') or path.stem}::{sec_idx:03d}::{pos:03d}",
        "page_id": base_meta.get("page_id"),
        "title": base_meta.get("title"),
        "url": base_meta.get("url"),
        "space_key": base_meta.get("space_key"),
        "labels": base_meta.get("labels", []),
        "section_path": base_meta.get("section_path") or "",
        "position": pos,
        "content": content,
        "is_table": False,
        "word_count": len(content.split()),
        "approx_tokens": approx_token_count(content),
        "source_file": base_meta.get("source_file"),
        "last_updated": base_meta.get("last_updated"),
        "confidentiality": base_meta.get("confidentiality"),
        "doc_hash": sha256_str((base_meta.get("title") or "") + content),
    }


def make_table_record(
    base_meta: Dict[str, Any],
    path: Path,
    sec_idx: int,
    table_index: int,
    chunk_idx: int,
    headers: List[str],
    rows_subset: List[List[str]],
    fmt: str,
    caption: Optional[str],
    row_start: int,
    row_end: int,
) -> Dict[str, Any]:
    if fmt == "json":
        payload = {"headers": headers, "rows": rows_subset, "caption": caption}
        content = json.dumps(payload, ensure_ascii=False)
    else:
        content_lines: List[str] = []
        if caption:
            content_lines.append(f"**Table:** {caption}")
        # Always include headers for every chunk
        content_lines.append(rows_to_markdown(headers, rows_subset))
        content = "\n".join(content_lines)

    return {
        "chunk_id": f"{base_meta.get('page_id') or path.stem}::T{table_index:02d}::{chunk_idx:03d}",
        "page_id": base_meta.get("page_id"),
        "title": base_meta.get("title"),
        "url": base_meta.get("url"),
        "space_key": base_meta.get("space_key"),
        "labels": base_meta.get("labels", []),
        "section_path": base_meta.get("section_path") or "",
        "position": chunk_idx,
        "content": content,
        "is_table": True,
        "table_index": table_index,
        "table_caption": caption,
        "headers": headers,
        "table_total_rows": base_meta.get("table_total_rows"),
        "row_start": row_start,
        "row_end": row_end,
        "table_rows_in_chunk": len(rows_subset),
        "word_count": len(content.split()),
        "approx_tokens": approx_token_count(content),
        "source_file": base_meta.get("source_file"),
        "last_updated": base_meta.get("last_updated"),
        "confidentiality": base_meta.get("confidentiality"),
        "doc_hash": sha256_str((base_meta.get("title") or "") + content),
    }

# =========================
# PER-FILE PROCESSING & RUNNER
# =========================

def process_html_file(
    path: Path,
    chunk_tokens: int,
    overlap_tokens: int,
    table_rows_per_chunk: int,
    table_format: str,
    default_confidentiality=None,
    verbose=True,
) -> List[Dict[str, Any]]:
    html = path.read_text(encoding="utf-8", errors="ignore")

    # Prefer lxml if available
    try:
        import lxml  # noqa: F401
        parser = "lxml"
    except Exception:
        parser = "html.parser"

    soup = BeautifulSoup(html, parser)
    page_meta = extract_meta(soup, path, default_confidentiality=default_confidentiality)
    container = choose_main_container(soup)
    remove_noise(container)
    sections = build_sections(container)

    out: List[Dict[str, Any]] = []
    for sec_idx, sec in enumerate(sections, start=1):
        base_meta = dict(page_meta)
        base_meta["section_path"] = sec.get("section_path") or ""
        if sec["type"] == "text":
            chunks = chunk_text(sec["text"], chunk_tokens=chunk_tokens, overlap_tokens=overlap_tokens)
            for pos, ch in enumerate(chunks, start=1):
                if ch.strip():
                    out.append(make_text_record(base_meta, path, sec_idx, pos, ch))
        elif sec["type"] == "table":
            headers: List[str] = sec.get("headers", [])
            rows: List[List[str]] = sec.get("rows", [])
            caption: Optional[str] = sec.get("caption")
            table_index: int = sec.get("table_index", 1)
            base_meta["table_total_rows"] = len(rows)
            ranges = chunk_table_rows(rows, table_rows_per_chunk)
            for chunk_idx, (i, j) in enumerate(ranges, start=1):
                subset = rows[i: j + 1]
                rec = make_table_record(
                    base_meta=base_meta,
                    path=path,
                    sec_idx=sec_idx,
                    table_index=table_index,
                    chunk_idx=chunk_idx,
                    headers=headers,
                    rows_subset=subset,
                    fmt=table_format,
                    caption=caption,
                    row_start=i,
                    row_end=j,
                )
                out.append(rec)

    if verbose:
        print(f"[OK] {path} → {len(out)} chunks (text+table)")
    return out


def run_with_config(cfg: Dict[str, Any]):
    # Validate config
    in_dir = Path(cfg["input_dir"]).expanduser()
    if not in_dir.exists():
        print(f"[CONFIG ERROR] input_dir not found: {in_dir}", file=sys.stderr)
        sys.exit(2)

    out_path = Path(cfg["output_jsonl"]).expanduser()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Prepare output file
    mode = "a"
    if cfg.get("write_mode", "append").lower() == "overwrite":
        mode = "w"

    total_files = 0
    total_chunks = 0

    if cfg.get("verbose", True):
        print("=== CONFIG ===")
        printable_cfg = {k: (v if k != 'input_dir' else str(in_dir)) for k, v in cfg.items()}
        printable_cfg["output_jsonl"] = str(out_path)
        for k, v in printable_cfg.items():
            print(f"{k}: {v}")
        print("==============\n")

    with out_path.open(mode, encoding="utf-8") as fout:
        for fp in sorted(in_dir.glob(cfg.get("glob", "**/*.htm*"))):
            if not fp.is_file():
                continue
            try:
                records = process_html_file(
                    path=fp,
                    chunk_tokens=int(cfg.get("chunk_tokens", 800)),
                    overlap_tokens=int(cfg.get("overlap_tokens", 120)),
                    table_rows_per_chunk=int(cfg.get("table_rows_per_chunk", 20)),
                    table_format=str(cfg.get("table_format", "markdown")).lower(),
                    default_confidentiality=cfg.get("default_confidentiality"),
                    verbose=cfg.get("verbose", True),
                )
                for r in records:
                    fout.write(json.dumps(r, ensure_ascii=False) + "\n")
                total_files += 1
                total_chunks += len(records)
            except Exception as e:
                print(f"[ERR] {fp}: {e}", file=sys.stderr)

    print(f"\nDone. Files processed: {total_files}, chunks written: {total_chunks}")
    print(f"Output JSONL: {out_path.resolve()}")

# Entry point
if __name__ == "__main__":
    run_with_config(CONFIG)
