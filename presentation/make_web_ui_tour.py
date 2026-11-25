# jcortez3
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Inches, Pt

from make_web_vs_cli import (Presentation, PP_ALIGN, TEMPLATE_PATH, convert_potx_to_pptx, clear_slides,
                             remove_unused_placeholders, set_placeholder_text, verify_pptx, box, text, code, badge,
                             content_slide, finish, source, WHITE, GREEN, AMBER, GRAY, CODE_FG, DIFF_ADD, DIFF_DEL,
                             A1, A2, A3, D1, D2, PART)
from make_web_guide import ui, UI_BG, UI_SIDE, UI_BOX, UI_TXT, UI_DIM, UI_SEL, TEAL

VERSION = '0.46.2'
SRC = 'Source: ChipAgents Web v0.46.2 page'
CAPTION = 'Illustration of the page (labels as shown in ChipAgents Web v0.46.2)'


def caption(s, x, y, w):
    text(s, x, y, w, 0.2, CAPTION, 9, color=GRAY, italic=True)


def card(s, name, n, x, y, w, h, head, body, color=A1, size=13, body_size=10):
    badge(s, x, y + (h - 0.38) / 2, n, AMBER, 0.38)
    box(s, name, x + 0.48, y, w - 0.48, h, [head, body], color, 0.88, size, text_color=D1, align=PP_ALIGN.LEFT,
        line_color=color, body_size=body_size)


def marks(s, pts):
    for i, (x, y) in enumerate(pts):
        badge(s, x, y, i + 1, AMBER, 0.38)


def slide_cover(prs):
    s = prs.slides.add_slide(prs.slide_layouts[0])
    set_placeholder_text(s, 10, 'ChipAgents Web: A Tour of the Page')
    set_placeholder_text(s, 14, 'What each part of the screen does')
    set_placeholder_text(s, 15, f'ChipAgents v{VERSION}')
    finish(prs, s, 'cover')


def slide_glance(prs):
    s = content_slide(prs, 'The page at a glance: five areas')
    ui(s, 0.55, 1.45, 8.75, 4.9, '', UI_BG, shape=MSO_SHAPE.RECTANGLE)
    ui(s, 0.55, 1.45, 1.9, 4.9, '', UI_SIDE, shape=MSO_SHAPE.RECTANGLE)
    ui(s, 0.6, 1.53, 1.1, 0.3, 'ChipAgents', UI_SIDE, 10, bold=True)
    ui(s, 1.7, 1.56, 0.7, 0.24, f'v{VERSION}', UI_BOX, 7, UI_DIM, align=PP_ALIGN.CENTER)
    ui(s, 0.6, 1.95, 1.8, 0.28, '✎  New Thread', UI_SIDE, 9)
    ui(s, 0.6, 2.35, 1.8, 0.28, '▾  my-project', UI_SEL, 9)
    ui(s, 0.75, 2.68, 1.65, 0.26, 'Fix SPI timing', UI_SIDE, 8, UI_DIM)
    ui(s, 0.75, 2.97, 1.65, 0.26, 'DC test review', UI_SIDE, 8, UI_DIM)
    ui(s, 0.6, 5.95, 1.8, 0.28, '⚙  Settings', UI_SIDE, 9)
    ui(s, 2.55, 1.52, 2.4, 0.3, 'Fix SPI timing', UI_BG, 10, bold=True)
    ui(s, 5.55, 1.53, 0.75, 0.28, 'Share', UI_BOX, 8, align=PP_ALIGN.CENTER)
    ui(s, 3.95, 2.05, 2.35, 0.4, 'Why does SPI fail at 10 MHz?', UI_SEL, 8)
    ui(s, 2.55, 2.6, 3.75, 0.55, ['Reading spi_ctrl.sv …', 'The CS setup is one cycle short.'], UI_BG, 8)
    ui(s, 2.55, 3.25, 3.75, 0.32, '▸  Read   rtl/spi_ctrl.sv', UI_BOX, 8, UI_DIM)
    ui(s, 2.55, 3.65, 3.75, 0.32, '▸  Edit   rtl/spi_ctrl.sv    +3 −1', UI_BOX, 8, UI_DIM)
    ui(s, 2.55, 4.05, 3.75, 0.45, 'Fixed. Re-run the test to confirm.', UI_BG, 8)
    ui(s, 2.55, 5.3, 3.75, 0.95, '', UI_BOX)
    ui(s, 2.62, 5.36, 2.9, 0.3, 'Write a reply...', UI_BOX, 8, UI_DIM)
    ui(s, 2.62, 5.86, 1.0, 0.25, 'Auto review ▾', UI_BOX, 7, UI_DIM)
    ui(s, 3.65, 5.86, 1.1, 0.25, 'Default model ▾', UI_BOX, 7, UI_DIM)
    ui(s, 4.78, 5.86, 0.85, 0.25, 'Thinking ▾', UI_BOX, 7, UI_DIM)
    ui(s, 5.95, 5.84, 0.28, 0.28, '↑', TEAL, 9, WHITE, True, PP_ALIGN.CENTER)
    ui(s, 6.45, 1.45, 2.85, 4.9, '', UI_SIDE, shape=MSO_SHAPE.RECTANGLE)
    x = 6.5
    for label, w in [('Files', 0.48), ('Review', 0.56), ('Terminal', 0.64), ('Agents', 0.56), ('Tasks', 0.5)]:
        ui(s, x, 1.52, w, 0.26, label, UI_SEL if label == 'Review' else UI_BOX, 7, align=PP_ALIGN.CENTER)
        x += w + 0.02
    ui(s, 6.55, 1.95, 2.65, 1.35, ['▾ rtl', '     spi_ctrl.sv        M', '     spi_top.sv', '▾ tb',
                                   '     spi_tb.sv'], UI_SIDE, 8, UI_DIM)
    ui(s, 6.55, 3.45, 2.65, 1.0, ['spi_ctrl.sv', '−  cs_setup <= 1;', '+  cs_setup <= 2;'], UI_BOX, 8)
    marks(s, [(1.3, 4.0), (5.1, 1.48), (2.55, 4.7), (5.55, 5.32), (8.75, 5.8)])
    legend = [('Left sidebar', 'Workspaces, threads, workflows, Settings'),
              ('Thread header', 'Thread title and Share'),
              ('Transcript', 'Replies, tool calls, diffs, diagrams'),
              ('Composer', 'Type, attach, pick mode, model, thinking'),
              ('Right pane', 'Files, Review, Terminal, Agents, Tasks')]
    for i, (h, b) in enumerate(legend):
        card(s, f'lg{i}', i + 1, 9.55, 1.45 + i * 0.98, 3.25, 0.88, h, b, size=14, body_size=11)
    caption(s, 0.55, 6.42, 8.75)
    source(s, SRC)
    finish(prs, s, 'glance')


def slide_sidebar(prs):
    s = content_slide(prs, '1. The left sidebar')
    ui(s, 0.55, 1.45, 3.3, 4.9, '', UI_SIDE, shape=MSO_SHAPE.RECTANGLE)
    ui(s, 0.62, 1.55, 1.3, 0.32, 'ChipAgents', UI_SIDE, 11, bold=True)
    ui(s, 1.95, 1.58, 0.8, 0.27, f'v{VERSION}', UI_BOX, 8, UI_DIM, align=PP_ALIGN.CENTER)
    ui(s, 2.8, 1.58, 0.95, 0.27, 'Web ▾', UI_BOX, 8, UI_DIM, align=PP_ALIGN.CENTER)
    ui(s, 0.62, 2.0, 3.13, 0.32, '✎   New Thread', UI_SIDE, 10)
    ui(s, 0.62, 2.37, 3.13, 0.32, '▶   Start Workflow', UI_SIDE, 10)
    ui(s, 0.62, 2.74, 3.13, 0.32, '◇   Workflow Editor', UI_SIDE, 10)
    ui(s, 0.62, 3.2, 2.6, 0.28, 'WORKSPACES', UI_SIDE, 8, UI_DIM)
    ui(s, 3.3, 3.2, 0.45, 0.28, '+', UI_BOX, 10, align=PP_ALIGN.CENTER)
    ui(s, 0.62, 3.55, 2.3, 0.32, '▾  my-project', UI_SEL, 10)
    ui(s, 2.95, 3.55, 0.38, 0.32, '⋯', UI_SEL, 10, align=PP_ALIGN.CENTER)
    ui(s, 3.36, 3.55, 0.39, 0.32, '+', UI_SEL, 10, align=PP_ALIGN.CENTER)
    ui(s, 0.85, 3.92, 2.9, 0.28, '◌  Fix SPI timing          Running', UI_SIDE, 8)
    ui(s, 0.85, 4.22, 2.9, 0.28, '?  Review DC limits     Waiting', UI_SIDE, 8)
    ui(s, 0.85, 4.52, 2.9, 0.28, '✓  Block diagram            Done', UI_SIDE, 8, UI_DIM)
    ui(s, 0.85, 4.82, 2.9, 0.26, 'Show more', UI_SIDE, 8, UI_DIM)
    ui(s, 0.62, 5.2, 3.13, 0.32, '▸  Desktop', UI_SIDE, 10)
    ui(s, 0.62, 5.95, 3.13, 0.32, '⚙   Settings', UI_SIDE, 10)
    marks(s, [(3.92, 1.52), (3.92, 1.97), (3.92, 2.53), (3.92, 3.15), (3.92, 3.6), (3.92, 4.3), (3.92, 5.92)])
    items = [('Brand, version, mode', f'v{VERSION} pill and Update button (from the launcher). "Web ▾", when shown, '
              'switches to the Formal hub, which has its own threads'),
             ('New Thread', 'Opens the new-thread page for the selected workspace'),
             ('Start Workflow · Workflow Editor', 'Built-in: Spec to RTL, Static Signoff, RCA Triage, plus your own '
              'and plugin workflows. The editor builds and copies workflows'),
             ('+ Add workspace', 'Give it a name and pick one or more source folders the agent can work in'),
             ('A workspace', 'Click to fold or unfold. + starts a thread in it. ⋯ menu: Edit workspace…, Copy source '
              'path, Mark all as read, Remove workspace'),
             ('Its threads', 'Click to open. Status shows Running, Waiting for you, Done or Failed; unread replies are '
              'marked. Show more loads older threads'),
             ('Settings', 'Theme, notifications, default model, usage and advanced options (see the Settings slide)')]
    for i, (h, b) in enumerate(items):
        col, row = divmod(i, 4)
        card(s, f'sb{i}', i + 1, 4.5 + col * 4.2, 1.45 + row * 1.22, 4.1, 1.12, h, b)
    box(s, 'thmenu', 8.7, 1.45 + 3 * 1.22, 4.1, 1.12, ['Thread menu', 'Rename thread · Copy thread ID · Delete thread'],
        D2, 0.88, 13, text_color=D2, align=PP_ALIGN.LEFT, line_color=D2, body_size=10)
    caption(s, 0.55, 6.42, 8.0)
    source(s, f'{SRC} (sidebar, workspace and thread menus); changelog v0.43–v0.46')
    finish(prs, s, 'sidebar')


def slide_start(prs):
    s = content_slide(prs, 'Starting work: the new-thread page and workflows')
    ui(s, 0.55, 1.45, 6.3, 3.3, '', UI_BG, shape=MSO_SHAPE.RECTANGLE)
    ui(s, 1.5, 1.65, 4.4, 0.5, 'Where should we start?', UI_BG, 16, align=PP_ALIGN.CENTER)
    ui(s, 0.85, 2.35, 1.5, 0.3, 'my-project ▾', UI_BG, 9)
    ui(s, 0.75, 2.7, 5.9, 1.4, '', UI_BOX)
    ui(s, 0.85, 2.78, 5.7, 0.35, 'Ask anything, / for slash commands', UI_BOX, 10, UI_DIM)
    ui(s, 0.85, 3.65, 1.3, 0.32, 'Auto review ▾', UI_BOX, 8, UI_DIM)
    ui(s, 2.2, 3.65, 1.5, 0.32, 'Default model ▾', UI_BOX, 8, UI_DIM)
    ui(s, 3.75, 3.65, 1.3, 0.32, 'Thinking ▾', UI_BOX, 8, UI_DIM)
    ui(s, 6.15, 3.63, 0.38, 0.36, '↑', TEAL, 12, WHITE, True, PP_ALIGN.CENTER)
    ui(s, 7.1, 1.45, 5.7, 3.3, '', UI_SIDE)
    ui(s, 7.2, 1.55, 5.5, 0.32, 'Search…', UI_BOX, 9, UI_DIM)
    ui(s, 7.2, 1.95, 5.5, 0.26, 'BUILT-IN', UI_SIDE, 8, UI_DIM)
    flows = [('Spec to RTL', 'Specification ambiguity resolution and RTL generation'),
             ('Static Signoff', 'Lint, CDC, and RDC cleanup with reviewed fixes and waivers'),
             ('RCA Triage', 'Bin regression failures and run RCA on each bin')]
    for i, (h, b) in enumerate(flows):
        ui(s, 7.2, 2.25 + i * 0.55, 5.5, 0.5, [h, b], UI_BOX, 10, UI_TXT, True)
    ui(s, 7.2, 3.95, 5.5, 0.26, 'YOUR CUSTOM WORKFLOWS', UI_SIDE, 8, UI_DIM)
    ui(s, 7.2, 4.25, 5.5, 0.35, 'my-rtl-review', UI_BOX, 9)
    text(s, 0.55, 4.8, 6.3, 0.25, 'New Thread', 11, True, GRAY, name='lblnt')
    text(s, 7.1, 4.8, 5.7, 0.25, 'Start Workflow menu', 11, True, GRAY, name='lblwf')
    tips = [('Check the workspace', 'The chip above the box sets the thread\'s working folder. Add more folders '
             'later with /workspaces'),
            ('Type, or start a workflow', 'Picking a workflow fills its start command into the box. Locked ones '
             'need a licence'),
            ('Temporary thread', 'Type /temp before the first message: the thread stays out of your history')]
    for i, (h, b) in enumerate(tips):
        box(s, f'tp{i}', 0.55 + i * 4.15, 5.15, 3.95, 1.2, [h, b], [A1, A2, D2][i], 0.88, 14, text_color=D1,
            line_color=[A1, A2, D2][i], body_size=11)
    source(s, f'{SRC} (new-thread page, Start Workflow menu); changelog v0.46.0 (workflow start command)')
    finish(prs, s, 'start')


def slide_thread(prs):
    s = content_slide(prs, '2–3. The thread header and the transcript')
    ui(s, 0.55, 1.45, 6.6, 4.9, '', UI_BG, shape=MSO_SHAPE.RECTANGLE)
    ui(s, 0.55, 1.45, 6.6, 0.45, '', UI_SIDE, shape=MSO_SHAPE.RECTANGLE)
    ui(s, 0.65, 1.52, 2.6, 0.3, 'Fix SPI timing', UI_SIDE, 11, bold=True)
    ui(s, 6.25, 1.53, 0.8, 0.28, 'Share', UI_BOX, 8, align=PP_ALIGN.CENTER)
    ui(s, 3.25, 2.08, 0.32, 0.3, '✎', UI_BG, 9, UI_DIM, align=PP_ALIGN.CENTER)
    ui(s, 3.6, 2.05, 3.45, 0.42, 'Why does SPI fail at 10 MHz?', UI_SEL, 9)
    ui(s, 0.65, 2.6, 6.4, 0.5, 'I\'ll run the failing test and read the controller.', UI_BG, 9)
    ui(s, 0.65, 3.2, 6.4, 0.32, '▸  Bash    make sim TEST=spi_10mhz', UI_BOX, 8, UI_DIM)
    ui(s, 0.65, 3.57, 6.4, 0.32, '▸  Edit    rtl/spi_ctrl.sv    +3 −1', UI_BOX, 8, UI_DIM)
    ui(s, 0.65, 3.94, 6.4, 0.3, '▸  Context compacted', UI_BG, 8, UI_DIM)
    ui(s, 0.65, 4.3, 6.4, 0.45, 'Fixed: CS setup is now 2 cycles, see spi_ctrl.sv:42', UI_BG, 9)
    ui(s, 0.65, 4.82, 1.7, 0.28, '⧉ Copy    ⑂ Fork', UI_BG, 8, UI_DIM)
    ui(s, 0.65, 5.3, 6.4, 0.95, '', UI_BOX)
    ui(s, 0.75, 5.36, 4.5, 0.3, 'Write a reply...', UI_BOX, 8, UI_DIM)
    ui(s, 6.2, 5.85, 0.75, 0.3, '■  Stop', UI_SEL, 8, align=PP_ALIGN.CENTER)
    marks(s, [(3.3, 1.48), (5.8, 1.48), (2.8, 2.07), (2.45, 4.77), (6.6, 3.37), (2.4, 3.9), (6.6, 4.34), (5.75, 5.82)])
    items = [('Thread title', 'Click it to rename the thread'),
             ('Share', 'Share with a project, people or groups'),
             ('Your message', '✎ Edit message changes what you sent'),
             ('Reply actions', 'Copy, or Fork from here into a new thread'),
             ('Tool calls', 'Click ▸ to see commands, output and diffs'),
             ('Context compacted', 'Expand it to read the summary of the earlier chat'),
             ('File links and citations', 'Click a file to open it; select text to quote it'),
             ('While it runs', 'Stop the agent, or type to steer it (queued, cancelable)')]
    for i, (h, b) in enumerate(items):
        card(s, f'th{i}', i + 1, 7.45, 1.45 + i * 0.62, 5.35, 0.55, h, b, size=12, body_size=10)
    caption(s, 0.55, 6.42, 6.6)
    source(s, f'{SRC} (thread header, transcript, message actions); changelog v0.43–v0.46 (fork, compaction, '
              'citations, steering)')
    finish(prs, s, 'thread')


def slide_composer(prs):
    s = content_slide(prs, '4. The composer: where you type')
    ui(s, 0.55, 1.45, 6.3, 2.2, '', UI_BG, shape=MSO_SHAPE.RECTANGLE)
    ui(s, 0.7, 1.55, 0.75, 0.55, 'img', UI_SEL, 8, UI_DIM, align=PP_ALIGN.CENTER)
    ui(s, 1.5, 1.55, 0.75, 0.55, 'img', UI_SEL, 8, UI_DIM, align=PP_ALIGN.CENTER)
    ui(s, 2.35, 1.67, 1.9, 0.32, '📄 sim.log · 12 KB', UI_BOX, 8)
    ui(s, 0.65, 2.2, 6.1, 1.35, '', UI_BOX)
    ui(s, 0.75, 2.27, 5.9, 0.35, 'Check @rtl/spi_ctrl.sv against the attached log', UI_BOX, 10)
    ui(s, 0.75, 3.13, 1.3, 0.32, 'Auto review ▾', UI_BOX, 8, UI_DIM)
    ui(s, 2.1, 3.13, 1.5, 0.32, 'Default model ▾', UI_BOX, 8, UI_DIM)
    ui(s, 3.65, 3.13, 1.3, 0.32, 'Thinking ▾', UI_BOX, 8, UI_DIM)
    ui(s, 6.3, 3.11, 0.38, 0.36, '↑', TEAL, 12, WHITE, True, PP_ALIGN.CENTER)
    marks(s, [(4.35, 1.64), (6.3, 2.26), (0.3, 3.1), (5.05, 3.1)])
    keys = [('Attachments (launcher)', 'Ctrl+V a screenshot, or drop files and folders. ✕ removes one'),
            ('Type, then Enter', '/ lists slash commands · @ picks a file · Enter or ↑ sends'),
            ('Permission mode', 'How much the agent may do without asking (table →)'),
            ('Model and thinking', 'This thread only. Defaults are under Settings → Providers')]
    for i, (h, b) in enumerate(keys):
        col, row = divmod(i, 2)
        card(s, f'k{i}', i + 1, 0.55 + col * 3.2, 3.9 + row * 1.25, 3.1, 1.12, h, b, size=13, body_size=10)
    modes = [('Ask for approval', 'Ask before actions that require approval.'),
             ('Approve edits', 'Only edits inside the workspace.'),
             ('Auto review', 'A model approves actions; asks if risky. Default for new threads.'),
             ('Full access', 'Approve every confirmation automatically.'),
             ('Plan', 'Create a plan in read-only mode.')]
    box(s, 'mh0', 7.15, 1.45, 2.15, 0.42, 'Permission mode', D2, 0.0, 12)
    box(s, 'mh1', 9.4, 1.45, 3.4, 0.42, 'What it does', D2, 0.0, 12)
    for i, (m, d) in enumerate(modes):
        y = 1.97 + i * 0.7
        hi = m == 'Auto review'
        box(s, f'm{i}', 7.15, y, 2.15, 0.62, m, A1 if hi else D2, 0.0 if hi else 0.88, 12,
            text_color=WHITE if hi else D2, line_color=A1 if hi else D2)
        box(s, f'd{i}', 9.4, y, 3.4, 0.62, d, A1, 0.88, 11, bold=False, text_color=D1, align=PP_ALIGN.LEFT,
            line_color=A1)
    box(s, 'warn', 7.15, 5.55, 5.65, 0.8, ['Full access approves everything', 'Keep it for trusted, low-risk work. Plan '
        'mode is read-only.'], PART[0], 0.0, 13, text_color=AMBER, line_color=AMBER, body_size=11)
    source(s, f'{SRC} (composer, Permissions menu wording); paste-proxy/README.md (attachments)')
    finish(prs, s, 'composer')


def slide_right(prs):
    s = content_slide(prs, '5. The right pane: five views')
    ui(s, 0.55, 1.45, 3.6, 4.9, '', UI_SIDE, shape=MSO_SHAPE.RECTANGLE)
    ui(s, 0.7, 1.6, 3.3, 0.3, 'OPEN A VIEW', UI_SIDE, 8, UI_DIM)
    for i, v in enumerate(['Files', 'Review', 'Terminal', 'Agents', 'Tasks']):
        ui(s, 0.7, 2.0 + i * 0.55, 2.7, 0.45, v, UI_BOX, 11)
        ui(s, 3.45, 2.05 + i * 0.55, 0.45, 0.35, str(i + 1), UI_BG, 9, UI_DIM, align=PP_ALIGN.CENTER)
    ui(s, 0.7, 5.0, 3.3, 1.2, ['Press 1–5 or click to open a view.', 'Files open here too, from links, the Files '
                               'view or Ctrl+P.'], UI_SIDE, 9, UI_DIM)
    views = [('Files', 'Explorer of the thread\'s workspace. Updates as files change and marks the files the agent '
              'changed. Filter files… narrows the tree'),
             ('Review', 'Everything the run changed, grouped as Workspace files, Generated output and Outside the '
              'workspace. Click one for its +/− diff'),
             ('Terminal', 'An interactive shell in the thread\'s folder (on your PC, in WSL)'),
             ('Agents', 'The main thread and its subagents. Filter All, Active or Failure; open one to read its own '
              'transcript'),
             ('Tasks', 'The agent\'s task list. Click a task for details: Blocked by, Blocks, subagent output and '
              'Task Steering'),
             ('Workflow tabs', 'Workflow threads add their own tab, e.g. RCA Triage adds Collateral (its run folder)')]
    for i, (h, b) in enumerate(views):
        col, row = divmod(i, 3)
        card(s, f'v{i}', i + 1 if i < 5 else '+', 4.45 + col * 4.2, 1.45 + row * 1.65, 4.15, 1.5, h, b,
             A1 if i < 5 else D2, 14, 11)
    caption(s, 0.55, 6.42, 3.6)
    source(s, f'{SRC} (side views, Files, Review, Agents, Tasks); changelog v0.45–v0.46')
    finish(prs, s, 'right')


def slide_files(prs):
    s = content_slide(prs, 'Opening, editing and reviewing files')
    code(s, 'diffmock', 0.55, 1.45, 5.4, 2.75, [
        ('@@ -40,7 +40,9 @@ module spi_ctrl', GRAY),
        ('   always_ff @(posedge clk) begin', CODE_FG),
        ('-    cs_setup <= 1;', DIFF_DEL),
        ('+    cs_setup <= 2;', DIFF_ADD),
        ('+    // two cycles at 10 MHz', DIFF_ADD),
        ('   end', CODE_FG),
    ], 12, title='Review → rtl/spi_ctrl.sv')
    ui(s, 0.55, 4.4, 5.4, 1.95, '', UI_BG)
    ui(s, 0.7, 4.5, 5.1, 0.38, 'spi_ctrl:42', UI_BOX, 10)
    ui(s, 0.7, 4.95, 5.1, 0.32, 'spi_ctrl.sv        rtl/', UI_SEL, 9)
    ui(s, 0.7, 5.3, 5.1, 0.32, 'spi_ctrl_tb.sv     tb/', UI_BG, 9, UI_DIM)
    ui(s, 0.7, 5.85, 5.1, 0.3, 'Esc  Close', UI_BG, 8, UI_DIM)
    text(s, 0.55, 6.4, 5.4, 0.2, 'Ctrl+P file search (illustration)', 9, color=GRAY, italic=True)
    tips = [('Ctrl+P', 'Search the workspace by file name, or paste a full path. Add :42 to open at line 42'),
            ('Click a file name', 'In the transcript or the Files view, to open it in the pane'),
            ('Edit in place', 'The pane is an editor with a find box; edits save to disk'),
            ('Markdown', 'Opens rendered; a toggle switches to the editable source'),
            ('PDF and Word', 'Continuous scroll, page navigation and zoom (.docx needs LibreOffice)'),
            ('Diagrams', 'Mermaid and D2 render in chat: fullscreen, zoom, Download as Visio (.vsdx)')]
    for i, (h, b) in enumerate(tips):
        col, row = divmod(i, 3)
        box(s, f'f{i}', 6.25 + col * 3.3, 1.45 + row * 1.65, 3.2, 1.5, [h, b], [A1, A2][col], 0.88, 15, text_color=D1,
            line_color=[A1, A2][col], body_size=11)
    source(s, 'Source: changelog v0.43–v0.46 (Ctrl+P, Markdown, PDF/docx, diagrams, diffs); ChipAgents Web v0.46.2 '
              'page')
    finish(prs, s, 'files')


def slide_settings(prs):
    s = content_slide(prs, 'Settings (⚙ bottom of the sidebar)')
    cols = [('General', A1, ['Appearance', '• Theme: 9 themes, each light and dark', '• Color mode: System, Light, Dark',
                             '• Transcript width: Narrow, Default, Wide', '• Transcript mode: Normal or Thinking '
                             '(keeps reasoning)', '', 'Notifications', '• Browser notifications, then pick: Finished '
                             'turns, Agent questions, Review requests, Permission prompts']),
            ('Providers', A2, ['Defaults for new threads', '• Default model: pick from your list, or type '
                               'provider|modelId', '• Default thinking level', '', 'To change one thread only, use the '
                               'composer\'s model and thinking menus']),
            ('Usage', A3, ['Your token use', '• Tokens used, cached tokens', '• Lines added, lines removed',
                           '• Current session and its context', '• Usage history: CLI and overall']),
            ('Advanced', D2, ['Saved to your config files', '• Agent: memory, command screening', '• Watermarks: file and '
                              'pragma watermarks, comment type', '• Connection: server URL, auto update',
                              '• Storage: temp folder, temp disk limit'])]
    for i, (h, c, lines) in enumerate(cols):
        x = 0.55 + i * 3.1
        box(s, f'sh{i}', x, 1.45, 2.95, 0.5, h, c, 0.0, 16)
        box(s, f'sb{i}', x, 2.05, 2.95, 3.55, lines, c, 0.88, 12, bold=True, text_color=D1, align=PP_ALIGN.LEFT,
            line_color=c, body_size=11)
    box(s, 'more', 0.55, 5.75, 8.0, 0.65, ['More settings are slash commands', '/sandbox · /skills · /mcp · /hooks · '
        '/rules · /memory · /plugins · /provider · /workspaces'], D2, 0.88, 12, text_color=D2, align=PP_ALIGN.LEFT,
        line_color=D2, body_size=11)
    box(s, 'srv', 8.75, 5.75, 4.05, 0.65, ['Leave the server URL as is', 'It points at ADI\'s ChipAgents server'],
        PART[0], 0.0, 12, text_color=AMBER, line_color=AMBER, body_size=10)
    source(s, f'{SRC} (Settings: General, Providers, Usage, Advanced)')
    finish(prs, s, 'settings')


def slide_settings_real(prs):
    s = content_slide(prs, 'Settings → General: what you see')
    img = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'images', 'settings_general.png')
    h = 4.9
    k = h / 603
    pic = s.shapes.add_picture(img, Inches(0.55), Inches(1.45), height=Inches(h))
    pic.line.color.rgb = UI_BOX
    pic.line.width = Pt(1)

    def at(px, py):
        return 0.55 + px * k - 0.19, 1.45 + py * k - 0.19
    marks(s, [at(150, 85), at(310, 103), at(800, 470), at(700, 540), at(800, 25), at(520, 590)])
    items = [('Settings sections', 'General, Providers, Usage, Advanced'),
             ('Theme', '9 themes: ChipAgents, Mono, Graphite, Grove, Iris, Dune, Nord, Rose, Lagoon'),
             ('Selected theme', 'Outlined (here: Lagoon). Kept after restarts'),
             ('Color mode', 'System (follows Windows), Light or Dark; each theme has both'),
             ('Close', '✕ closes Settings and returns to your thread'),
             ('Scroll for more', 'Transcript width, Transcript mode, Notifications')]
    for i, (hd, b) in enumerate(items):
        card(s, f'sr{i}', i + 1, 7.95, 1.45 + i * 0.82, 4.85, 0.72, hd, b, size=13, body_size=10)
    text(s, 0.55, 6.4, 7.1, 0.2, 'Screenshot: ChipAgents Web v0.46.2, Settings → General', 9, color=GRAY, italic=True)
    source(s, f'{SRC} (Settings → General); changelog v0.45 (theme and layout preferences persist across restarts)')
    finish(prs, s, 'settings_real')


def slide_extras(prs):
    s = content_slide(prs, 'Launcher extras and handy keys')
    text(s, 0.55, 1.4, 6.0, 0.3, 'Added by the launcher (not in plain chipagents web)', 13, True, A1, name='lx')
    extras = [('Version pill + Update', f'v{VERSION} at the top left; a green Update button appears when a newer '
               'version is out'),
              ('Paste and drop', 'Thumbnails and 📄 file chips above the box; saved to Desktop/screens'),
              ('Image previews', 'Image paths in replies show as pictures; click to enlarge'),
              ('Conversation folders', 'Each chat is saved to Desktop/ChipAgents Conversations/<date>_<title>_<id>')]
    for i, (h, b) in enumerate(extras):
        box(s, f'x{i}', 0.55, 1.8 + i * 1.15, 6.0, 1.02, [h, b], A1, 0.88, 14, text_color=D1, align=PP_ALIGN.LEFT,
            line_color=A1, body_size=11)
    text(s, 6.9, 1.4, 5.9, 0.3, 'Keys', 13, True, D2, name='lk')
    keys = [('Ctrl+P', 'Open a file by name or path'), ('/', 'Slash commands (in the composer)'),
            ('@', 'Reference a file in your message'), ('Enter', 'Send the message'),
            ('1 – 5', 'Open a right-pane view'), ('Esc', 'Close a dialog or picker'),
            ('Just type', 'Typing or pasting anywhere goes to the composer')]
    for i, (k, d) in enumerate(keys):
        y = 1.8 + i * 0.65
        box(s, f'kk{i}', 6.9, y, 1.5, 0.55, k, D2, 0.0, 13)
        box(s, f'kd{i}', 8.5, y, 4.3, 0.55, d, D2, 0.88, 12, bold=False, text_color=D1, align=PP_ALIGN.LEFT,
            line_color=D2)
    source(s, 'Source: paste-proxy/README.md; ChipAgents Web v0.46.2 page; changelog v0.43–v0.46 (keyboard shortcuts)')
    finish(prs, s, 'extras')


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
    for f in (slide_cover, slide_glance, slide_sidebar, slide_start, slide_thread, slide_composer, slide_right,
              slide_files, slide_settings, slide_settings_real, slide_extras, slide_end):
        f(prs)
    out = os.path.join(args.output_dir, 'ChipAgents_Web_UI_Tour.pptx')
    prs.save(out)
    print(f'Saved {out}')
    verify_pptx(out, expected_slides=12)


if __name__ == '__main__':
    main()
