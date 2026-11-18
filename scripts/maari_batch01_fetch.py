#!/usr/bin/env python3
"""Conservative intake of public-domain Al-Maarri verse text into a review-only artifact.

Source is read-only; NEVER writes the private site's files or publishes automatically.
The result is a machine-reviewable public-domain transcription candidate.
"""
import json
import re
import sys
import time
import unicodedata
from pathlib import Path
from urllib.parse import urlparse
from urllib import robotparser

import requests
from bs4 import BeautifulSoup

BATCH = "maari-batch01-2026-11-18"
SOURCE = Path("private-source/content/poems.json")
OUTPUT = Path("data/maari-intake-20261118-results.json")
HOLD = {31, 41, 49}   # Previously disputed textual readings; require manual edition check
TASHKEEL = re.compile(r"[\u064b-\u065f\u0670\u0640]")
ARABIC = re.compile(r"[\u0621-\u064a]")
HOST = "almaarri.com"


def normalize(s):
    s = unicodedata.normalize("NFKC", str(s))
    s = TASHKEEL.sub("", s)
    for a, b in (("أ", "ا"), ("إ", "ا"), ("آ", "ا"), ("ى", "ي"),
                 ("ؤ", "و"), ("ئ", "ي")):
        s = s.replace(a, b)
    return " ".join(re.sub(r"[^\w\u0621-\u064a]+", " ", s).split()).strip()


def error(code, record, **more):
    return {"position": record["batch_original_position"], "slug": record["slug"],
            "title": record["title"], "code": code, **more}


def main():
    catalogue = json.loads(SOURCE.read_text(encoding="utf-8"))["poems"]
    batch = sorted((p for p in catalogue if p.get("batch_id") == BATCH),
                   key=lambda x: x["batch_original_position"])
    assert len(batch) == 90
    assert [p["batch_original_position"] for p in batch] == list(range(1, 91))

    session = requests.Session()
    session.headers.update({
        "User-Agent": "JamharahLiteraryProject/1.0 (+read-only public-domain text study; low-frequency)",
        "Accept": "text/html,application/xhtml+xml"
    })
    robot = robotparser.RobotFileParser()
    robot.set_url("https://almaarri.com/robots.txt")
    try:
        robot.read()
        if not robot.can_fetch(session.headers["User-Agent"], "https://almaarri.com/poem/"):
            # Python RobotFileParser for 404/403 may reject all: do not circumvent.
            raise RuntimeError("Source robots policy does not permit /poem/ extraction.")
    except RuntimeError:
        raise
    except Exception as ex:
        print("robots.txt cannot be inspected; no automated harvesting without confirmation:",repr(ex))
        sys.exit(2)

    all_known = {normalize(h) for p in catalogue if p.get("batch_id") != BATCH
                 for h in (p.get("body") or "").splitlines() if h.strip()}
    fresh_seen = set()
    results, skipped, revised, holdings = [], [], [], []
    for p in batch:
        number = p["batch_original_position"]
        source_url = p.get("source_url","")
        parsed = urlparse(source_url)
        if parsed.scheme != "https" or parsed.hostname != HOST or not parsed.path.startswith("/poem/"):
            skipped.append(error("untrusted_source_url", p))
            continue
        if number in HOLD:
            holdings.append(error("documented_uncertain_reading",p))
            continue
        try:
            response = session.get(source_url, timeout=(10, 22), allow_redirects=True)
            response.raise_for_status()
            final = urlparse(response.url)
            if final.scheme != "https" or final.hostname != HOST:
                skipped.append(error("unexpected_redirect",p,url=response.url))
                continue
            soup = BeautifulSoup(response.content,"html.parser")
            heading = soup.find("h1")
            poem = soup.select_one("div.poem")
            if not heading or not poem:
                skipped.append(error("page_lacks_poem",p))
                continue
            heading_title = heading.get_text(" ",strip=True)
            verses = [tag.get_text(" ",strip=True) for tag in poem.find_all("p",recursive=False)]
            verses = [re.sub(r"\s+", " ", s).strip() for s in verses if s.strip()]
            wanted = p["verse_count"] * 2
            if len(verses) != wanted:
                skipped.append(error("half_line_count_disagreement",p,wanted=wanted,observed=len(verses)))
                continue
            ntitle = normalize(p["title"])
            first = normalize(verses[0])
            if not first.startswith(ntitle) and not ntitle.startswith(first):
                skipped.append(error("first_hemistich_disagreement",p,source_first=verses[0][:90]))
                continue
            if not normalize(heading_title).startswith(ntitle[:max(7,len(ntitle)//2)]):
                skipped.append(error("page_heading_disagreement",p,source_heading=heading_title))
                continue
            if any(len(normalize(s)) < 3 or not ARABIC.search(s) for s in verses):
                skipped.append(error("bad_or_empty_verse",p))
                continue
            own_local = p.get("text_status") == "local_text"
            dups_other = [s for s in verses if normalize(s) in all_known]
            if dups_other:
                skipped.append(error("existing_cross_poet_hemistich",p,examples=dups_other[:2]))
                continue
            dups_batch = [s for s in verses if normalize(s) in fresh_seen]
            if dups_batch:
                skipped.append(error("duplicate_batch_hemistich",p,examples=dups_batch[:2]))
                continue
            if len(set(map(normalize,verses))) != len(verses):
                skipped.append(error("repeated_hemistich_within_poem",p))
                continue
            # Known OCR/transcription anomalies should be held for edition-level review.
            joined = "\n".join(verses)
            if "ماءَرادَت" in joined or "ماأَرادَت" in joined:
                holdings.append(error("suspected_joined_words",p))
                continue
            for s in verses:
                fresh_seen.add(normalize(s))
            item = {
                "slug":p["slug"],
                "position":number,
                "title":verses[0],
                "verse_count":p["verse_count"],
                "source_url":response.url,
                "body":joined,
                "body_line_count":len(verses),
                "text_status":"local_text",
                "rights_status":"public_domain",
                "rights_basis":"أصل الأبيات للمعري المتوفى سنة 449 هـ / 1057م (ملك عام). النص الشعري فقط بلا شرح معاصر؛ يتطلب ضبطه مقابلة على طبعة محققة.",
                "source_reference":"نص أبي العلاء المعري التراثي؛ مقابلة عدد الأشطر والمطلع مع صفحة القصيدة في almaarri.com بتاريخ 18 نوفمبر 2026؛ التحقيق الطباعي الكامل وضبط الحركات قيد التحرير.",
                "diacritics_review":"pending_full_vocalization"
            }
            results.append(item)
            if own_local:
                old = [normalize(s) for s in p["body"].splitlines() if s.strip()]
                new = [normalize(s) for s in verses]
                if old != new:
                    revised.append({"position":number,"slug":p["slug"],"mismatching_halves":sum(a!=b for a,b in zip(old,new))+abs(len(old)-len(new))})
            print("FETCHED",number,"verse_count",p["verse_count"],"local_existing",own_local,"source",response.status_code,flush=True)
        except requests.RequestException as ex:
            skipped.append(error("source_fetch_failed",p,reason=str(ex)[:180]))
        except Exception as ex:
            skipped.append(error("parse_exception",p,reason=type(ex).__name__+":"+str(ex)[:100]))
        time.sleep(0.42)

    summary = {
        "batch_id":BATCH,
        "poems_in_batch":len(batch),
        "eligible":len(results),
        "eligible_preexisting_local":sum(p.get("text_status")=="local_text" for p in batch if p["slug"] in {x["slug"] for x in results}),
        "eligible_verses":sum(x["verse_count"] for x in results),
        "skipped":len(skipped),
        "held":len(holdings),
        "revisions":len(revised)
    }
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps({"summary":summary,"records":results,"skipped":skipped,"held":holdings,
                                   "changed_existing":revised},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("SUMMARY",json.dumps(summary,ensure_ascii=False),flush=True)
    print("SKIPPED",json.dumps(skipped,ensure_ascii=False)[:14000],flush=True)
    print("HELD",json.dumps(holdings,ensure_ascii=False)[:1500],flush=True)
    print("EXISTING_DIFF",json.dumps(revised,ensure_ascii=False)[:1500],flush=True)


if __name__ == "__main__":
    main()
