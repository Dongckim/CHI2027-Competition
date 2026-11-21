#!/usr/bin/env python3
"""Run retriever commands for real and render the terminal session as PNGs.

Each screenshot is a list of steps. A step runs a shell command in the packaged
model folder and draws the prompt, the command and its actual output; an
interactive step feeds typed topics to the prompt and draws them where they
would be typed. Output: docs/screenshots/*.png

  python scripts/render_terminal.py
"""
import os
import re
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG = os.path.join(ROOT, "dist", "chi2026-retriever")
OUT = os.path.join(ROOT, "docs", "screenshots")
PY = os.path.join(ROOT, ".venv", "bin", "python")
FONT = "/usr/share/fonts/adobe-source-code-pro/SourceCodePro-Regular.otf"
FONT_BOLD = "/usr/share/fonts/adobe-source-code-pro/SourceCodePro-Semibold.otf"
# glyphs Source Code Pro lacks (the Arc's ↻ ⊣ ✦ ⤨): drawn with DejaVu on the same grid
FONT_FALLBACK = "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf"
FALLBACK_CHARS = set("↻⊣✦⤨◆▲●✚■★⬢⬟")
PROMPT = "user@gsai:~/chi2026-retriever$ "
COLS = 112

BG, BAR, FG, DIM, GREEN, BLUE, YELLOW, RED = (
    "#1e1f22", "#2b2d31", "#d4d4d4", "#8b8f98", "#7ec699", "#79b8ff", "#e5c07b", "#f07178")

SHOTS = {
    "1_json_io": [
        ("cmd", """python retriever.py '{"research_topic": "haptic feedback for VR", "top_k": 2}'"""),
    ],
    "2_interactive": [
        ("interactive", ("python retriever.py", ["privacy in wearable cameras"])),
    ],
    "4_explorer": [
        ("interactive", ("python explorer.py",
                         ["institution=postech top_k=4", 'country=korea day=tuesday type=demo top_k=2'])),
    ],
    "5_explorer_more": [
        ("interactive", ("python explorer.py",
                         ["list=sessions top_k=6", "session=haptic day=monday top_k=2",
                          "institution=kaist department=computing topic=accessibility top_k=2"])),
    ],
    "6_explorer_single": [
        ("interactive", ("python explorer.py",
                         ["country=japan top_k=2", 'author="geehyuk lee" top_k=2',
                          'session="older adults" top_k=2', "type=workshop top_k=2"])),
    ],
    "7_arc_route_json": [
        ("cmd", """python arc.py '{"screen": "route", "day": "tue", "now": "2026-04-14T11:15:00+02:00", "profile": {"research": "haptic feedback for virtual reality to help older adults exercise at home", "pace": "balanced", "step_free": true}}' 2>/dev/null | python -c 'import json,sys; o=json.load(sys.stdin); print(json.dumps({k: o[k] for k in ("state","progress","now_card","rows","more_for_today")}, ensure_ascii=False, indent=1))' | head -70"""),
    ],
    "8_arc_route": [
        ("interactive", ("python arc.py",
                         ['screen=route day=tue pace=balanced step_free=true now=2026-04-14T11:15:00+02:00 '
                          'research="haptic feedback for virtual reality to help older adults exercise at home"'])),
    ],
    "9_arc_route_overlap": [
        ("interactive", ("python arc.py",
                         ['screen=route day=wed now=2026-04-15T12:05:00+02:00 research="privacy in wearable cameras" '
                          'state=\'{"removed": [229707]}\''])),
    ],
    "10_arc_route_alternatives": [
        ("interactive", ("python arc.py",
                         ['screen=route day=wed research="privacy in wearable cameras"'])),
    ],
    "11_arc_clusters": [
        ("interactive", ("python arc.py",
                         ['screen=clusters research="haptic feedback for VR" top_k=4',
                          'screen=clusters cluster=c14 research="haptic feedback for VR" top_k=4'])),
    ],
    "12_arc_choices_grades": [
        ("interactive", ("python arc.py",
                         ['screen=route day=tue research="haptic feedback for virtual reality"'])),
    ],
    "13_arc_start_plan": [
        ("interactive", ("python arc.py",
                         ['screen=start state=\'{"cart": [222748, 230197]}\'',
                          'screen=plan state=\'{"cart": [222748, 222040, 221933, 222531, 230197]}\''])),
    ],
    "14_web_on_device": [
        ("cmd", "node web/cli.mjs bench"),
        ("cmd", """node web/cli.mjs retriever '{"research_topic": "hapitc feedbak for virtal reality", "top_k": 2}' | head -24"""),
    ],
    # the Arc engine (angles.py), Figma page "final" screens 07-20
    "15_angles_json_io": [
        ("cmd", """python angles.py '{"screen": "node", "question": "Does VR fidelity raise presence?", "id": 222304}' | head -46"""),
    ],
    "16_angles_ask_chips": [
        ("cmd", """python angles.py --pretty '{"screen": "ask", "text": "VR presence"}'"""),
        ("cmd", """python angles.py --pretty '{"screen": "ask", "text": "Does VR fidelity raise presence?"}'"""),
        ("cmd", """python angles.py --pretty '{"screen": "angles", "question": "Does VR fidelity raise presence?"}'"""),
    ],
    "17_angles_arc": [
        ("cmd", """python angles.py --pretty '{"screen": "arc", "question": "Does VR fidelity raise presence?", "days": "today", "now": "2026-04-14T13:30:00+02:00", "chips": ["support:fidel", "reframe:avatar"]}'"""),
        ("cmd", """python angles.py --pretty '{"screen": "arc", "question": "Do AI explanations increase user trust?", "days": "week"}'"""),
    ],
    "18_angles_edit": [
        ("cmd", """python angles.py --pretty '{"screen": "edit", "question": "Does VR fidelity raise presence?", "days": "tue", "nodes": [222323, 222304, 222447, 229524], "node": 222447}'"""),
        ("cmd", """python angles.py --pretty '{"screen": "edit", "question": "Does VR fidelity raise presence?", "days": "tue", "nodes": [222323, 222304, 222447, 229524], "search": "virtual reality", "k": 5}'"""),
        ("cmd", """python angles.py --pretty '{"screen": "edit", "question": "Does VR fidelity raise presence?", "days": "tue", "nodes": [222323, 222304], "add": "reframe", "filter": "wildcard", "k": 3}'"""),
    ],
    "19_angles_node_shared": [
        ("cmd", """python angles.py --pretty '{"screen": "node", "question": "Does VR fidelity raise presence?", "id": 222304}'"""),
        ("cmd", """python angles.py --pretty '{"screen": "shared", "question": "Does VR fidelity raise presence?", "ids": [222323, 222304, 222447, 229524, 229441], "now": "2026-04-14T14:30:00+02:00"}'"""),
    ],
    "20_angles_list_home": [
        ("cmd", """python angles.py --pretty '{"screen": "summary", "question": "Does VR fidelity raise presence?", "ids": [222323, 222304, 222447, 229524, 229441], "heard": [222323], "now": "2026-04-14T13:30:00+02:00"}'"""),
        ("cmd", """python angles.py --pretty '{"screen": "home", "now": "2026-04-14T09:00:00+02:00", "arcs": [{"question": "Does VR fidelity raise presence?", "ids": [222304, 222447]}, {"question": "What is accessibility research asking now?", "ids": [221863]}, {"question": "Can agents explain their choices?", "ids": [221942], "heard": [221942]}]}'"""),
        ("cmd", """python angles.py --pretty '{"screen": "arc", "question": "", "days": "sat"}'"""),
    ],
    "21_angles_web_on_device": [
        ("cmd", "node web/cli.mjs bench | tail -9"),
    ],
    "3_errors_warnings": [
        ("cmd", """python retriever.py '{"top_k": 8}'"""),
        ("cmd", """python retriever.py '{"research_topic": "gaze interaction", "top_k": 0}'"""),
        ("cmd", """python retriever.py '{"research_topic": "haptics", "top_k": 3'"""),
        ("cmd", """python retriever.py '{"research_topic": "asdf qwer zxcv", "top_k": 1}' | head -8"""),
    ],
}


def run(cmd):
    p = subprocess.run(cmd.replace("python ", f"{PY} ", 1), shell=True, cwd=PKG,
                       capture_output=True, text=True)
    text = p.stdout + p.stderr
    if p.returncode and "| head" not in cmd:
        text += f"[exit code {p.returncode}]\n"
    return text


def run_interactive(cmd, topics):
    """Feed lines through a pseudo-terminal; put each typed line after its prompt."""
    feed = "".join(t + "\n" for t in topics) + "q\n"
    p = subprocess.run(["script", "-qc", cmd.replace("python ", f"{PY} ", 1), "/dev/null"],
                       cwd=PKG, input=feed, capture_output=True, text=True)
    out = p.stdout.replace("\r", "")
    out = out[min(i for i in (out.find("CHI 2026 "), out.find("ARC screen API")) if i >= 0):]  # drop echoed keystrokes
    typed = iter(topics + ["q"])
    return re.sub(r"(research topic|explorer|arc)> \n?",
                  lambda m: f"{m.group(1)}> {next(typed, '')}\n", out)


def wrap(line):
    return [line[i:i + COLS] for i in range(0, max(len(line), 1), COLS)]


def lines_for(steps):
    rows = []  # (kind, text)
    for kind, arg in steps:
        if kind == "cmd":
            rows.append(("cmd", arg))
            rows += [("out", l) for l in run(arg).rstrip("\n").split("\n")]
            rows.append(("out", ""))
        else:
            cmd, topics = arg
            rows.append(("cmd", cmd))
            for l in run_interactive(cmd, topics).rstrip("\n").split("\n"):
                rows.append(("typed" if re.match(r"(research topic|explorer|arc)> ", l) else "out", l))
            rows.append(("out", ""))
    rows.append(("cmd", ""))
    return rows


def color_of(text):
    if text.lstrip().startswith(('{"error"', '"error"', "[exit code")):
        return RED
    if text.lstrip().startswith(("! ", '"warnings": [', '"The model', '"None of')) and "[]" not in text:
        return YELLOW
    return FG


def draw(d, x, y, text, fill, font, fb, cw):
    """Text on the monospace grid; characters the font lacks come from the fallback."""
    run, rx = "", x
    for k, ch in enumerate(text):
        if ch in FALLBACK_CHARS:
            if run:
                d.text((rx, y), run, fill=fill, font=font)
            d.text((x + cw * k, y), ch, fill=fill, font=fb)
            run, rx = "", x + cw * (k + 1)
        else:
            run += ch
    if run:
        d.text((rx, y), run, fill=fill, font=font)


def render(name, steps):
    fb = ImageFont.truetype(FONT_FALLBACK, 14)
    font = ImageFont.truetype(FONT, 15)
    bold = ImageFont.truetype(FONT_BOLD, 15)
    cw = font.getlength("M")
    lh, pad, bar = 21, 18, 34
    rows = []
    for kind, text in lines_for(steps):
        first = True
        for part in wrap((PROMPT + text) if kind == "cmd" else text):
            rows.append((kind if first else "cont-" + kind, part))
            first = False
    w = int(cw * COLS + 2 * pad)
    h = bar + pad + lh * len(rows) + pad
    img = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, bar], fill=BAR)
    for i, c in enumerate(("#ff5f57", "#febc2e", "#28c840")):
        d.ellipse([14 + i * 20, 11, 26 + i * 20, 23], fill=c)
    d.text((w / 2, bar / 2), "Terminal — chi2026-retriever", fill=DIM, font=font, anchor="mm")
    y = bar + pad
    for kind, text in rows:
        x = pad
        if kind == "cmd":
            d.text((x, y), PROMPT, fill=GREEN, font=bold)
            d.text((x + cw * len(PROMPT), y), text[len(PROMPT):], fill="#ffffff", font=font)
        elif kind == "cont-cmd":
            d.text((x, y), text, fill="#ffffff", font=font)
        elif kind == "typed":
            prompt = text[:text.index("> ") + 2]
            d.text((x, y), prompt, fill=BLUE, font=bold)
            d.text((x + cw * len(prompt), y), text[len(prompt):], fill="#ffffff", font=font)
        else:
            draw(d, x, y, text, color_of(text), font, fb, cw)
        y += lh
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + ".png")
    img.save(path)
    print(path, img.size, len(rows), "lines")


if __name__ == "__main__":
    for name, steps in SHOTS.items():
        if len(sys.argv) == 1 or name in sys.argv[1:]:
            render(name, steps)
