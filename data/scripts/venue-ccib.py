"""Extract the CCIB venue database from CCIB's "Floorplans & capacities" PDF.

Usage: python3 data/scripts/venue-ccib.py <Floorplans-Capacities_CCIB.pdf>   (needs pdfplumber)
Writes data/venue/ccib.json: area tables (dimensions, capacities) and a walking graph in metres, so the app
only runs a shortest path (app/src/venue/route.js) and never converts anything at runtime.

Geometry comes from the vector drawing: the plans of P0, M1, P1, M2 and P2 are top-down and drawn at one
scale, so metres = PDF points x METRES_PER_POINT (fitted below against the room sizes in the same PDF). P0 is
drawn slightly larger and shifted; it is aligned on the three elevator shafts that run through every level.
What the drawing does not show (corridor centre lines, P0/M1 doors, the walk to the Auditorium) is written
below by hand, in PDF points read off the plan, and anything not measured is marked "estimate": true.
"""
import hashlib, json, math, re, sys
import pdfplumber

SOURCE_URL = 'https://ccib.es/wp-content/uploads/2024/04/1.-Floorplans-Capacities_CCIB.pdf'
OUT = 'data/venue/ccib.json'

# page index (0-based) of each level's plan, and the pages holding its table
LEVELS = [  # bottom to top; AUD is the separate Auditorium building reached by the walkway from P0 access A
    {'id': 'P0', 'name': 'Convention Centre P0', 'plan': 3, 'tables': [3]},
    {'id': 'M1', 'name': 'Convention Centre M1 (mezzanine)', 'plan': 4, 'tables': [4]},
    {'id': 'P1', 'name': 'Convention Centre P1', 'plan': 5, 'tables': [5, 6]},
    {'id': 'M2', 'name': 'Convention Centre M2 (mezzanine)', 'plan': 7, 'tables': [7]},
    {'id': 'P2', 'name': 'Convention Centre P2', 'plan': 8, 'tables': [8]},
    {'id': 'AUD', 'name': 'Auditorium (lower level)', 'plan': None, 'tables': [9]},
]
STACKED = ['P0', 'M1', 'P1', 'M2', 'P2']
REFERENCE = 'P1'  # every level is mapped into P1's page frame

# Hand input, in each level's own PDF points (x right, y down), read off the rendered plans.
CORRIDORS = {  # centre lines of the foyers, named as on the plan
    'P0': {'Foyer 0': [(108, 357), (470, 357), (511, 397)]},  # then out to access A (walkway to the Auditorium)
    'M1': {'Foyer M1': [(105, 345), (462, 345)]},
    'P1': {'Foyer 1': [(100, 347), (462, 347)], 'Foyer 2': [(403, 160), (403, 347)]},
    'M2': {'Foyer M2': [(120, 338), (440, 338)]},  # 1.9 m wide
    'P2': {'Foyer A': [(120, 347), (345, 347)], 'Foyer B': [(345, 347), (440, 347)]},  # B starts over rooms 211/212
}
HAND_DOORS = {  # areas whose doors the plan does not mark
    'P0': {'Areas 1+2+3': [(166.5, 333.1), (244.7, 333.1), (301.0, 333.1)],  # south wall, one per area
           'Entrance Hall': [(299.0, 412.0)],  # open hall: its middle
           'Access A': [(511.0, 397.0)]},
    'M1': {'VIP Room': [(439.0, 378.0)]},  # top wall of the VIP room
}
HAND_RECTS = {  # rooms the plan does not fill in blue: outline read off the plan (checked against the table size)
    'P0': {'Entrance Hall': (148, 376, 456, 450)},  # 119.1 x 28.9 m
    'M1': {'VIP Room': (421.6, 377.6, 456, 432)},  # 23.0 x 14.7 m
}
DOOR_LABELS = {'P1': r'^1[1-3]\d$', 'P2': r'^(211|212|Banquet)$'}  # marked doors go to the nearest of these labels
AUDITORIUM = {  # page 10 is another drawing at another scale; only the walkway length is in the table
    'walkway': 116.8,  # Connecting Walkway length (m), table on page 10
    'foyerToStalls': 25.0,  # estimate: walkway end through the Auditorium foyer to the stalls doors
}

# icon images, identified by their size in points (the legend uses the same images)
ICON = {'elevator': (7.15, 7.15), 'escalator': (7.33, 5.97)}
COLUMNS = ['m2', 'sqft', 'length', 'width', 'height', 'theater', 'classroom', 'cabaret', 'boardroom', 'ushape',
           'banquet10', 'banquet11', 'buffet10', 'buffet11', 'cocktail', 'coffeeBreak']
CAPACITY = COLUMNS[5:]


def num(s):
    s = s.replace('.', '').replace(',', '.')  # 1.295 = 1295, 133,50 = 133.5
    return float(s) if '.' in s else int(s)


def slug(name):
    return re.sub(r'[^a-z0-9+]+', '-', name.lower()).strip('-')


def area_id(level, name):
    return f'{level}-{slug(name)}'


def lines(words):
    rows = {}
    for w in words:
        rows.setdefault(round(w['top']), []).append(w)
    merged = []
    for top in sorted(rows):
        if merged and top - merged[-1][0] <= 2:
            merged[-1][1].extend(rows[top])
        else:
            merged.append([top, list(rows[top])])
    return [sorted(ws, key=lambda w: w['x0']) for _, ws in merged]


def parse_table(page, level, areas):
    words = page.extract_words()
    head = [w for w in words if w['text'] in ('m²', 'sqft', 'Length', 'Width', 'Height', 'Theater', 'Clasroom',
                                              'Cabaret', 'Boardroom', 'U-shape', 'pax', 'Cocktail', 'Coffee')]
    if not head:
        return
    head_bottom = max(w['bottom'] for w in head)
    xs = sorted((w['x0'] + w['x1']) / 2 for w in head)
    if len(xs) != len(COLUMNS):
        raise SystemExit(f'{level}: expected {len(COLUMNS)} table columns, found {len(xs)}')
    first_col = min(w['x0'] for w in head) - 8
    group = None
    for row in lines([w for w in words if w['top'] > head_bottom + 1]):
        label = ' '.join(w['text'] for w in row if w['x1'] < first_col)
        cells = [w for w in row if w['x1'] >= first_col]
        if not label or label.startswith('*') or label.startswith('CCIB'):
            continue
        if not cells:
            group = label
            continue
        rec = {'level': level, 'name': label}
        if group:
            rec['group'] = group
        for w in cells:
            col = COLUMNS[min(range(len(xs)), key=lambda i: abs(xs[i] - (w['x0'] + w['x1']) / 2))]
            text = w['text']
            if col == 'height' and '/' in text:
                value = [num(t) for t in text.split('/')]
            elif re.fullmatch(r'[\d.,]+', text):
                value = num(text)
            else:
                continue  # e.g. "+12" wheelchair places next to the Auditorium stalls count
            if col in CAPACITY:
                rec.setdefault('capacity', {})[col] = value
            elif col != 'sqft':
                rec[col] = value
        areas[area_id(level, label)] = rec


def icons(page, kind):
    w, h = ICON[kind]
    legend_top = min(x['top'] for x in page.extract_words() if x['text'] == 'Elevator')
    return [((im['x0'] + im['x1']) / 2, (im['top'] + im['bottom']) / 2) for im in page.images
            if abs(im['x1'] - im['x0'] - w) < 0.3 and abs(im['bottom'] - im['top'] - h) < 0.3 and im['top'] < legend_top - 5]


def fit(src, dst):
    """Scale + shift mapping src points onto dst points (least squares, no rotation)."""
    n = len(src)
    sx, sy = sum(p[0] for p in src) / n, sum(p[1] for p in src) / n
    dx, dy = sum(p[0] for p in dst) / n, sum(p[1] for p in dst) / n
    num_ = sum((s[0] - sx) * (d[0] - dx) + (s[1] - sy) * (d[1] - dy) for s, d in zip(src, dst))
    den = sum((s[0] - sx) ** 2 + (s[1] - sy) ** 2 for s in src)
    k = num_ / den
    return lambda p: (dx + (p[0] - sx) * k, dy + (p[1] - sy) * k)


def blue_rects(page):
    legend_top = min(x['top'] for x in page.extract_words() if x['text'] == 'Elevator')
    out = []
    for r in page.rects:
        c = r.get('non_stroking_color')
        if r.get('fill') and isinstance(c, (list, tuple)) and len(c) == 3 and c[0] < 0.3 and c[2] > 0.9 and r['top'] < legend_top:
            out.append((r['x0'], r['top'], r['x1'], r['bottom']))
    return out


def room_labels(page):
    """Room names drawn on the plan, with their centres (level-specific label styles)."""
    words = [w for w in page.extract_words() if w['top'] < 450]
    out = []
    for i, w in enumerate(words):
        t = w['text'] if not w['text'][0].isdigit() or not w['text'].endswith('M') else w['text'][::-1]  # rotated M2 labels
        name = None
        if re.fullmatch(r'1[1-3]\d|21[12]|M2\d\d', t):
            name = t
        elif t == 'Banquet':
            name = 'Banquet Hall'
        elif t == 'Area' and i + 1 < len(words) and words[i + 1]['text'].isdigit():
            name = f'Area {words[i + 1]["text"]}'
        if name:
            out.append(((w['x0'] + w['x1']) / 2, (w['top'] + w['bottom']) / 2, name))
    return out


def room_rects(page, areas, level):
    """Blue room rectangles; a rectangle holding several rooms (113-117, 118-125, ...) is split by the table widths."""
    rects = [r for r in blue_rects(page) if not (r[2] - r[0] < 13 and r[3] - r[1] < 6)]
    labels = room_labels(page)
    out = {}
    for r in rects:
        inside = [l for l in labels if r[0] <= l[0] <= r[2] and r[1] <= l[1] <= r[3]]
        if len(inside) == 1:
            out[inside[0][2]] = r
        elif inside:
            along_x = max(l[0] for l in inside) - min(l[0] for l in inside) > max(l[1] for l in inside) - min(l[1] for l in inside)
            inside.sort(key=lambda l: l[0] if along_x else l[1])
            widths = [areas.get(area_id(level, l[2]), {}).get('width') for l in inside]
            known = [w for w in widths if w]
            widths = [w or sum(known) / len(known) for w in widths]  # 124 is missing from the PDF table: use its neighbours
            start, size = (r[0], r[2] - r[0]) if along_x else (r[1], r[3] - r[1])
            for l, w in zip(inside, widths):
                end = start + size * w / sum(widths)
                out[l[2]] = (start, r[1], end, r[3]) if along_x else (r[0], start, r[2], end)
                start = end
    return out


def project(p, a, b):
    ax, ay = a
    vx, vy = b[0] - ax, b[1] - ay
    t = max(0, min(1, ((p[0] - ax) * vx + (p[1] - ay) * vy) / (vx * vx + vy * vy)))
    return (ax + t * vx, ay + t * vy), t


def main(pdf_path):
    raw = open(pdf_path, 'rb').read()
    pdf = pdfplumber.open(pdf_path)
    areas = {}
    for lv in LEVELS:
        for i in lv['tables']:
            parse_table(pdf.pages[i], lv['id'], areas)

    pages = {lv['id']: pdf.pages[lv['plan']] for lv in LEVELS if lv['plan'] is not None}
    elev = {lv: sorted(icons(pages[lv], 'elevator'), key=lambda p: p[0]) for lv in STACKED}
    # the three shafts are the elevator icons inside the foyer band; P0 also has a lone one by entrance A
    elev = {lv: [p for p in pts if p[1] < 360] for lv, pts in elev.items()}
    to_ref = {}
    for lv in STACKED:
        if len(elev[lv]) != 3:
            raise SystemExit(f'{lv}: expected 3 elevator shafts, found {len(elev[lv])}')
        to_ref[lv] = fit(elev[lv], elev[REFERENCE])
    shaft_error = max(math.dist(to_ref[lv](p), q) for lv in STACKED for p, q in zip(elev[lv], elev[REFERENCE]))

    # metres per point: room rectangles on P1/P2 against the table sizes of the same rooms
    pairs = [((98.2, 366.4, 312.4, 433.9), 'P1-113+114+115+116+117'), ((349.8, 366.4, 457.0, 433.9), 'P1-111+112'),
             ((348.8, 363.3, 458.0, 430.5), 'P2-211+212'), ((134.1, 363.3, 314.3, 415.9), 'P2-banquet-hall')]
    rects = {lv: blue_rects(pages[lv]) for lv in ('P1', 'P2')}
    measured = []
    for (box, aid) in pairs:
        lv = aid[:2]
        r = min(rects[lv], key=lambda q: sum(abs(a - b) for a, b in zip(q, box)))
        a = areas[aid]
        long_pt, short_pt = max(r[2] - r[0], r[3] - r[1]), min(r[2] - r[0], r[3] - r[1])
        long_m, short_m = max(a['length'], a['width']), min(a['length'], a['width'])
        measured += [(long_pt, long_m), (short_pt, short_m)]
    mpp = sum(p * m for p, m in measured) / sum(p * p for p, _ in measured)
    scale_error = max(abs(p * mpp - m) / m for p, m in measured)
    if scale_error > 0.03:
        raise SystemExit(f'scale fit off by {scale_error:.1%}')

    nodes, edges = {}, []

    def node(nid, level, kind, p, **extra):
        nodes[nid] = {'level': level, 'kind': kind, 'x': round(p[0] * mpp, 2), 'y': round(p[1] * mpp, 2), **extra}
        return nid

    def edge(a, b, kind='walk', metres=None, **extra):
        if metres is None:
            metres = math.dist((nodes[a]['x'], nodes[a]['y']), (nodes[b]['x'], nodes[b]['y']))
        edges.append({'a': a, 'b': b, 'kind': kind, 'm': round(metres, 1), **extra})

    corridors = []
    pois = {lv: [] for lv in STACKED}  # (node id, point in reference frame) to hang off the corridors
    for lv in STACKED:
        page = pages[lv]
        ref = to_ref[lv]
        doors = {}
        if lv in DOOR_LABELS:
            pattern = re.compile(DOOR_LABELS[lv])
            labels = [((w['x0'] + w['x1']) / 2, (w['top'] + w['bottom']) / 2, w['text'])
                      for w in page.extract_words() if pattern.match(w['text'])]
            all_rects = blue_rects(page)
            marks = [r for r in all_rects if r[2] - r[0] < 13 and r[3] - r[1] < 6]  # small marks on room walls at the doors
            rooms = [r for r in all_rects if r not in marks]
            for r in marks:
                c = ((r[0] + r[2]) / 2, (r[1] + r[3]) / 2)
                # the room the mark sits on, then the label inside that room nearest to the mark
                room = next(q for q in rooms if q[0] - 1 <= r[2] and r[0] <= q[2] + 1 and q[1] - 1 <= r[3] and r[1] <= q[3] + 1)
                inside = [l for l in labels if room[0] <= l[0] <= room[2] and room[1] <= l[1] <= room[3]]
                lab = min(inside, key=lambda l: math.dist(c, l[:2]))
                name = 'Banquet Hall' if lab[2] == 'Banquet' else lab[2]
                doors.setdefault(name, []).append(c)
        if lv == 'M2':  # no door marks: doors are on the foyer side of each room, under its (vertical) label
            for w in [w for w in page.extract_words() if w['top'] < 400]:  # plan labels, not the table below
                t = w['text'] if w['text'].startswith('M') else w['text'][::-1]  # rotated labels read backwards
                if re.fullmatch(r'M2\d\d', t):
                    doors[t] = [((w['x0'] + w['x1']) / 2, 342.8)]
        for name, pts in HAND_DOORS.get(lv, {}).items():
            doors[name] = pts
        for name, pts in sorted(doors.items()):
            aid = area_id(lv, name)
            ids = []
            for i, p in enumerate(sorted(pts)):
                nid = node(f'{aid}/door{i + 1}' if len(pts) > 1 else f'{aid}/door', lv, 'door', ref(p),
                           **({'estimate': True} if name in HAND_DOORS.get(lv, {}) else {}))
                ids.append(nid)
                pois[lv].append((nid, ref(p)))
            areas.setdefault(aid, {'level': lv, 'name': name})['doors'] = ids
        outlines = room_rects(page, areas, lv)
        for name, r in {**outlines, **HAND_RECTS.get(lv, {})}.items():
            (x0, y0), (x1, y1) = ref(r[:2]), ref(r[2:])
            a = areas.setdefault(area_id(lv, name), {'level': lv, 'name': name})
            a['rect'] = [round(v * mpp, 2) for v in (x0, y0, x1, y1)]
            if name in HAND_RECTS.get(lv, {}):
                a['rectEstimate'] = True
        for i, p in enumerate(elev[lv]):
            pois[lv].append((node(f'{lv}/elevator{i + 1}', lv, 'elevator', ref(p)), ref(p)))
        for i, p in enumerate(sorted(icons(page, 'escalator'))):
            pois[lv].append((node(f'{lv}/escalator{i + 1}', lv, 'escalator', ref(p)), ref(p)))

    # corridors: hang every point of interest off its nearest corridor, then chain the stops along each line
    for lv in STACKED:
        ref = to_ref[lv]
        line_names = list(CORRIDORS[lv])
        lines_ = [[ref(p) for p in line] for line in CORRIDORS[lv].values()]
        stops = []  # (line, segment, t, point, node id or None)
        for li, line in enumerate(lines_):
            for si in range(len(line) - 1):
                stops += [(li, si, 0.0, line[si], None), (li, si, 1.0, line[si + 1], None)]
            for lj, other in enumerate(lines_):  # junctions where one corridor ends on another
                if lj != li:
                    for p in (other[0], other[-1]):
                        for si in range(len(line) - 1):
                            q, t = project(p, line[si], line[si + 1])
                            if math.dist(p, q) < 1:
                                stops.append((li, si, t, q, None))
        for nid, p in pois[lv]:
            best = min(((math.dist(p, project(p, line[si], line[si + 1])[0]), li, si)
                        for li, line in enumerate(lines_) for si in range(len(line) - 1)))
            _, li, si = best
            q, t = project(p, lines_[li][si], lines_[li][si + 1])
            stops.append((li, si, t, q, nid))
        for name, line in zip(line_names, lines_):
            corridors.append({'level': lv, 'name': name, 'points': [[round(v * mpp, 2) for v in p] for p in line]})
        corridor_at = {}
        for li, si, t, q, nid in sorted(stops, key=lambda s: (s[0], s[1], s[2])):
            key = (round(q[0], 1), round(q[1], 1))
            if key not in corridor_at:
                corridor_at[key] = node(f'{lv}/corridor{len(corridor_at) + 1}', lv, 'corridor', q, name=line_names[li])
            cid = corridor_at[key]
            if nid:
                edge(nid, cid)
        for li, line in enumerate(lines_):
            on_line = sorted({(s[1], s[2], (round(s[3][0], 1), round(s[3][1], 1))) for s in stops if s[0] == li})
            ids = []
            for _, _, key in on_line:
                if not ids or ids[-1] != corridor_at[key]:
                    ids.append(corridor_at[key])
            for a, b in zip(ids, ids[1:]):
                edge(a, b)

    # between levels: elevator shafts stop on every stacked level; escalators join the nearest escalator one level up
    for a, b in zip(STACKED, STACKED[1:]):
        for i in range(3):
            edge(f'{a}/elevator{i + 1}', f'{b}/elevator{i + 1}', 'elevator', 0)
        ups = [n for n in nodes if n.startswith(f'{b}/escalator')]
        for n in [n for n in nodes if n.startswith(f'{a}/escalator')]:
            pa = (nodes[n]['x'], nodes[n]['y'])
            m = min(ups, key=lambda u: math.dist(pa, (nodes[u]['x'], nodes[u]['y'])))
            if math.dist(pa, (nodes[m]['x'], nodes[m]['y'])) < 20:
                edge(n, m, 'escalator')

    # combined rooms (e.g. "M211+M212", which a programme can book as one room) use the doors of their parts
    for aid, a in areas.items():
        if '+' not in a['name']:
            continue
        names = a['name'][len('Areas '):].split('+') if a['name'].startswith('Areas ') else a['name'].split('+')
        parts = [area_id(a['level'], ('Area ' if a['name'].startswith('Areas ') else '') + p) for p in names]
        if 'doors' not in a and all('doors' in areas.get(p, {}) for p in parts):
            a['doors'] = [d for p in parts for d in areas[p]['doors']]
        if 'rect' not in a and all('rect' in areas.get(p, {}) for p in parts):
            rs = [areas[p]['rect'] for p in parts]
            a['rect'] = [min(r[0] for r in rs), min(r[1] for r in rs), max(r[2] for r in rs), max(r[3] for r in rs)]

    # Auditorium: a separate building, so only distances, no shared coordinates
    nodes['AUD/foyer'] = {'level': 'AUD', 'kind': 'corridor', 'x': None, 'y': None, 'name': 'Connecting Walkway'}
    nodes['AUD-auditorium/door'] = {'level': 'AUD', 'kind': 'door', 'x': None, 'y': None, 'estimate': True}
    edge('P0-access-a/door', 'AUD/foyer', 'walk', AUDITORIUM['walkway'])
    edge('AUD/foyer', 'AUD-auditorium/door', 'walk', AUDITORIUM['foyerToStalls'], estimate=True)
    areas.setdefault('AUD-auditorium', {'level': 'AUD', 'name': 'Auditorium'})['doors'] = ['AUD-auditorium/door']

    out = {
        'venue': 'ccib',
        'name': 'Centre de Convencions Internacional de Barcelona (CCIB)',
        'source': {'title': 'Floorplans & capacities, CCIB | 2026', 'url': SOURCE_URL,
                   'sha256': hashlib.sha256(raw).hexdigest(), 'extractedBy': 'data/scripts/venue-ccib.py'},
        'frame': {
            'units': 'metres',
            'axes': 'x to the right, y down, as drawn on the PDF plans (north is not marked). All stacked levels share one frame; AUD has no coordinates.',
            'metresPerPoint': round(mpp, 5),
            'scaleCheck': f'room sizes on the plan within {scale_error:.1%} of the table',
            'levelAlignment': f'P0, M1, M2, P2 mapped onto P1 by the three elevator shafts, worst shaft off by {shaft_error * mpp:.1f} m',
        },
        'levels': [{'id': lv['id'], 'name': lv['name']} for lv in LEVELS],
        'areas': dict(sorted(areas.items())),
        'corridors': corridors,
        'nodes': nodes,
        'edges': edges,
    }
    with open(OUT, 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(f'{OUT}: {len(areas)} areas ({sum("doors" in a for a in areas.values())} with doors), {len(nodes)} nodes, '
          f'{len(edges)} edges; {mpp:.4f} m/pt (scale within {scale_error:.1%}), shafts aligned within {shaft_error * mpp:.1f} m')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
