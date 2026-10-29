# ChipAgents Web image-paste proxy (local workaround)

ChipAgents Web v0.44.3 has no image paste in the chat box and does not show image
files inline. This local proxy adds image paste, `/img` agent-drawn images, and
inline image previews.

## How it works

- `paste-proxy.js` starts `chipagents web` as a child process. It listens on
  `127.0.0.1:4300` (or the next free port) and forwards all HTTP, SSE and
  WebSocket traffic to the real server.
- It injects `paste-inject.js` into the hub HTML. When an image (png, jpg,
  gif, webp) is pasted into the chat box, the script uploads it to
  `/__paste/upload`. The proxy saves it to
  `/mnt/c/Users/jcortez3/Desktop/screens/paste_<timestamp>.<ext>`, and the
  script inserts `[pasted image: <path>]` at the cursor. The agent reads the
  file from that path.
- Pastes that contain plain text are left alone.
- `/img <description>` + Enter in the chat box expands into a request for the
  agent to draw the image as a standalone SVG. The agent saves it with the Edit
  tool to `screens/gen_<timestamp>.svg`, and the message is sent automatically.
  If it is not sent, press Enter again. No external AI service is used; the
  ChipAgents agent writes the SVG itself.
- Any image path or file link shown in the chat (`.svg`, `.png`, `.jpg`,
  `.jpeg`, `.gif`, `.webp`) gets an inline preview. This covers absolute paths,
  `C:\` paths, and names relative to a workspace root, such as `dog.svg`, so
  "create an image of a dog" works without `/img`. Missing files are retried
  every 2 s: up to 5 minutes for `gen_*`/`paste_*` files, 30 s otherwise.
  Click a preview to enlarge it; click or press Escape to close.
- Images are served from `/__img?path=<path>`. Only files that resolve, after
  following symlinks, inside an allowed root are served: `PASTE_DIR`, the
  proxy's working directory, the ChipAgents Web workspace roots in
  `~/.chipagents/workspaces.json`, and `PREVIEW_ROOTS`.
- The proxy connects to ChipAgents as the WSL user, so the Linux UID check
  passes without `CHIPAGENTS_DISABLE_UID_CHECK`.

## Usage

Run `..\chipagents-web-paste.bat`. The tokenized proxy link is printed and
opened in the default Windows browser. Use that link (port 4300), not the
upstream port.

## Environment variables

| Variable | Default |
|---|---|
| `PASTE_DIR` | `/mnt/c/Users/jcortez3/Desktop/screens` |
| `PASTE_PROXY_PORT` | `4300` (first port tried) |
| `HUB_PORT` | `4242` (start port for `chipagents web`) |
| `CHIPAGENTS_BIN` | `~/.local/bin/chipagents` |
| `PASTE_NO_BROWSER` | unset (`1` disables auto-open) |
| `PREVIEW_ROOTS` | unset (extra preview roots, `:`-separated) |

## Presentation

`presentation/ChipAgents_Web_Image_Paste.pptx` is a 10-slide ADI-branded deck
covering the problem, architecture, paste flow, UID check, security,
verification, usage and limits. Regenerate it with
`python3 presentation/make_deck.py`.

## Limits

- Upload limit is 25 MB per image.
- Uploads require the `X-ChipAgents-Paste: 1` header and a loopback origin
  on the proxy port.
- Both `/__paste/upload` and `/__img` require the hub access token (the
  `x-access-token` header or `?token=`). The proxy checks it against
  `chipagents web` and caches valid tokens for 60 s.
- Served images carry `Content-Security-Policy: ...; sandbox` and
  `X-Content-Type-Options: nosniff`, so scripts inside an SVG never run.
- `/img` images are SVG drawings made by the agent: diagrams and
  illustrations, not photos.
- Pasted and generated images are not deleted automatically. Clean up
  `screens/` when needed.
- A ChipAgents update can change the hub page and break the injection.
