import argparse
import os
import sys

SKILL_SCRIPTS = os.path.expanduser('~/.config/chipagents/config2/skills/pptx-generator/scripts')
sys.path.insert(0, SKILL_SCRIPTS)

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.dml import MSO_THEME_COLOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Inches, Pt

from pptx_template import (TEMPLATE_PATH, convert_potx_to_pptx, clear_slides, get_placeholder,
                           remove_unused_placeholders, apply_footer, set_placeholder_text, verify_pptx)

WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GREEN = RGBColor(0x2E, 0x7D, 0x32)
RED = RGBColor(0xB3, 0x26, 0x1E)
AMBER = RGBColor(0xB2, 0x6A, 0x00)
GRAY = RGBColor(0x60, 0x60, 0x60)
CODE_BG = RGBColor(0x1E, 0x1E, 0x1E)
CODE_FG = RGBColor(0xD4, 0xD4, 0xD4)
DIFF_ADD = RGBColor(0x6A, 0xD3, 0x6F)
DIFF_DEL = RGBColor(0xF2, 0x6D, 0x6D)
MONO = 'Consolas'
A1, A2, A3, A4 = (MSO_THEME_COLOR.ACCENT_1, MSO_THEME_COLOR.ACCENT_2,
                  MSO_THEME_COLOR.ACCENT_3, MSO_THEME_COLOR.ACCENT_4)
D1, D2 = MSO_THEME_COLOR.DARK_1, MSO_THEME_COLOR.DARK_2
BOXES = []


def track(name, x, y, w, h):
    BOXES.append((name, x, y, w, h))


def check_layout(slide_name):
    for i, (n1, x1, y1, w1, h1) in enumerate(BOXES):
        if x1 < 0.3 or y1 < 1.3 or x1 + w1 > 13.05 or y1 + h1 > 6.95:
            print(f'  WARN [{slide_name}] {n1} outside safe area')
        for n2, x2, y2, w2, h2 in BOXES[i + 1:]:
            if not (x1 + w1 <= x2 or x2 + w2 <= x1 or y1 + h1 <= y2 or y2 + h2 <= y1):
                print(f'  WARN [{slide_name}] {n1} overlaps {n2}')
    BOXES.clear()


def _color(font, color):
    if isinstance(color, RGBColor):
        font.color.rgb = color
    else:
        font.color.theme_color = color


def _style_text(tf, lines, size, bold, color, align, font=None, body_size=None):
    tf.word_wrap = True
    tf.clear()
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = line
        p.alignment = align
        p.font.size = Pt(size if i == 0 or body_size is None else body_size)
        p.font.bold = bold if i == 0 else False
        if font:
            p.font.name = font
        _color(p.font, color)


def _fill(shape, fill, brightness=0.0):
    shape.fill.solid()
    if isinstance(fill, RGBColor):
        shape.fill.fore_color.rgb = fill
    else:
        shape.fill.fore_color.theme_color = fill
        shape.fill.fore_color.brightness = brightness


def box(slide, name, x, y, w, h, lines, fill, brightness=0.0, size=13, bold=True, text_color=WHITE,
        shape=MSO_SHAPE.ROUNDED_RECTANGLE, font=None, align=PP_ALIGN.CENTER, line_color=None,
        tracked=True, body_size=None, anchor=MSO_ANCHOR.MIDDLE):
    s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    _fill(s, fill, brightness)
    if line_color is None:
        s.line.fill.background()
    else:
        _color(s.line, line_color)
        s.line.width = Pt(1.5)
    tf = s.text_frame
    tf.margin_left = tf.margin_right = Inches(0.1)
    tf.margin_top = tf.margin_bottom = Inches(0.05)
    tf.vertical_anchor = anchor
    _style_text(tf, lines if isinstance(lines, list) else [lines], size, bold, text_color, align, font,
                body_size)
    if tracked:
        track(name, x, y, w, h)
    return s


def container(slide, x, y, w, h, label, color, fill=None):
    lbl = slide.shapes.add_textbox(Inches(x), Inches(y - 0.36), Inches(w), Inches(0.32))
    _style_text(lbl.text_frame, [label], 13, True, color, PP_ALIGN.LEFT)
    s = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    s.adjustments[0] = 0.04
    _fill(s, fill if fill is not None else color, 0.85)
    _color(s.line, color)
    s.line.width = Pt(1.25)
    return s


def text(slide, x, y, w, h, lines, size=11, bold=False, color=D1, align=PP_ALIGN.LEFT, font=None,
         name=None, italic=False):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tb.text_frame.margin_left = tb.text_frame.margin_right = Inches(0.02)
    _style_text(tb.text_frame, lines if isinstance(lines, list) else [lines], size, bold, color, align, font)
    if italic:
        for p in tb.text_frame.paragraphs:
            p.font.italic = True
    if name:
        track(name, x, y, w, h)
    return tb


def code(slide, name, x, y, w, h, rows, size=11, title=None):
    s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    _fill(s, CODE_BG)
    s.line.fill.background()
    tf = s.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.TOP
    tf.margin_left = tf.margin_right = Inches(0.15)
    tf.margin_top = Inches(0.12)
    allrows = ([(title, WHITE)] if title else []) + rows
    for i, (t, c) in enumerate(allrows):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = t
        p.font.name = MONO
        p.font.size = Pt(size)
        p.font.color.rgb = c
        p.font.bold = bool(title) and i == 0
        p.alignment = PP_ALIGN.LEFT
    track(name, x, y, w, h)
    return s


def arrow(slide, x, y, w, h, direction='right', color=D2):
    shp = {'right': MSO_SHAPE.RIGHT_ARROW, 'left': MSO_SHAPE.LEFT_ARROW,
           'down': MSO_SHAPE.DOWN_ARROW, 'up': MSO_SHAPE.UP_ARROW}[direction]
    a = slide.shapes.add_shape(shp, Inches(x), Inches(y), Inches(w), Inches(h))
    _fill(a, color)
    a.line.fill.background()
    return a


def badge(slide, x, y, n, color=A1, d=0.42):
    b = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(y), Inches(d), Inches(d))
    _fill(b, color)
    b.line.color.rgb = WHITE
    b.line.width = Pt(1.5)
    tf = b.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    _style_text(tf, [str(n)], 13, True, WHITE, PP_ALIGN.CENTER)
    return b


def content_slide(prs, title, layout=2):
    slide = prs.slides.add_slide(prs.slide_layouts[layout])
    set_placeholder_text(slide, 0, title, font_size=26, bold=True)
    for idx in (10, 11):
        ph = get_placeholder(slide, idx)
        if ph is not None:
            ph._element.getparent().remove(ph._element)
    return slide


def finish(prs, slide, name):
    apply_footer(slide, prs)
    remove_unused_placeholders(slide)
    check_layout(name)


def source(slide, txt):
    text(slide, 0.55, 6.62, 12.25, 0.3, txt, 9, color=GRAY, italic=True, name='source')


def slide_section(prs, title):
    s = prs.slides.add_slide(prs.slide_layouts[5])
    set_placeholder_text(s, 10, title)
    finish(prs, s, 'section')


def slide_threads(prs):
    s = content_slide(prs, 'Feature: multiple threads and workspaces')
    container(s, 0.55, 1.95, 3.7, 4.55, 'Sidebar (illustrative)', D2)
    items = [('ws', 'Desktop'), ('th', 'Thread: web launcher'), ('th', 'Thread: deck'),
             ('ws', 'migration project'), ('th', 'Thread: DC test port'),
             ('ws', 'stdf-datatool'), ('th', 'Thread: parser update')]
    y = 2.12
    for i, (kind, label) in enumerate(items):
        if kind == 'ws':
            box(s, f'i{i}', 0.72, y, 3.36, 0.46, '▸ ' + label, D2, 0.0, 12, align=PP_ALIGN.LEFT)
            y += 0.56
        else:
            box(s, f'i{i}', 1.0, y, 3.08, 0.42, label, A1, 0.7, 11, bold=False, text_color=D1,
                align=PP_ALIGN.LEFT)
            y += 0.52
    cards = [('Parallel conversations', 'Run and switch between several threads; each keeps its own history.'),
             ('Workspace = a folder on disk', 'Add workspace from the sidebar; threads work in that folder. '
              'Name workspaces and add source folders.'),
             ('Stays in sync', 'Unread markers sync across ports and tabs; deleted threads stay deleted across '
              'browsers.'),
             ('Collaborative Projects', 'Default project per workspace (Edit workspace…); project picker per '
              'thread; current project highlighted in the header.')]
    for i, (h, b) in enumerate(cards):
        y = 1.65 + i * 1.22
        badge(s, 4.6, y + 0.3, i + 1, A1)
        box(s, f'c{i}', 5.15, y, 7.65, 1.05, [h, b], A1, 0.85, 14, text_color=D1, align=PP_ALIGN.LEFT,
            line_color=A1, body_size=12)
    source(s, 'Source: usage/chipagents-web.md; usage/projects.md; CHANGELOG (v0.44.3 docs)')
    finish(prs, s, 'threads')


def slide_diff(prs):
    s = content_slide(prs, 'Feature: file and diff viewer')
    code(s, 'chat', 0.55, 1.6, 5.3, 3.35, [
        ('> widen the free-port range', CODE_FG), ('', CODE_FG),
        ('⏺ Edit(ca-freeport.sh)', DIFF_ADD), ('  ⎿ 1 file changed', CODE_FG),
        ('    ca-freeport.sh  ← click to open', RGBColor(0x6F, 0xB3, 0xF2)), ('', CODE_FG),
        ('⏺ Done. Range is now 4242–4299.', CODE_FG)], 12, title='Chat (illustrative)')
    arrow(s, 5.95, 3.08, 0.5, 0.4, color=A1)
    code(s, 'pane', 6.55, 1.6, 6.25, 3.35, [
        ('  START="${1:-4242}"', CODE_FG), ('- END="${2:-4250}"', DIFF_DEL), ('+ END="${2:-4299}"', DIFF_ADD),
        ('', CODE_FG), ('  for ((p=START; p<=END; p++)); do', CODE_FG)], 12,
        title='Side pane — ca-freeport.sh · run diff')
    feats = [('Any file', 'Open any file the agent read or changed'),
             ('Run diff', '+/− coloring; review edits without leaving the browser'),
             ('Tree / list', 'Diff viewer views; clickable file references in messages'),
             ('Markdown', 'Rendered in the pane, toggle to editable source')]
    for i, (h, b) in enumerate(feats):
        box(s, f'f{i}', 0.55 + i * 3.1, 5.2, 2.95, 1.25, [h, b], A1 if i % 2 == 0 else A2, 0.0, 14,
            body_size=11)
    source(s, 'Source: usage/chipagents-web.md; CHANGELOG (v0.44.3 docs). Chat/diff content is a mock-up.')
    finish(prs, s, 'diff')


def slide_render(prs):
    s = content_slide(prs, 'Feature: rich rendering in the browser')
    cols = [('Syntax highlighting', A1), ('Diagrams in chat', A2), ('Transcript tools', A3)]
    for i, (h, c) in enumerate(cols):
        x = 0.55 + i * 4.175
        box(s, f'h{i}', x, 1.6, 3.9, 0.6, h, c, 0.0, 16)
    code(s, 'syn', 0.55, 2.35, 3.9, 2.4, [('def free_port(lo, hi):', RGBColor(0x6F, 0xB3, 0xF2)),
         ('    for p in range(lo, hi):', RGBColor(0xC5, 0x86, 0xC0)), ('        if ok(p):', RGBColor(0xC5, 0x86, 0xC0)),
         ('            return p', DIFF_ADD), ('    return None', CODE_FG)], 12)
    bx = 4.73
    box(s, 'diag', bx, 2.35, 3.9, 2.4, '', A2, 0.85, line_color=A2)
    for j, lbl in enumerate(['Spec', 'RTL', 'Test']):
        box(s, f'd{j}', bx + 0.15 + j * 1.27, 3.2, 0.95, 0.7, lbl, A2, 0.0, 12, tracked=False)
        if j < 2:
            arrow(s, bx + 1.13 + j * 1.27, 3.41, 0.24, 0.28, color=A2)
    text(s, bx, 4.3, 3.9, 0.35, 'rendered Mermaid / D2 (mock-up)', 10, color=GRAY, align=PP_ALIGN.CENTER)
    box(s, 'tr', 8.91, 2.35, 3.9, 2.4, ['▸ Context compacted', 'click to expand the summary', '',
        'Select text → citation'], A3, 0.85, 14, text_color=D1, line_color=A3, body_size=12)
    caps = ['Tool programs and output are highlighted; scrollback in the browser',
            'Mermaid and D2 render inline; linked diagrams refresh when the source changes; fullscreen and '
            'pinch-zoom',
            'Expand “Context compacted” to read the summary; select transcript text to create citations']
    for i, c in enumerate(caps):
        text(s, 0.55 + i * 4.175, 4.9, 3.9, 1.5, c, 12, name=f'cap{i}')
    source(s, 'Source: usage/chipagents-web.md; CHANGELOG (v0.44.3 docs). Visuals are mock-ups.')
    finish(prs, s, 'render')


GOOD = (RGBColor(0xE6, 0xF4, 0xEA), GREEN, '✓ ')
PART = (RGBColor(0xFF, 0xF3, 0xDC), AMBER, '◐ ')
BAD = (RGBColor(0xFB, 0xE9, 0xE7), RED, '✗ ')


def slide_cover(prs):
    s = prs.slides.add_slide(prs.slide_layouts[0])
    set_placeholder_text(s, 10, 'ChipAgents Web vs. the CLI')
    set_placeholder_text(s, 14, 'Why I work in the browser')
    set_placeholder_text(s, 15, 'ChipAgents v0.44.3 · WSL2 on Windows')
    finish(prs, s, 'cover')


def slide_same_agent(prs):
    s = content_slide(prs, 'Same agent, two front ends')
    box(s, 'cli', 0.55, 1.75, 3.5, 1.5, ['Terminal CLI', '$ chipagents'], D2, 0.0, 16, body_size=13)
    arrow(s, 4.15, 2.3, 0.55, 0.4, color=D2)
    box(s, 'engine', 4.8, 1.75, 3.75, 1.5, ['The same ChipAgents agent', 'tools · rules · skills · login',
        'slash commands · subagents · thinking modes'], A1, 0.0, 15, body_size=11)
    arrow(s, 8.65, 2.3, 0.55, 0.4, 'left', A2)
    box(s, 'web', 9.3, 1.75, 3.5, 1.5, ['Browser', '$ chipagents web', 'localhost:4242/hub'], A2, 0.0, 16,
        body_size=12)
    box(s, 'quote', 0.55, 3.6, 12.25, 0.85, '“Reuses the same agent, tools, configuration, and login as '
        'chipagents, so behavior is at parity with the terminal.”', A1, 0.85, 15, bold=False, text_color=A1,
        line_color=A1)
    cards = [('Same results', 'The agent, models and tools are identical'),
             ('Nothing to re-learn', 'Slash and custom commands work in the same session'),
             ('Pick per task', 'Both front ends stay installed; use either one')]
    for i, (h, b) in enumerate(cards):
        box(s, f'c{i}', 0.55 + i * 4.175, 4.75, 3.9, 1.1, [h, b], A1 if i != 1 else A2, 0.0, 15, body_size=12)
    text(s, 0.55, 6.05, 12.25, 0.4, 'The difference is the workspace around the agent, not the agent.', 15,
         True, A1, PP_ALIGN.CENTER, name='takeaway')
    source(s, 'Source: ChipAgents docs v0.44.3, usage/chipagents-web.md ("Use cases", "CLI feature parity")')
    finish(prs, s, 'same_agent')


def slide_compare(prs):
    s = content_slide(prs, 'Side by side: what each one gives you')
    heads = [('What I want to do', D1), ('CLI (terminal)', D2), ('Web (built in)', A2), ('Web + paste add-on', A1)]
    cols = [(0.55, 2.75), (3.4, 3.05), (6.55, 3.05), (9.7, 3.1)]
    for (h, c), (x, w) in zip(heads, cols):
        box(s, f'h{h}', x, 1.45, w, 0.42, h, c, 0.0, 12)
    rows = [
        ('Run several tasks at once', (PART, 'Switch threads with /history'), (GOOD, 'Parallel threads'),
         (GOOD, 'Same as Web')),
        ('Review the agent\'s edits', (PART, 'Diff at confirm; long diffs cut'), (GOOD, 'Side-pane file + diff'),
         (GOOD, 'Same as Web')),
        ('Read diagrams and docs', (BAD, 'Mermaid as plain text'), (GOOD, 'Mermaid, D2, Markdown rendered'),
         (GOOD, 'Same as Web')),
        ('Know when a run finishes', (BAD, 'Keep watching the terminal'), (GOOD, 'Notifications + unread'),
         (GOOD, 'Same as Web')),
        ('Show it a screenshot', (PART, 'Save it, type the path'), (PART, 'Save it, type the path'),
         (GOOD, 'Ctrl+V / drop, thumbnail')),
        ('Give it files or folders', (GOOD, '@path picker (files, dirs)'), (PART, 'Type the path'),
         (GOOD, 'Drop any file or folder')),
        ('Keep history and files', (PART, '/export to plain .txt'), (PART, 'Threads in the sidebar'),
         (GOOD, 'Folder per chat, all files')),
        ('Make a picture', (PART, 'Ask for SVG, convert it'), (PART, 'Ask for SVG, convert it'),
         (GOOD, '/img png <description>')),
        ('Scripting and batch runs', (GOOD, 'batch mode, SDK, --prompt'), (BAD, 'Not a scripting tool'),
         (BAD, 'Not a scripting tool')),
    ]
    for r, (task, *cells) in enumerate(rows):
        y = 1.95 + r * 0.5
        box(s, f't{r}', cols[0][0], y, cols[0][1], 0.44, task, D1, 0.9, 11, text_color=D1,
            align=PP_ALIGN.LEFT, line_color=D2)
        for c, ((bg, fg, mark), label) in enumerate(cells, start=1):
            box(s, f'r{r}c{c}', cols[c][0], y, cols[c][1], 0.44, mark + label, bg, 0.0, 11, bold=False,
                text_color=fg, align=PP_ALIGN.LEFT, line_color=fg)
    source(s, '✓ yes  ◐ workaround  ✗ no.  CLI/Web columns: ChipAgents docs v0.44.3 (usage/chipagents-web.md, '
           'usage/capabilities.md, changelog). Last column: local paste-proxy add-on.')
    finish(prs, s, 'compare')


def slide_architecture(prs):
    s = content_slide(prs, 'Add-on: a small proxy in front of the hub')
    box(s, 'browser', 0.55, 1.85, 2.6, 1.3, ['Browser', 'Chrome / Edge', 'localhost:4300/hub'], A2, 0.0, 15,
        body_size=11)
    arrow(s, 3.2, 2.3, 0.5, 0.4, color=A2)
    container(s, 3.8, 1.85, 5.0, 3.05, 'paste-proxy (Node, 127.0.0.1:4300)', A1)
    subs = [('Page add-on', 'paste · drop · chips · previews'), ('Uploads', '/__paste/upload → screens/'),
            ('Previews & downloads', '/__img · /__file (token)'), ('Conversation sync', 'every 5 s → folders')]
    for i, (h, b) in enumerate(subs):
        box(s, f'sub{i}', 3.95 + (i % 2) * 2.4, 2.0 + (i // 2) * 1.45, 2.3, 1.3, [h, b], A1, 0.0, 13,
            body_size=11)
    arrow(s, 8.88, 2.3, 0.5, 0.4, color=A1)
    box(s, 'hub', 9.45, 1.85, 3.35, 1.3, ['chipagents web', '127.0.0.1:4242', 'unchanged'], D2, 0.0, 15,
        body_size=11)
    arrow(s, 10.93, 3.2, 0.4, 0.4, 'down', D2)
    box(s, 'agent', 9.45, 3.65, 3.35, 1.25, ['ChipAgents agent', 'same tools, config, login'], D1, 0.0, 15,
        body_size=11)
    arrow(s, 6.1, 4.95, 0.4, 0.35, 'down', A1)
    box(s, 'disk', 0.55, 5.35, 12.25, 0.6, 'Your disk:  Desktop/screens (pastes, attachments, generated '
        'images)  ·  Desktop/ChipAgents Conversations', A1, 0.85, 13, bold=False, text_color=D1, line_color=A1)
    text(s, 0.55, 6.1, 12.25, 0.4, 'ChipAgents itself is not modified. The add-on only sits in front of the hub.',
         14, True, A1, PP_ALIGN.CENTER, name='takeaway')
    finish(prs, s, 'architecture')


def slide_attach(prs):
    s = content_slide(prs, 'Add-on: images, files and folders straight into the chat')
    steps = [('Ctrl+V or drop', 'image, file or folder'), ('Saved locally', 'screens/ · attachments/'),
             ('Shown in chat box', 'thumbnail or chip'), ('Send', 'path added for the agent'),
             ('Agent reads it', 'View · ExtractPdf · …')]
    for i, (h, b) in enumerate(steps):
        x = 0.55 + i * 2.5
        badge(s, x + 0.86, 1.5, i + 1, D2)
        box(s, f's{i}', x, 1.98, 2.15, 1.1, [h, b], A1 if i % 2 == 0 else A2, 0.0, 14, body_size=11)
        if i < len(steps) - 1:
            arrow(s, x + 2.19, 2.38, 0.27, 0.3)
    container(s, 0.55, 3.75, 6.2, 2.6, 'Chat box (illustrative)', D2)
    box(s, 'thumb', 0.75, 3.92, 1.1, 0.85, ['PNG', 'shot.png'], D2, 0.6, 12, text_color=D1, body_size=10)
    box(s, 'chip1', 2.0, 4.1, 2.0, 0.45, '📄 spec.pdf · 1.2 MB', D2, 0.75, 11, bold=False, text_color=D1)
    box(s, 'chip2', 4.1, 4.1, 2.45, 0.45, '📁 pgms · 40 files · 3 MB', D2, 0.75, 11, bold=False, text_color=D1)
    box(s, 'textarea', 0.75, 4.95, 5.8, 1.2, 'compare the spec with this code and the screenshot', WHITE, 0.0,
        13, bold=False, text_color=GRAY, align=PP_ALIGN.LEFT, line_color=D2, anchor=MSO_ANCHOR.TOP)
    cards = [('Any file type', 'Images get thumbnails; PDF, Excel and code get chips'),
             ('Whole folders', 'Sub-folders kept; up to 2000 files or 1 GB'),
             ('Previews in replies', 'Images shown inline; click for full size'),
             ('/img png <description>', 'The agent draws it; saved and previewed')]
    for i, (h, b) in enumerate(cards):
        box(s, f'c{i}', 7.0, 3.75 + i * 0.68, 5.8, 0.6, [h, b], A1, 0.85, 13, text_color=D1, align=PP_ALIGN.LEFT,
            line_color=A1, body_size=11)
    finish(prs, s, 'attach')


def slide_folders(prs):
    s = content_slide(prs, 'Add-on: every conversation gets its own folder')
    code(s, 'tree', 0.55, 1.6, 6.0, 3.76, [
        ('Desktop/ChipAgents Conversations/', RGBColor(0x6F, 0xB3, 0xF2)),
        ('└─ 2026-11-06_ADIS1647X_DC_Migration_1a2b3c4d/', CODE_FG),
        ('   ├─ conversation.md', DIFF_ADD),
        ('   ├─ conversation.json', DIFF_ADD),
        ('   ├─ attachments/  shot.png, spec.pdf, pgms/', CODE_FG),
        ('   ├─ generated/    gen_block_diagram.png', CODE_FG),
        ('   └─ files/', CODE_FG),
        ('      ├─ home/…/migration project/…/ADiS16470Fun_DC.vb', RGBColor(0xF2, 0xC2, 0x6D)),
        ('      └─ C/Users/…/Desktop/…/limits.csv', RGBColor(0xF2, 0xC2, 0x6D))], 12,
        title='One folder per conversation (example)')
    cards = [('History', 'conversation.md (readable, images inline) + conversation.json (everything)'),
             ('Attachments and generated images', 'What you pasted or dropped, and what the agent drew'),
             ('Files the agent used', 'Copies of every file it read, created or edited, under the original path'),
             ('Always current', 'Updated after every message and reply; older chats when opened')]
    for i, (h, b) in enumerate(cards):
        box(s, f'c{i}', 6.8, 1.6 + i * 0.97, 6.0, 0.85, [h, b], A1 if i % 2 == 0 else A2, 0.0, 14,
            align=PP_ALIGN.LEFT, body_size=11)
    box(s, 'never', 0.55, 5.6, 12.25, 0.75, 'Never copied: secret-looking files (.pem, .key, credentials.json, '
        '.env, ~/.ssh), system paths and files over 100 MB; each is listed with the reason. Originals are never '
        'moved or changed.', AMBER, size=12, bold=False)
    finish(prs, s, 'folders')


def slide_launcher(prs):
    s = content_slide(prs, 'Add-on: ready for anyone with one double-click')
    steps = [('Double-click', 'chipagents-web-paste.bat'), ('start.sh', 'checks node + chipagents'),
             ('CA certificates', 'auto-export ADI / Netskope'), ('Stop old copies', 'no port clashes'),
             ('Browser opens', 'signed-in link')]
    for i, (h, b) in enumerate(steps):
        x = 0.55 + i * 2.5
        badge(s, x + 0.86, 1.5, i + 1, D2)
        box(s, f's{i}', x, 1.98, 2.15, 1.2, [h, b], A1 if i % 2 == 0 else A2, 0.0, 13, body_size=11)
        if i < len(steps) - 1:
            arrow(s, x + 2.19, 2.43, 0.27, 0.3)
    code(s, 'steps', 0.55, 3.55, 6.6, 2.3, [
        ('1. Download ZIP of branch multi_user_support', CODE_FG),
        ('   github.com/jcortez3/chipagents_web', RGBColor(0x6F, 0xB3, 0xF2)),
        ('2. Unzip it anywhere', CODE_FG),
        ('3. Double-click chipagents-web-paste.bat', DIFF_ADD),
        ('4. Sign in once on the first run', CODE_FG)], 14, title='What a colleague does')
    box(s, 'fixed', 7.4, 3.55, 5.4, 2.3, ['Problems already solved', '• “No such file or directory”: no '
        'hard-coded paths', '• “self signed certificate”: Netskope certificates exported',
        '• “no hub access token”: token picked up from the page', '• Folder window instead of the browser'],
        GREEN, 0.0, 15, align=PP_ALIGN.LEFT, body_size=12)
    text(s, 0.55, 6.1, 12.25, 0.4, 'The same package works for every user and folder: nothing to edit.', 14,
         True, A1, PP_ALIGN.CENTER, name='takeaway')
    finish(prs, s, 'launcher')


def slide_security(prs):
    s = content_slide(prs, 'Add-on: safe by design')
    box(s, 'req', 0.55, 1.75, 1.9, 1.3, ['Request', 'from the browser'], D2, 0.0, 14, body_size=11)
    gates = [('Loopback only', '127.0.0.1', 'Not reachable from other machines'),
             ('Hub token', 'same as the hub', 'Needed for every upload, preview and download'),
             ('Allowed folders', 'workspaces · screens', 'Only your workspaces and the paste/conversation folders')]
    for i, (h, sub, desc) in enumerate(gates):
        x = 3.0 + i * 2.85
        arrow(s, x - 0.48, 2.2, 0.4, 0.4)
        box(s, f'g{i}', x, 1.75, 2.4, 1.3, [h, sub], A1, 0.0, 14, body_size=11)
        text(s, x, 3.15, 2.4, 0.8, desc, 11, align=PP_ALIGN.CENTER, name=f'gd{i}')
    arrow(s, 11.07, 2.2, 0.4, 0.4, color=GREEN)
    box(s, 'ok', 11.55, 1.75, 1.25, 1.3, ['File', 'served'], GREEN, size=13, body_size=11)
    box(s, 'sandbox', 0.55, 4.15, 6.0, 0.95, ['Previews are sandboxed', 'Strict content policy and nosniff; '
        'downloads are sent as attachments'], A1, 0.85, 13, text_color=D1, line_color=A1, body_size=11)
    box(s, 'secret', 6.8, 4.15, 6.0, 0.95, ['Secrets stay put', 'Secret-looking files are never copied into '
        'folders or served'], A1, 0.85, 13, text_color=D1, line_color=A1, body_size=11)
    box(s, 'local', 0.55, 5.35, 12.25, 0.8, 'Everything stays on your PC. The add-on sends nothing anywhere; '
        'only normal ChipAgents traffic leaves the machine.', GREEN, size=14, bold=False)
    finish(prs, s, 'security')


def slide_cli_still(prs):
    s = content_slide(prs, 'When the CLI is still the right tool, and known limits')
    container(s, 0.55, 1.9, 6.0, 4.4, 'Use the CLI for', D2)
    cli = [('Scripting and CI', 'chipagents batch, Python SDK, --prompt'),
           ('Remote servers, no port forward', 'Just SSH in and run chipagents'),
           ('Thread to plain text', 'chipagents export or /export')]
    for i, (h, b) in enumerate(cli):
        box(s, f'cli{i}', 0.75, 2.1 + i * 1.38, 5.6, 1.18, [h, b], D2, 0.0, 15, body_size=12)
    container(s, 6.8, 1.9, 6.0, 4.4, 'Known limits of the add-on', AMBER, PART[0])
    lim = [('Unofficial', 'Uses the hub\'s internal API (checked on 0.44.3)'),
           ('Subagent files', 'Files only a subagent touched are not copied'),
           ('Launcher must run', 'History is saved only while it is open'),
           ('Needs the paste launcher', 'Plain chipagents web has no paste or folders')]
    for i, (h, b) in enumerate(lim):
        box(s, f'lim{i}', 7.0, 2.1 + i * 1.03, 5.6, 0.88, [h, b], WHITE, 0.0, 14, text_color=AMBER,
            align=PP_ALIGN.LEFT, line_color=AMBER, body_size=12)
    source(s, 'Source: usage/batch-mode.md, usage/sdk.md, usage/capabilities.md, usage/chipagents-web.md '
           '("Using it over SSH") — v0.44.3 docs')
    finish(prs, s, 'cli_still')


def slide_summary(prs):
    s = content_slide(prs, 'Same agent. A better workspace.')
    tiles = [('See more', 'Rendered diagrams, diffs side by side, image previews'),
             ('Do more at once', 'Parallel threads, notifications when a run finishes'),
             ('Keep everything', 'A folder per conversation with history and every file')]
    for i, (h, b) in enumerate(tiles):
        x = 0.55 + i * 4.175
        badge(s, x + 1.74, 1.5, i + 1, D2)
        box(s, f't{i}', x, 1.98, 3.9, 2.0, [h, b], [A1, A2, A3][i], 0.0, 22, body_size=14)
    box(s, 'get', 0.55, 4.35, 12.25, 1.0, ['Get it', 'github.com/jcortez3/chipagents_web  ·  branch '
        'multi_user_support  →  double-click chipagents-web-paste.bat'], D2, 0.0, 16, body_size=14)
    text(s, 0.55, 5.7, 12.25, 0.5, 'Use Web for daily work; keep the CLI for scripts and quick SSH sessions.',
         16, True, A1, PP_ALIGN.CENTER, name='takeaway')
    finish(prs, s, 'summary')


def slide_end(prs):
    s = prs.slides.add_slide(prs.slide_layouts[21])
    remove_unused_placeholders(s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--output-dir', default=os.path.dirname(os.path.abspath(__file__)))
    args = ap.parse_args()
    tpl = TEMPLATE_PATH
    if tpl.endswith('.potx'):
        tpl = convert_potx_to_pptx(tpl)
    prs = Presentation(tpl)
    clear_slides(prs)
    slide_cover(prs)
    slide_same_agent(prs)
    slide_compare(prs)
    slide_section(prs, 'Built into ChipAgents Web')
    slide_threads(prs)
    slide_diff(prs)
    slide_render(prs)
    slide_section(prs, 'Our add-ons: the paste launcher')
    slide_architecture(prs)
    slide_attach(prs)
    slide_folders(prs)
    slide_launcher(prs)
    slide_security(prs)
    slide_cli_still(prs)
    slide_summary(prs)
    slide_end(prs)
    out = os.path.join(args.output_dir, 'ChipAgents_Web_vs_CLI.pptx')
    prs.save(out)
    print(f'Saved {out}')
    verify_pptx(out, expected_slides=16)


if __name__ == '__main__':
    main()

