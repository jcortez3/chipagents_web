# ChipAgents Web image-paste proxy (local workaround)

ChipAgents Web v0.44.3 has no image paste in the chat box. This local proxy adds it.

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

## Presentation

`presentation/ChipAgents_Web_Image_Paste.pptx` is a 10-slide ADI-branded deck
covering the problem, architecture, paste flow, UID check, security,
verification, usage and limits. Regenerate it with
`python3 presentation/make_deck.py`.

## Limits

- Upload limit is 25 MB per image.
- Uploads require the `X-ChipAgents-Paste: 1` header and a loopback origin
  on the proxy port.
- Pasted images are not deleted automatically. Clean up `screens/` when needed.
- A ChipAgents update can change the hub page and break the injection.
