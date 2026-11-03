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
  script adds no text to the chat box. The image appears only as a thumbnail
  above the box, and only what you type is shown. When the message is sent
  (Enter, the Send button or "Send to background"), `[pasted image: <path>]`
  for each attached image is put in front of your text, and the agent reads
  the file from that path. A message can be images only.
- While images are attached, the chat box holds one invisible zero-width
  space, so the hub's Send button stays enabled with no typed text. It is
  removed before sending and when the last image is removed.
- `/img` sent with attached images includes them as reference images.
- In sent messages, the `[pasted image: <path>]` text is hidden and only the
  thumbnail is shown. The full path is still in the message the agent gets.
- Pastes that contain plain text are left alone.
- Drag and drop: drop PNG/JPEG/GIF/WebP files anywhere on the page. A dashed
  "Drop image to attach" outline marks the chat box, and the files are saved
  and inserted exactly like a paste. The browser never opens the dropped file.
- Thumbnails: each attached image is shown in a strip above the chat box.
  ✕ removes the image from the message (the saved file stays
  in `screens/`). The strip clears when the message is sent.
- `/img [png|jpg|svg] <description>` + Enter in the chat box expands into a
  request for the agent to draw the image as a standalone SVG, saved with the
  Edit tool to `screens/generated_images/gen_<timestamp>.svg` (`GEN_DIR`,
  created at startup). For `png` (the default) and `jpg`, the agent then runs
  `svg2img.py` to make `gen_<timestamp>.png|jpg` and replies with that path.
  The message is sent automatically; if it is not, press Enter again. Examples:
  `/img a robot soldering a chip` (PNG), `/img jpg sunset over a fab`,
  `/img svg block diagram of an SPI master`.
- For normal prompts, a Desktop project memory entry tells the agent to save
  drawings in the same folder and to use `svg2img.py` (or Pillow) for PNG/JPG.
- When both `gen_X.svg` and `gen_X.png|jpg` appear in a message, only the
  PNG/JPG is previewed. No external AI service is used; the ChipAgents agent
  writes the drawing itself.
- `svg2img.py in.svg out.png|out.jpg [--scale 2] [--background white|transparent]
  [--quality 92]` renders an SVG with headless Chrome (or Edge) on Windows and
  saves it with Pillow. The SVG is loaded as an image, so scripts and external
  files never run or load. Output defaults to 2x pixel density (capped at
  4096 px), and a temporary folder next to the output is removed afterwards.
  `CHROME_EXE` overrides the browser path.
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

Run `..\chipagents-web-paste.bat`. It first runs `stop-old.sh`, which stops
any old proxy (`node .../paste-proxy/paste-proxy.js`) and `chipagents web`
hub you own, so ports 4300/4242 are free and the newest code always loads.
`DRY_RUN=1 bash stop-old.sh` lists what would be stopped without stopping it.
The tokenized proxy link is printed and opened in the default Windows browser.
Use that link (port 4300), not the upstream port.

## Environment variables

| Variable | Default |
|---|---|
| `PASTE_DIR` | `/mnt/c/Users/jcortez3/Desktop/screens` |
| `GEN_DIR` | `$PASTE_DIR/generated_images` |
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
- `/img` images, including PNG/JPG, are drawings the agent writes as SVG:
  diagrams and illustrations, not photo-style AI images. That would need an
  image model (local Stable Diffusion or a cloud API approved by ADI IT).
- PNG/JPG conversion takes about 5 s per image, and the agent may ask
  permission to run the `python3` command.
- Pasted and generated images are not deleted automatically. Clean up
  `screens/` when needed.
- A ChipAgents update can change the hub page and break the injection.
