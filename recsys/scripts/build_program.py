#!/usr/bin/env python3
"""CHI 2026 raw JSON -> the full program for the explorer and the ARC screen API.

Unlike corpus.json (papers + posters only, first session only, first affiliation
only), this keeps every content item (2,782: workshops, demos, panels too), every
session slot it is presented in, and every author affiliation with department,
city and country, so it can be searched by institution, country or author.

Each slot also carries where the talk sits in its session ("talk 3 of 7"), an
estimated start/end (session start + the talk length of every talk before it:
12 min for a paper, 15 for a journal paper) and the session chairs. Items carry
whether a presentation video exists and whether the talk is remote-only.

Input : data/raw/chi2026_latest.json
Output: data/processed/program.json   (item order is fixed: program_emb.npy rows follow it)
        data/processed/venue.json     (conference days, floors + map images, rooms,
                                       sponsors by level, session list with chairs)
"""
import json
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(__file__))
from preprocess import RAW, OUT_DIR, build_lookups, fmt_time  # noqa: E402

# talks with a fixed length inside a session; everything else (posters, demos,
# workshops) is open for the whole session
SEQUENTIAL = {"Paper", "Journals"}


def person_name(p):
    return " ".join(x for x in [p.get("firstName", ""), p.get("middleInitial", ""),
                                p.get("lastName", "")] if x).strip()


def session_plan(d, L):
    """session id -> {content id: (order, of, est_start, est_end)} for sequential talks."""
    contents = {c["id"]: c for c in d["contents"]}
    plan = {}
    for s in d["sessions"]:
        slot = L["slots"].get(s.get("timeSlotId"))
        ids = [i for i in s.get("contentIds", []) if i in contents]
        if not slot or not ids:
            continue
        t = slot["startDate"]
        plan[s["id"]] = {}
        for n, cid in enumerate(ids, 1):
            ct = L["ctypes"].get(contents[cid].get("typeId"), {})
            if ct.get("name") in SEQUENTIAL and not s.get("isParallelPresentation"):
                dur = (ct.get("duration") or 12) * 60000
                plan[s["id"]][cid] = (n, len(ids), fmt_time(t, L["tz"]), fmt_time(t + dur, L["tz"]))
                t += dur
            else:
                plan[s["id"]][cid] = (n, len(ids), None, None)
    return plan


def sessions_of(content, L, plan):
    out = []
    for sid in content.get("sessionIds", []):
        sess = L["sessions"].get(sid)
        if not sess:
            continue
        room = L["rooms"].get(sess.get("roomId"))
        slot = L["slots"].get(sess.get("timeSlotId"))
        order, of, est_s, est_e = plan.get(sid, {}).get(content["id"], (None, None, None, None))
        start = fmt_time(slot.get("startDate") if slot else None, L["tz"])
        end = fmt_time(slot.get("endDate") if slot else None, L["tz"])
        out.append({
            "session_id": sid,
            "session": sess.get("name", ""),
            "room": room.get("name", "") if room else "",
            "floor": L["room_floor"].get(sess.get("roomId"), ""),
            "start": start,
            "end": end,
            "order": order,
            "of": of,
            "est_start": est_s or start,
            "est_end": est_e or end,
            "chairs": [person_name(L["people"][p]) for p in sess.get("chairIds", [])
                       if p in L["people"]],
        })
    return sorted(out, key=lambda s: s["start"] or "9999")


def authors_of(content, L):
    out = []
    for a in content.get("authors", []):
        p = L["people"].get(a.get("personId"))
        if not p:
            continue
        affs = [{"institution": af.get("institution", "").strip(),
                 "department": af.get("dsl", "").strip(),
                 "city": af.get("city", "").strip(),
                 "country": af.get("country", "").strip()}
                for af in a.get("affiliations", []) if af.get("institution")]
        out.append({"name": person_name(p), "affiliations": affs})
    return out


def venue(d, L):
    conf = d["conference"]
    first = datetime.fromtimestamp(conf["startDate"] / 1000, L["tz"]).date()
    last = datetime.fromtimestamp(conf["endDate"] / 1000, L["tz"]).date()
    days = []
    while first <= last:
        days.append(first.isoformat())
        first += timedelta(days=1)
    levels = {lv["id"]: lv for lv in d.get("sponsorLevels", [])}
    sponsors = sorted(({"name": s["name"], "level": levels.get(s.get("levelId"), {}).get("name", ""),
                        "rank": levels.get(s.get("levelId"), {}).get("rank", 99),
                        "logo": s.get("logoUrl", ""), "url": s.get("url", "")}
                       for s in d.get("sponsors", [])), key=lambda s: (s["rank"], s["name"]))
    floors = [{"name": f["name"], "map": f.get("mapImageUrl", ""),
               "rooms": [L["rooms"][r]["name"] for r in f.get("roomIds", []) if r in L["rooms"]]}
              for f in d["floors"]]
    rooms = [{"name": r["name"], "floor": L["room_floor"].get(r["id"], ""),
              "capacity": r.get("capacity"), "setup": r.get("setup", "")} for r in d["rooms"]]
    sessions = []
    for s in d["sessions"]:
        slot = L["slots"].get(s.get("timeSlotId"))
        room = L["rooms"].get(s.get("roomId"))
        sessions.append({
            "id": s["id"], "name": s.get("name", ""),
            "type": L["ctypes"].get(s.get("typeId"), {}).get("name", ""),
            "room": room.get("name", "") if room else "",
            "floor": L["room_floor"].get(s.get("roomId"), ""),
            "start": fmt_time(slot.get("startDate") if slot else None, L["tz"]),
            "end": fmt_time(slot.get("endDate") if slot else None, L["tz"]),
            "chairs": [person_name(L["people"][p]) for p in s.get("chairIds", []) if p in L["people"]],
            "n_items": len(s.get("contentIds", [])),
        })
    return {"name": conf.get("name") or f"{conf.get('shortName')} {conf.get('year')}",
            "full_name": conf.get("fullName", ""), "location": conf.get("location", ""),
            "url": conf.get("url", ""), "timezone": conf.get("timeZoneName", ""),
            "utc_offset_min": conf.get("timeZoneOffset", 0), "days": days,
            "sponsors": sponsors, "floors": floors, "rooms": rooms, "sessions": sessions}


def main():
    with open(RAW, encoding="utf-8") as f:
        d = json.load(f)
    L = build_lookups(d)
    plan = session_plan(d, L)
    remote = {i for e in d.get("events", []) for i in e.get("contentIds", [])}
    items = []
    for c in d["contents"]:
        addons = c.get("addons") or {}
        items.append({
            "id": c["id"],
            "type": L["ctypes"].get(c.get("typeId"), {}).get("name", ""),
            "title": (c.get("title") or "").strip(),
            "abstract": (c.get("abstract") or "").strip(),
            "track": L["tracks"].get(c.get("trackId"), {}).get("name", ""),
            "doi": (addons.get("doi", {}) or {}).get("url", ""),
            "video": "Presentation Video" in addons,
            "remote": c["id"] in remote and not c.get("sessionIds"),
            "authors": authors_of(c, L),
            "sessions": sessions_of(c, L, plan),
        })
    path = os.path.join(OUT_DIR, "program.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False)
    with open(os.path.join(OUT_DIR, "venue.json"), "w", encoding="utf-8") as f:
        json.dump(venue(d, L), f, ensure_ascii=False, indent=1)
    n_aff = sum(len(a["affiliations"]) for it in items for a in it["authors"])
    print(f"Wrote {len(items)} items to {path} | author affiliations: {n_aff} | "
          f"with a session: {sum(bool(it['sessions']) for it in items)} | "
          f"with video: {sum(it['video'] for it in items)} | remote: {sum(it['remote'] for it in items)}")


if __name__ == "__main__":
    main()
