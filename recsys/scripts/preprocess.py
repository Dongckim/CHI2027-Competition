#!/usr/bin/env python3
"""CHI 2026 raw JSON -> clean corpus for the recommender.

Extracts Papers + Posters (the items that have abstracts) and attaches
human-readable metadata: authors, track, content type, and the physical
location + time (room / floor / session slot) so the chatbot can tell a
user *where and when* to go.

Input : data/raw/chi2026_latest.json
Output: data/processed/corpus.json   (list of records)
        data/processed/meta.json     (conference-level info)
"""
import json
import os
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw", "chi2026_latest.json")
OUT_DIR = os.path.join(ROOT, "data", "processed")

# Content types we recommend over (they carry abstracts + a physical booth/room).
WANTED_TYPES = {"Paper", "Posters"}


def load():
    with open(RAW, encoding="utf-8") as f:
        return json.load(f)


def build_lookups(d):
    tz_min = d["conference"].get("timeZoneOffset", 0)  # minutes east of UTC
    tz = timezone(timedelta(minutes=tz_min))

    people = {p["id"]: p for p in d["people"]}
    rooms = {r["id"]: r for r in d["rooms"]}
    tracks = {t["id"]: t for t in d["tracks"]}
    ctypes = {c["id"]: c for c in d["contentTypes"]}
    slots = {s["id"]: s for s in d["timeSlots"]}
    sessions = {s["id"]: s for s in d["sessions"]}

    # room -> floor name
    room_floor = {}
    for fl in d["floors"]:
        for rid in fl.get("roomIds", []):
            room_floor[rid] = fl.get("name", "")

    return dict(tz=tz, people=people, rooms=rooms, tracks=tracks,
                ctypes=ctypes, slots=slots, sessions=sessions,
                room_floor=room_floor)


def fmt_time(ms, tz):
    if not ms:
        return None
    dt = datetime.fromtimestamp(ms / 1000, tz)
    return dt.isoformat()


def author_names(authors, people):
    out = []
    for a in authors:
        p = people.get(a.get("personId"))
        if not p:
            continue
        name = " ".join(x for x in [p.get("firstName", ""), p.get("lastName", "")] if x).strip()
        insts = [af.get("institution", "") for af in a.get("affiliations", []) if af.get("institution")]
        out.append({"name": name, "institution": insts[0] if insts else ""})
    return out


def location_and_time(content, L):
    """Resolve the first session's room/floor/time for a content item."""
    for sid in content.get("sessionIds", []):
        sess = L["sessions"].get(sid)
        if not sess:
            continue
        room = L["rooms"].get(sess.get("roomId"))
        slot = L["slots"].get(sess.get("timeSlotId"))
        return {
            "session_name": sess.get("name", ""),
            "room": room.get("name", "") if room else "",
            "room_capacity": room.get("capacity") if room else None,
            "floor": L["room_floor"].get(sess.get("roomId"), ""),
            "start": fmt_time(slot.get("startDate") if slot else None, L["tz"]),
            "end": fmt_time(slot.get("endDate") if slot else None, L["tz"]),
        }
    return {"session_name": "", "room": "", "room_capacity": None,
            "floor": "", "start": None, "end": None}


def main():
    d = load()
    L = build_lookups(d)

    records = []
    for c in d["contents"]:
        ctype = L["ctypes"].get(c.get("typeId"), {}).get("name", "")
        if ctype not in WANTED_TYPES:
            continue
        abstract = (c.get("abstract") or "").strip()
        if not abstract:
            continue
        loc = location_and_time(c, L)
        records.append({
            "id": c["id"],
            "type": ctype,
            "title": (c.get("title") or "").strip(),
            "abstract": abstract,
            "track": L["tracks"].get(c.get("trackId"), {}).get("name", ""),
            "authors": author_names(c.get("authors", []), L["people"]),
            "doi": (c.get("addons", {}).get("doi", {}) or {}).get("url", ""),
            **loc,
        })

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "corpus.json"), "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    meta = {
        "conference": d["conference"].get("fullName"),
        "year": d["conference"].get("year"),
        "location": d["conference"].get("location"),
        "n_records": len(records),
        "by_type": {},
    }
    for r in records:
        meta["by_type"][r["type"]] = meta["by_type"].get(r["type"], 0) + 1
    with open(os.path.join(OUT_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(records)} records to {OUT_DIR}/corpus.json")
    print("By type:", meta["by_type"])
    with_loc = sum(1 for r in records if r["room"])
    with_time = sum(1 for r in records if r["start"])
    print(f"With room: {with_loc} | with time: {with_time}")


if __name__ == "__main__":
    main()
