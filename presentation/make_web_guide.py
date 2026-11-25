import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

from make_web_vs_cli import (Presentation, PP_ALIGN, MSO_ANCHOR, TEMPLATE_PATH, convert_potx_to_pptx,
                             clear_slides, remove_unused_placeholders, set_placeholder_text, verify_pptx,
                             box, container, text, code, arrow, badge, content_slide, finish, source,
                             WHITE, GREEN, AMBER, RED, GRAY, CODE_FG, DIFF_ADD, A1, A2, A3, A4, D1, D2,
                             GOOD, PART, BAD)

VERSION = '0.46.2'
REPO = 'github.com/jcortez3/chipagents_web'
BRANCH = 'multi_user_support'
SERVER = 'https://chipagentssrv.engawsus1.analog.com/agent'
CMT = GRAY
UI_BG = RGBColor(0x1E, 0x22, 0x25)
UI_SIDE = RGBColor(0x26, 0x2B, 0x2F)
UI_BOX = RGBColor(0x33, 0x39, 0x3E)
UI_TXT = RGBColor(0xE6, 0xE4, 0xE0)
UI_DIM = RGBColor(0x9A, 0xA0, 0xA6)
UI_SEL = RGBColor(0x2F, 0x4A, 0x48)
TEAL = RGBColor(0x2C, 0x8C, 0x86)


def step_title(prs, n, title):
    return content_slide(prs, f'Step {n}: {title}')


def slide_cover(prs):
    s = prs.slides.add_slide(prs.slide_layouts[0])
    set_placeholder_text(s, 10, 'ChipAgents Web: Step by Step')
    set_placeholder_text(s, 14, 'Windows + WSL launcher')
    set_placeholder_text(s, 15, f'ChipAgents v{VERSION}')
    finish(prs, s, 'cover')


def slide_overview(prs):
    s = content_slide(prs, 'The big picture: set up once, then use it every day')
    steps = ['Prepare Windows', 'Get the launcher', 'Install & log in', 'Launch it', 'First chat',
             'Attach files', 'History & updates']
    text(s, 0.55, 1.4, 5.2, 0.3, 'One-time setup', 13, True, D2, name='lbl_setup')
    text(s, 5.85, 1.4, 6.9, 0.3, 'Every day', 13, True, A1, name='lbl_daily')
    for i, label in enumerate(steps):
        x = 0.55 + i * 1.76
        box(s, f'chev{i}', x, 1.75, 1.82, 0.95, [f'{i + 1}', label], D2 if i < 3 else A1, 0.0, 15,
            shape=MSO_SHAPE.CHEVRON if i else MSO_SHAPE.PENTAGON, body_size=11, tracked=False)
    nodes = [('Browser', 'Chrome or Edge', 'localhost:4300', A2),
             ('Paste launcher', 'paste, previews, chat folders,', 'version + Update button', A1),
             ('chipagents web', 'the official hub, in WSL', 'port 4242', D2),
             ('ChipAgents server', 'ADI', 'chipagentssrv…/agent', A3)]
    for i, (h, a, b, c) in enumerate(nodes):
        x = 0.55 + i * 3.2
        box(s, f'n{i}', x, 3.25, 2.65, 1.3, [h, a, b], c, 0.0, 16, body_size=11)
        if i < 3:
            arrow(s, x + 2.72, 3.7, 0.45, 0.4, color=D2)
    arrow(s, 4.8, 4.65, 0.4, 0.5, 'down', A1)
    box(s, 'desk', 0.55, 5.25, 7.0, 1.0, ['Your Desktop', 'screens/  pasted and generated images   ·   '
        'ChipAgents Conversations/  one folder per chat'], A1, 0.88, 14, text_color=A1, line_color=A1, body_size=12)
    box(s, 'local', 7.8, 5.25, 5.0, 1.0, ['Runs on your PC', 'The page only listens on localhost; the agent '
        'talks to ADI\'s ChipAgents server'], D2, 0.88, 14, text_color=D2, line_color=D2, body_size=11)
    source(s, 'Source: paste-proxy/README.md ("How it works"), usage/chipagents-web.md (binds to 127.0.0.1)')
    finish(prs, s, 'overview')


def slide_prepare(prs):
    s = content_slide(prs, 'Steps 1–2: Prepare Windows and get the launcher')
    badge(s, 0.55, 1.45, 1, D2)
    text(s, 1.07, 1.47, 5.0, 0.4, 'Install WSL (Ubuntu) and Node.js', 16, True, D2, name='h1')
    code(s, 'wsl', 0.55, 2.0, 5.95, 2.2, [
        ('# PowerShell (as administrator), then restart', CMT),
        ('wsl --install -d Ubuntu-24.04', CODE_FG),
        ('', CODE_FG),
        ('# in the Ubuntu window', CMT),
        ('sudo apt update', CODE_FG),
        ('sudo apt install -y nodejs python3-pil', CODE_FG),
        ('node -v          # v18 or newer', DIFF_ADD),
    ], 12)
    box(s, 'n1', 0.55, 4.4, 5.95, 0.6, 'WSL blocked or needs admin rights? Ask IT to enable it.', PART[0], 0.0, 12,
        bold=False, text_color=AMBER, line_color=AMBER)
    box(s, 'n1b', 0.55, 5.15, 5.95, 0.6, 'python3-pil is only needed for PNG/JPG pictures from /img', D2, 0.88, 12,
        bold=False, text_color=D2, line_color=D2)
    badge(s, 6.85, 1.45, 2, A1)
    text(s, 7.37, 1.47, 5.4, 0.4, 'Get the launcher folder', 16, True, A1, name='h2')
    box(s, 'zip', 6.85, 2.0, 5.95, 1.35, ['Option A: Download ZIP', f'{REPO}  →  branch {BRANCH}  →  Code  →  '
        'Download ZIP, then unzip it anywhere (e.g. Desktop)'], A1, 0.0, 14, body_size=12)
    code(s, 'clone', 6.85, 3.5, 5.95, 1.0, [
        ('# Option B: Git Bash, in your Desktop folder', CMT),
        (f'git clone -b {BRANCH} \\', CODE_FG),
        (f'  https://{REPO}.git', CODE_FG),
    ], 12)
    box(s, 'bat', 6.85, 4.7, 5.95, 1.05, ['Inside the folder', 'chipagents-web-paste.bat   ← double-click this  ·  '
        'paste-proxy/   (the launcher code, no need to open)'], A2, 0.0, 14, body_size=12)
    source(s, 'Source: paste-proxy/README.md ("Setup (any user)"). Ubuntu 24.04 ships Node.js 18.19.')
    finish(prs, s, 'prepare')


def slide_install(prs):
    s = step_title(prs, 3, 'Install ChipAgents and log in (once)')
    flow = [('Double-click', 'chipagents-web-paste.bat'), ('It prepares', 'ADI certificates + the commands'),
            ('Paste them', 'into the Ubuntu window'), ('Log in', 'sign in through the browser'),
            ('Double-click', 'the .bat again')]
    for i, (h, b) in enumerate(flow):
        x = 0.55 + i * 2.5
        box(s, f'f{i}', x, 1.45, 2.15, 0.95, [h, b], [A2, D2, A1, A3, A2][i], 0.0, 14, body_size=11)
        if i < 4:
            arrow(s, x + 2.18, 1.75, 0.3, 0.35, color=D2)
    code(s, 'out', 0.55, 2.65, 12.25, 2.55, [
        ('Starting ChipAgents web with image paste ...', CODE_FG),
        ('[launcher] no ADI CA bundle found; exporting ADI certificates from the Windows certificate store ...', CMT),
        ('[launcher] saved N certificates to /home/<you>/certs/adi-ca-bundle.pem', CMT),
        ('[launcher] ChipAgents CLI was not found in WSL. Install it and log in with these commands in WSL, '
         'then try again:', CODE_FG),
        ('  export CURL_CA_BUNDLE=$HOME/certs/ca-all.pem NODE_EXTRA_CA_CERTS=/home/<you>/certs/adi-ca-bundle.pem',
         DIFF_ADD),
        (f'  curl -LsSf {SERVER}/install.sh | bash', DIFF_ADD),
        ('  ~/.local/bin/chipagents login', DIFF_ADD),
    ], 12, title='Launcher window, first time (copy the green lines)')
    box(s, 'why', 0.55, 5.4, 6.0, 1.05, ['Why the certificates?', 'ADI\'s Netskope inspects HTTPS. Without them you '
        'get "self signed certificate in certificate chain".'], PART[0], 0.0, 13, text_color=AMBER, line_color=AMBER,
        body_size=11)
    box(s, 'cli', 6.8, 5.4, 6.0, 1.05, ['Also using the terminal CLI?', 'Add to ~/.bashrc:  export NODE_EXTRA_CA_CERTS='
        '$HOME/certs/adi-ca-bundle.pem'], D2, 0.88, 13, text_color=D2, line_color=D2, body_size=11)
    source(s, 'Source: paste-proxy/start.sh, paste-proxy/README.md; ADI install.sh (sets endpoint_url to ADI\'s server). '
           'N = number of ADI certificates found.')
    finish(prs, s, 'install')


def slide_launch(prs):
    s = step_title(prs, 4, 'Launch it (every day)')
    box(s, 'dbl', 0.55, 1.45, 4.3, 1.0, ['Double-click', 'chipagents-web-paste.bat'], A1, 0.0, 18, body_size=14)
    does = ['Stops your old launcher and hub, if any', 'Starts chipagents web (4242) behind the launcher (4300)',
            'Opens your browser at the sign-in link']
    for i, t in enumerate(does):
        badge(s, 0.55, 2.75 + i * 0.68, i + 1, D2, 0.4)
        text(s, 1.05, 2.78 + i * 0.68, 3.8, 0.5, t, 12, color=D1, name=f'does{i}')
    code(s, 'win', 5.1, 1.45, 7.7, 3.1, [
        ('Starting ChipAgents web with image paste ...', CODE_FG),
        ('[launcher] user: <you>, desktop: /mnt/c/Users/<you>/Desktop', CMT),
        ('[paste] proxy listening on 127.0.0.1:4300, pasted -> …/Desktop/screens', CMT),
        ('  ChipAgents web (with image paste):', CODE_FG),
        ('  http://localhost:4300/hub?token=…', DIFF_ADD),
        (f'  (upstream chipagents web {VERSION} on port 4242)', CMT),
        ('[conversations] saving conversations to …/ChipAgents Conversations', CMT),
    ], 12, title='Launcher window')
    rules = [('Keep the window open', 'Closing it stops ChipAgents', A1),
             ('Use the 4300 link', 'Not 4242: that skips paste and folders', A2),
             ('The link is a password', 'Don\'t share it; it signs you in', AMBER),
             ('Lost the tab?', 'Copy the link from the window again', D2)]
    for i, (h, b, c) in enumerate(rules):
        x = 0.55 + i * 3.1
        box(s, f'r{i}', x, 4.85, 2.95, 1.3, [h, b], c, 0.0, 15, body_size=12)
    source(s, 'Source: paste-proxy/README.md ("Usage"), paste-proxy.js; usage/chipagents-web.md ("treat the link like '
           'a password")')
    finish(prs, s, 'launch')


def ui(s, x, y, w, h, lines, fill=UI_BOX, size=10, color=UI_TXT, bold=False, align=PP_ALIGN.LEFT,
       shape=MSO_SHAPE.ROUNDED_RECTANGLE):
    return box(s, 'ui', x, y, w, h, lines, fill, 0.0, size, bold=bold, text_color=color, align=align, shape=shape,
               tracked=False)


def slide_first_chat(prs):
    s = step_title(prs, 5, 'Your first conversation')
    ui(s, 0.55, 1.45, 7.75, 4.95, '', UI_BG, shape=MSO_SHAPE.RECTANGLE)
    ui(s, 0.55, 1.45, 2.3, 4.95, '', UI_SIDE, shape=MSO_SHAPE.RECTANGLE)
    ui(s, 0.65, 1.55, 1.25, 0.32, 'ChipAgents', UI_SIDE, 11, bold=True)
    ui(s, 1.9, 1.58, 0.85, 0.27, f'v{VERSION}', UI_BOX, 8, UI_DIM, align=PP_ALIGN.CENTER)
    ui(s, 0.65, 2.0, 2.1, 0.32, '✎  New Thread', UI_SIDE, 10)
    ui(s, 0.65, 2.45, 2.1, 0.3, 'Workspaces                +', UI_SIDE, 9, UI_DIM)
    ui(s, 0.65, 2.8, 2.1, 0.32, '▸  my-project', UI_SEL, 10)
    ui(s, 0.85, 3.17, 1.9, 0.28, 'Thread title', UI_SIDE, 9, UI_DIM)
    ui(s, 0.85, 3.47, 1.9, 0.28, 'Another thread', UI_SIDE, 9, UI_DIM)
    ui(s, 0.65, 5.95, 2.1, 0.32, '⚙  Settings', UI_SIDE, 10)
    ui(s, 3.4, 2.55, 4.4, 0.45, 'Where should we start?', UI_BG, 16, align=PP_ALIGN.CENTER)
    ui(s, 3.5, 3.2, 1.4, 0.3, 'my-project ▾', UI_BG, 9)
    ui(s, 3.15, 3.55, 4.9, 1.35, '', UI_BOX)
    ui(s, 3.25, 3.62, 4.6, 0.35, 'Ask anything, / for slash commands', UI_BOX, 10, UI_DIM)
    ui(s, 3.25, 4.45, 1.25, 0.32, '▷ Auto review ▾', UI_BOX, 8, UI_DIM)
    ui(s, 4.55, 4.45, 1.55, 0.32, 'Default model ▾', UI_BOX, 8, UI_DIM)
    ui(s, 6.1, 4.45, 1.3, 0.32, 'Thinking: high ▾', UI_BOX, 8, UI_DIM)
    ui(s, 7.55, 4.43, 0.38, 0.36, '↑', TEAL, 12, WHITE, True, PP_ALIGN.CENTER)
    marks = [(2.45, 2.42), (0.35, 1.97), (3.05, 3.17), (7.85, 3.6), (2.95, 4.42), (5.6, 4.97)]
    for i, (bx, by) in enumerate(marks):
        badge(s, bx, by, i + 1, AMBER, 0.38)
    steps = [('Add a workspace', '+ next to Workspaces: pick the folder the agent should work in'),
             ('New Thread', 'Starts a fresh conversation'),
             ('Check the folder', 'The composer shows which workspace it uses'),
             ('Type your request', 'Press Enter or ↑ to send'),
             ('Choose how it asks', 'Auto review approves safe actions, asks about the rest'),
             ('Pick model and thinking', 'Higher thinking for hard debugging')]
    for i, (h, b) in enumerate(steps):
        y = 1.45 + i * 0.83
        badge(s, 8.55, y + 0.17, i + 1, AMBER, 0.38)
        box(s, f'st{i}', 9.05, y, 3.75, 0.72, [h, b], A1, 0.88, 13, text_color=D1, align=PP_ALIGN.LEFT,
            line_color=A1, body_size=10)
    text(s, 0.55, 6.45, 7.75, 0.2, 'Illustration of the hub page (labels as shown in ChipAgents Web)', 9, color=GRAY,
         italic=True)
    source(s, 'Source: ChipAgents Web v0.46 page, usage/chipagents-web.md (workspaces), usage/capabilities.md '
           '(Auto review)')
    finish(prs, s, 'first_chat')


def slide_attach(prs):
    s = step_title(prs, 6, 'Attach screenshots, files and folders')
    ways = [('Ctrl+V', 'Paste a screenshot', 'A thumbnail appears above the chat box', A2),
            ('Drag & drop', 'Any file or whole folder', 'Files show as  📄 name · size  chips', A1),
            ('/img', '/img png <description>', 'The agent draws it (SVG → PNG/JPG)', A3)]
    for i, (h, a, b, c) in enumerate(ways):
        x = 0.55 + i * 4.15
        box(s, f'w{i}', x, 1.45, 3.95, 1.35, [h, a, b], c, 0.0, 20, body_size=12)
    flow = [('You paste or drop', 'then press Enter', D2), ('Launcher saves it', 'Desktop/screens/ (attachments/)', A1),
            ('Message gets the path', '[pasted image: …]  [attached file: …]', A2),
            ('The agent reads it', 'like any other file', GREEN)]
    for i, (h, b, c) in enumerate(flow):
        x = 0.55 + i * 3.15
        box(s, f'fl{i}', x, 3.2, 2.75, 1.05, [h, b], c, 0.0, 14, body_size=11)
        if i < 3:
            arrow(s, x + 2.8, 3.52, 0.3, 0.4, color=D2)
    tips = [('Previews', 'Image paths in replies show inline; click to enlarge'),
            ('✕ on a thumbnail', 'Removes it from the message (the file stays)'),
            ('Limits', '100 MB per file; folders up to 2000 files / 1 GB')]
    for i, (h, b) in enumerate(tips):
        x = 0.55 + i * 4.15
        box(s, f't{i}', x, 4.6, 3.95, 1.0, [h, b], A1, 0.88, 14, text_color=D1, line_color=A1, body_size=11)
    text(s, 0.55, 5.85, 12.25, 0.4, 'Send waits until a dropped folder has finished uploading.', 13, True, A1,
         PP_ALIGN.CENTER, name='takeaway')
    source(s, 'Source: paste-proxy/README.md ("How it works", "Limits")')
    finish(prs, s, 'attach')


def slide_history(prs):
    s = step_title(prs, 7, 'Your history, updates and troubleshooting')
    code(s, 'tree', 0.55, 1.45, 5.6, 2.3, [
        ('Desktop/ChipAgents Conversations/', CODE_FG),
        ('  2026-11-16_<title>_<id>/', DIFF_ADD),
        ('    conversation.md     readable history', CODE_FG),
        ('    conversation.json   full raw data', CODE_FG),
        ('    attachments/        what you pasted', CODE_FG),
        ('    generated/          images it drew', CODE_FG),
        ('    files/              copies of files it used', CODE_FG),
    ], 11, title='One folder per conversation')
    ui(s, 0.55, 4.0, 5.6, 0.75, '', UI_BG, shape=MSO_SHAPE.RECTANGLE)
    ui(s, 0.7, 4.17, 1.35, 0.4, 'ChipAgents', UI_BG, 12, bold=True)
    ui(s, 2.1, 4.2, 1.0, 0.34, f'v{VERSION}', UI_BOX, 10, UI_DIM, align=PP_ALIGN.CENTER)
    ui(s, 3.2, 4.2, 1.9, 0.34, '⬆ Update to 0.46.3', GREEN, 10, WHITE, True, PP_ALIGN.CENTER)
    box(s, 'upd', 0.55, 4.9, 5.6, 1.2, ['Update button', 'Waits until no chat is running → installs → restarts the '
        'hub → the tab reloads by itself'], A1, 0.88, 13, text_color=D1, line_color=A1, body_size=11)
    rows = [('"self signed certificate in certificate chain"', 'Start from the launcher; for the CLI add '
             'NODE_EXTRA_CA_CERTS to ~/.bashrc'),
            ('"Connections from other users are not allowed"', 'Open the 4300 link from the launcher window'),
            ('Page says you are not signed in', 'Use the newest link printed in the launcher window'),
            ('Paste or previews stop after an update', 'Restart the launcher; updates can change the page'),
            ('"Node.js was not found in WSL"', 'sudo apt install -y nodejs')]
    box(s, 'th0', 6.45, 1.45, 3.1, 0.42, 'You see', D2, 0.0, 12)
    box(s, 'th1', 9.65, 1.45, 3.15, 0.42, 'Do this', GREEN, 0.0, 12)
    for i, (p, f) in enumerate(rows):
        y = 1.97 + i * 0.89
        box(s, f'p{i}', 6.45, y, 3.1, 0.8, p, BAD[0], 0.0, 11, bold=False, text_color=RED, align=PP_ALIGN.LEFT,
            line_color=RED)
        box(s, f'x{i}', 9.65, y, 3.15, 0.8, f, GOOD[0], 0.0, 11, bold=False, text_color=GREEN, align=PP_ALIGN.LEFT,
            line_color=GREEN)
    source(s, 'Source: paste-proxy/README.md ("Conversation folders", "Version and updates", "Setup", "Limits"), '
           'start.sh')
    finish(prs, s, 'history')


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
    slide_overview(prs)
    slide_prepare(prs)
    slide_install(prs)
    slide_launch(prs)
    slide_first_chat(prs)
    slide_attach(prs)
    slide_history(prs)
    slide_end(prs)
    out = os.path.join(args.output_dir, 'ChipAgents_Web_Step_by_Step.pptx')
    prs.save(out)
    print(f'Saved {out}')
    verify_pptx(out, expected_slides=9)


if __name__ == '__main__':
    main()
