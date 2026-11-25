import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from make_web_vs_cli import (Presentation, PP_ALIGN, MSO_ANCHOR, TEMPLATE_PATH, convert_potx_to_pptx,
                             clear_slides, remove_unused_placeholders, set_placeholder_text, verify_pptx,
                             box, container, text, code, arrow, badge, content_slide, finish, source,
                             WHITE, GREEN, AMBER, GRAY, CODE_FG, DIFF_ADD, A1, A2, A3, A4, D1, D2, GOOD, PART)

VERSION = '0.46.2'
DOCS = f'ChipAgents docs v{VERSION}'
CMT = GRAY


def slide_cover(prs):
    s = prs.slides.add_slide(prs.slide_layouts[0])
    set_placeholder_text(s, 10, 'ChipAgents: Features & Tips')
    set_placeholder_text(s, 14, 'Beyond the basics, for CLI users')
    set_placeholder_text(s, 15, f'ChipAgents v{VERSION}')
    finish(prs, s, 'cover')


def slide_web(prs):
    s = content_slide(prs, 'ChipAgents Web: the same agent in your browser')
    code(s, 'launch', 0.55, 1.5, 5.3, 2.45, [
        ('$ chipagents web', CODE_FG),
        ('  → http://127.0.0.1:4242/hub?token=…', DIFF_ADD),
        ('', CODE_FG),
        ('# pin the port', CMT),
        ('$ HUB_PORT=5262 chipagents web', CODE_FG),
        ('# from a remote server', CMT),
        ('$ ssh -L 5262:127.0.0.1:5262 user@host', CODE_FG),
    ], 12, title='Start it')
    box(s, 'parity', 0.55, 4.15, 5.3, 1.0, ['Same agent, tools, configuration and login',
        'Slash commands, subagents, thinking modes: all the same'], A1, 0.0, 14, body_size=11)
    box(s, 'token', 0.55, 5.35, 5.3, 0.85, ['Treat the link like a password',
        'The token stays valid as long as the server runs'], PART[0], 0.0, 13, text_color=AMBER,
        line_color=AMBER, body_size=11)
    cards = [('Parallel threads', 'Run several at once, grouped by workspace folder'),
             ('File & diff pane', 'Open any file the agent read or changed; +/- diffs'),
             ('Rendered Markdown', 'Files open rendered, with a toggle to editable source'),
             ('Notifications', 'Browser alert when a turn finishes; unread markers'),
             ('Approvals in the page', 'Auto review mode; pending approvals are shown'),
             ('Workflow editor (beta)', 'Build multi-step workflows on a canvas')]
    for i, (h, b) in enumerate(cards):
        x = 6.1 + (i % 2) * 3.4
        y = 1.5 + (i // 2) * 1.57
        box(s, f'card{i}', x, y, 3.25, 1.42, [h, b], [A2, A1][(i // 2 + i) % 2], 0.0, 15, body_size=12)
    text(s, 0.55, 6.25, 12.25, 0.35, 'No /history in the browser: the sidebar is your history.', 14, True, A1,
         PP_ALIGN.CENTER, name='takeaway')
    source(s, f'Source: {DOCS}: usage/chipagents-web.md, changelog.md; command list of the v{VERSION} web hub')
    finish(prs, s, 'web')


def slide_commands(prs):
    s = content_slide(prs, 'Slash commands worth knowing')
    groups = [
        ('Conversation', A2, [('/new', 'Start a new chat'), ('/fork', 'Copy the thread to try an alternative'),
                              ('/checkpoint', 'Rewind to an earlier message (Ctrl+G)', 'cli'),
                              ('/compact', 'Condense the context now'), ('/temp', 'Mark the thread temporary')]),
        ('Plan & steer', A1, [('/plan', 'Plan first: no edits until you approve'),
                              ('/plans', 'Revisit and execute saved plans'),
                              ('/goal', 'Keep working on an objective across turns'),
                              ('/think', 'Set thinking level (Web: Thinking menu)', 'cli'),
                              ('/btw', 'Side question, not added to the chat', 'cli')]),
        ('Knowledge', A3, [('/memory', 'View saved user and project memory'), ('/rules', 'Turn rule files on/off'),
                           ('/skills', 'Turn skills on/off'), ('/init', 'Write CHIPAGENTS.md for the project'),
                           ('/help <question>', 'Answers from the built-in docs')]),
        ('Share & admin', A4, [('/share', 'Share with teammates (beta)'), ('/export', 'Threads to files; /import loads one'),
                               ('/provider', 'Pick the model; Balanced auto-selects'),
                               ('/usage', 'Show monthly usage'), ('/changelog', "What's new in this version")]),
    ]
    for c, (head, color, cmds) in enumerate(groups):
        x = 0.55 + c * 3.1
        box(s, f'h{c}', x, 1.45, 2.95, 0.45, head, color, 0.0, 14)
        for r, cmd in enumerate(cmds):
            cli = len(cmd) > 2
            name = cmd[0] + ('   · CLI only' if cli else '')
            box(s, f'c{c}r{r}', x, 2.0 + r * 0.8, 2.95, 0.7, [name, cmd[1]], PART[0] if cli else color,
                0.0 if cli else 0.88, 13, text_color=AMBER if cli else D1, align=PP_ALIGN.LEFT,
                line_color=AMBER if cli else color, body_size=10.5)
    box(s, 'keys', 0.55, 6.05, 12.25, 0.5, 'Tab completes   ·   $ opens the skills picker   ·   @ picks files, '
        'folders, skills and agents', D2, 0.0, 13, bold=False)
    source(s, f'Source: {DOCS}: usage/capabilities.md, configuration/skills.md, changelog.md. '
           '"CLI only" = not in the web hub\'s / menu.')
    finish(prs, s, 'commands')


def slide_workflows(prs):
    s = content_slide(prs, 'Workflows: repeatable multi-step tasks')
    flow = [('Inspect RTL', 'Step', A2), ('Request review', 'Review gate', A3), ('Report results', 'Step (final)', A1)]
    for i, (h, k, c) in enumerate(flow):
        x = 0.55 + i * 4.2
        box(s, f'f{i}', x, 1.5, 3.4, 0.95, [h, k], c, 0.0, 16, body_size=12)
        if i < 2:
            arrow(s, x + 3.5, 1.78, 0.6, 0.4, color=D2)
    kinds = [('Step', 'Agent follows the instructions; picks the next arrow'),
             ('Question', 'Asks you, continues after you answer'),
             ('Subagent', 'Delegates the work, continues when it finishes'),
             ('Review gate', 'Shows the work; continues after you approve')]
    for i, (h, b) in enumerate(kinds):
        x = 0.55 + (i % 2) * 3.05
        y = 2.95 + (i // 2) * 1.27
        box(s, f'k{i}', x, y, 2.9, 1.12, [h, b], [A2, A4, A1, A3][i], 0.0, 15, body_size=11)
    box(s, 'branch', 0.55, 5.55, 5.95, 0.9, ['Two outgoing arrows?', 'The agent picks one: write the '
        'conditions in the step\'s instructions'], D2, 0.0, 13, body_size=11)
    box(s, 'pass', 6.85, 2.95, 5.95, 0.72, ['Pass through (default)', 'Keeps the full conversation'], A1, 0.88, 13,
        text_color=A1, align=PP_ALIGN.LEFT, line_color=A1, body_size=11)
    box(s, 'summ', 6.85, 3.78, 5.95, 0.72, ['Summarize', 'Replaces it with a summary (optional summary prompt)'],
        A1, 0.88, 13, text_color=A1, align=PP_ALIGN.LEFT, line_color=A1, body_size=11)
    code(s, 'run', 6.85, 4.65, 5.95, 1.8, [
        ('/workflows           list what is available', CODE_FG),
        ('/rca-triage start    built-in example', CODE_FG),
        ('/<alias> start       run your own', CODE_FG),
        ('/<alias> step-name   start at one step', CODE_FG),
        ('/workflow-exit       leave workflow mode', CODE_FG),
    ], 13, title='Run one (CLI or a Web thread)')
    text(s, 6.85, 2.55, 5.95, 0.35, 'Arrows hand over the context:', 12, True, D1, name='arrows')
    text(s, 0.55, 2.55, 5.95, 0.35, 'Four kinds of step:', 12, True, D1, name='kinds')
    source(s, f'Source: {DOCS}: usage/workflow-editor.md, usage/capabilities.md, usage/rca.md')
    finish(prs, s, 'workflows')


def slide_editor(prs):
    s = content_slide(prs, 'Workflow editor (beta): build one in the browser')
    steps = [('Open', 'chipagents web → sidebar → Workflow editor'),
             ('Start', 'New workflow (one "start" step), or Duplicate a read-only built-in'),
             ('Build', 'Add steps, drag them, draw arrows; drop a step on an arrow to insert it'),
             ('Ask the editor agent', 'Describe the change in chat; edits auto-save; "Restore revision" undoes'),
             ('Run', 'Set the alias in Settings, then /<alias> start in a separate thread')]
    for i, (h, b) in enumerate(steps):
        x = 0.55 + i * 2.475
        badge(s, x + 0.97, 1.45, i + 1, D2)
        box(s, f's{i}', x, 1.95, 2.35, 2.25, [h, b], [A2, A1, A3, A4, A1][i], 0.0, 15, body_size=12)
    container(s, 0.55, 4.75, 12.25, 1.65, 'Share it with the group', D2)
    share = [('Export / import a .cawf file', 'CLI: /edit-workflows → Export…  ·  press i to import'),
             ('Publish as plugin', 'Org admin; starts private; teammates install it, then /reload'),
             ('Revisions', 'New runs use the latest save; deleting keeps existing runs')]
    for i, (h, b) in enumerate(share):
        box(s, f'sh{i}', 0.75 + i * 4.0, 4.92, 3.85, 1.3, [h, b], WHITE, 0.0, 14, text_color=D2,
            line_color=D2, body_size=11)
    source(s, f'Source: {DOCS}: usage/workflow-editor.md. Beta: review generated steps and try a small task first.')
    finish(prs, s, 'editor')


def slide_context(prs):
    s = content_slide(prs, 'Context window: what happens near 100%')
    flow = [('Conversation grows', 'Replies, tool output, file reads'), ('Near the limit', 'Indicator rises in the CLI'),
            ('Automatic summary', '"Context compacted" in the transcript'), ('Work continues', 'Usage drops again')]
    for i, (h, b) in enumerate(flow):
        x = 0.55 + i * 3.15
        box(s, f'f{i}', x, 1.5, 2.65, 1.1, [h, b], [D2, AMBER, A1, GREEN][i], 0.0, 15, body_size=11)
        if i < 3:
            arrow(s, x + 2.72, 1.85, 0.36, 0.4, color=D2)
    cols = [('Kept', GREEN, GOOD[0], ['• The summary: expand "Context compacted" to read it',
                                       '• Memory entries (reloaded after compaction)',
                                       '• Files on disk: the agent re-reads them',
                                       '• Your model choice (Balanced routing)']),
            ('Replaced by the summary', AMBER, PART[0], ['• Exact wording of earlier messages',
                                                          '• Full tool output from earlier turns',
                                                          '• Details the summary did not capture']),
            ('Your controls', A1, None, ['• /compact: condense now (can queue mid-turn)',
                                         '• CLI status bar shows context usage',
                                         '• pre_compact hook: add instructions for the summary',
                                         '• post_compact hook: add context back afterwards'])]
    for i, (h, c, fill, lines) in enumerate(cols):
        x = 0.55 + i * 4.15
        container(s, x, 3.2, 3.95, 2.65, h, c, fill)
        text(s, x + 0.15, 3.35, 3.65, 2.4, lines, 15, color=D1, name=f'col{i}')
    text(s, 0.55, 6.05, 12.25, 0.4, 'Long project? Save key facts to memory, or start a new thread per topic.', 14,
         True, A1, PP_ALIGN.CENTER, name='takeaway')
    source(s, f'Source: {DOCS}: usage/capabilities.md, usage/memory.md, configuration/hooks.md, changelog.md. '
           'The exact threshold is not documented.')
    finish(prs, s, 'context')


def slide_knowledge(prs):
    s = content_slide(prs, 'Memory, rules and skills: teach it once')
    cols = [('Memory (beta)', 'Small facts kept across threads', A2, [
                'Scopes: user (everywhere) and project (this folder)',
                'Add: just say "remember…" or "forget…"',
                'View: /memory (read-only viewer)',
                'Limit: 2,048 characters per scope',
                'No secrets; plain text under ~/.chipagents']),
            ('Rules', 'Instructions in every conversation', A1, [
                'Files in .chipagents/ (.md, .mdc, .txt, .rst)',
                'Also .chipagents/rules/ and parent folders',
                'Toggle: /rules  ·  /init writes CHIPAGENTS.md',
                'Limit: 100,000 bytes; smaller files load first',
                'Extra folders: CHIPAGENTS_RULES_PATH']),
            ('Skills', 'How-to guides loaded on demand', A3, [
                'One folder per skill, with a SKILL.md',
                'Kept under .chipagents/skills/',
                'YAML header: name, description',
                'Used automatically when it matches',
                'Or pick one: $ picker, @, or /skills'])]
    for i, (h, sub, c, lines) in enumerate(cols):
        x = 0.55 + i * 4.15
        box(s, f'h{i}', x, 1.5, 3.95, 0.95, [h, sub], c, 0.0, 18, body_size=12)
        box(s, f'b{i}', x, 2.55, 3.95, 3.15, ['  '] + ['•  ' + t for t in lines], c, 0.88, 6, bold=False,
            text_color=D1, align=PP_ALIGN.LEFT, line_color=c, body_size=15, anchor=MSO_ANCHOR.TOP)
    box(s, 'rule', 0.55, 5.9, 12.25, 0.55, 'Memory = facts   ·   Rules = always-on instructions   ·   '
        'Skills = procedures on demand', D2, 0.0, 15)
    source(s, f'Source: {DOCS}: usage/memory.md, configuration/rules.md, configuration/skills.md')
    finish(prs, s, 'knowledge')


def slide_tips(prs):
    s = content_slide(prs, 'Stay current, and 8 everyday tips')
    container(s, 0.55, 1.85, 5.15, 4.6, 'Updates', D2)
    code(s, 'upd', 0.72, 2.02, 4.81, 2.0, [
        ('$ chipagents --version', CODE_FG),
        ('/changelog               what is new', CODE_FG),
        ('', CODE_FG),
        ('# ~/.chipagents/config.toml', CMT),
        ('auto_update = true       # default', CODE_FG),
        ('', CODE_FG),
        ('# update by hand: re-run the installer', CMT),
        ('$ curl -LsSf <server>/install.sh | bash', CODE_FG),
    ], 12)
    box(s, 'restart', 0.72, 4.17, 4.81, 1.0, ['Restart chipagents web after an update',
        'A running server keeps the version it started with'], PART[0], 0.0, 12, text_color=AMBER,
        line_color=AMBER, body_size=11)
    box(s, 'shared', 0.72, 5.3, 4.81, 1.0, ['Shared (--global) installs',
        'Update manually, e.g. a cron job re-running install.sh -y --global'], WHITE, 0.0, 12, text_color=D2,
        line_color=D2, body_size=11)
    tips = [('Plan first', '/plan or Shift+Tab: no edits until you approve'),
            ('Try an alternative', '/fork the thread, keep the original'),
            ('Undo a wrong turn', '/checkpoint (Ctrl+G) rewinds, can restore code'),
            ('Long-running task', '/goal keeps working across turns'),
            ('Hard bug?', 'Raise the thinking level (/think, Tab, Web menu)'),
            ('Review edits', 'Web file/diff pane with +/- coloring'),
            ('Share work', '/share: teammates read it or fork a copy'),
            ('Ask the docs', '/help <question> answers from built-in docs')]
    for i, (h, b) in enumerate(tips):
        x = 5.95 + (i % 2) * 3.45
        y = 1.5 + (i // 2) * 1.25
        badge(s, x + 0.08, y + 0.33, i + 1, [A1, A2][(i // 2 + i) % 2], 0.4)
        box(s, f't{i}', x + 0.56, y, 2.74, 1.1, [h, b], [A1, A2][(i // 2 + i) % 2], 0.88, 14,
            text_color=D1, align=PP_ALIGN.LEFT, line_color=[A1, A2][(i // 2 + i) % 2], body_size=11)
    source(s, f'Source: {DOCS}: getting-started/installation.md, configuration/config.md, usage/plan-mode.md, '
           'usage/capabilities.md, usage/projects.md, changelog.md')
    finish(prs, s, 'tips')


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
    slide_web(prs)
    slide_commands(prs)
    slide_workflows(prs)
    slide_editor(prs)
    slide_context(prs)
    slide_knowledge(prs)
    slide_tips(prs)
    slide_end(prs)
    out = os.path.join(args.output_dir, 'ChipAgents_Features_and_Tips.pptx')
    prs.save(out)
    print(f'Saved {out}')
    verify_pptx(out, expected_slides=9)


if __name__ == '__main__':
    main()
