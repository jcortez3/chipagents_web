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
  `<your Desktop>/screens/paste_<timestamp>.<ext>`, and the
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
- Drag and drop: drop files or folders anywhere on the page. A dashed
  "Drop files or folders to attach" outline marks the chat box, and the files
  are saved and inserted exactly like a paste. The browser never opens the
  dropped file.
- Any file type can be pasted or dropped. PNG/JPEG/GIF/WebP images get a
  thumbnail and `[pasted image: <path>]`; other files get a `📄 name · size`
  chip and `[attached file: <path>]`, saved to `screens/attachments/`.
- Folders are uploaded file by file with their sub-folders (4 at a time, with
  progress on the chip) to `screens/attachments/<time>_<folder>/`, and the
  message gets `[attached folder: <path>]`. Sending waits until the folder
  is fully uploaded.
- In sent messages, file and folder markers become chips. Clicking a file
  chip downloads it through `/__file`.
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

## Setup (any user)

Copy the whole `chiagents web` folder anywhere, such as your Desktop or
Downloads. No paths are tied to one user. Each PC needs:

- WSL with Node.js 18 or newer (`node -v` in WSL).
- The ChipAgents CLI installed in WSL and logged in
  (`~/.local/bin/chipagents`, or `chipagents` on `PATH`).
- For PNG/JPG output: Python 3 with Pillow in WSL
  (`python3 -c "import PIL"`), and Chrome or Edge on Windows.
- ADI CA bundle (needed when Netskope inspects HTTPS, otherwise the hub shows
  "self signed certificate in certificate chain"). `start.sh` uses the first
  `adi-ca-bundle.pem` it finds in `~/certs/`, next to the `chiagents web`
  folder, or on the Desktop. If there is none, it exports the ADI and Netskope
  CA certificates (deduplicated, EFS certificates excluded) from the user's
  Windows certificate store to `~/certs/adi-ca-bundle.pem` and uses that.
  For the `chipagents` CLI outside the launcher (for example
  `chipagents login`), add
  `export NODE_EXTRA_CA_CERTS=$HOME/certs/adi-ca-bundle.pem` to `~/.bashrc`.

The launcher finds its own folder (`%~dp0`) and the logged-in user's Desktop
(`[Environment]::GetFolderPath('Desktop')`, which handles OneDrive
Desktops). It passes both to WSL through `WSLENV` (`/p` converts `C:\...`
to `/mnt/c/...`) and runs `paste-proxy/start.sh`. That script checks for
Node and ChipAgents, picks the CA bundle, sets `PASTE_DIR` to
`<Desktop>/screens`, and starts the proxy from the Desktop.

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
| `PASTE_DIR` | `<Desktop>/screens` (set by `start.sh`; `<cwd>/screens` if run directly) |
| `GEN_DIR` | `$PASTE_DIR/generated_images` |
| `PASTE_PROXY_PORT` | `4300` (first port tried) |
| `HUB_PORT` | `4242` (start port for `chipagents web`) |
| `CHIPAGENTS_BIN` | `~/.local/bin/chipagents` |
| `PASTE_NO_BROWSER` | unset (`1` disables auto-open) |
| `PREVIEW_ROOTS` | unset (extra preview roots, `:`-separated) |
| `CONV_DIR` | `<Desktop>/ChipAgents Conversations` (set by `start.sh`; `<cwd>/ChipAgents Conversations` if run directly) |
| `CONV_SYNC` | on (`0` turns conversation folders off) |
| `CONV_FILE_MAX_MB` | `100` (larger files are listed, not copied) |
| `CONV_TOTAL_MAX_MB` | `2000` per conversation folder |
| `UPLOAD_MAX_MB` | `100` per pasted/dropped file |

## Conversation folders

While the launcher runs, every conversation gets its own folder, updated
after each message and reply (every ~10 s while the agent is working):

```
Desktop/ChipAgents Conversations/
  index.json                         thread id -> folder name
  2026-11-06_<title>_<id8>/
    conversation.md                  readable history, images inline,
                                     tool calls collapsible, Files table
    conversation.json                full raw data from the hub
    attachments/                     what you pasted or dropped
    generated/                       images the agent generated
    files/C/Users/.../file.vb        copies of files the agent read,
    files/home/<user>/.../file.py    created or edited (original path mirrored)
```

- **Source:** the proxy reads `/hub/api/runs` every 5 s with the launch
  token and syncs every conversation whose `updatedAt` changed. Opening an
  older conversation in the hub also syncs it, so it gets a folder too. The
  first open of an old conversation can take ~30 s while the hub downloads it.
- **Files** come from the tool calls (View, Edit, ExtractPdf, spreadsheet,
  waveform, Lint, Plot, ...), from paths in Bash/RunToolProgram commands
  (only existing files under `/mnt/<drive>`, `/home`, `/root`), and from
  the markers in your messages. Copies are refreshed when the original
  changes. Originals are never moved or modified.
- **Not copied:** files that look like secrets (`credentials.json`,
  `*.pem`, `*.key`, `id_rsa*`, `.env`, `.git-credentials`, `~/.ssh`),
  `/proc`, `/sys`, `/dev`, files over `CONV_FILE_MAX_MB` and anything
  past `CONV_TOTAL_MAX_MB` per folder. They are listed in the Files table
  with the reason.
- The folder name uses the hub's title. A folder created before the hub
  chose a title is renamed once when the real title arrives.
- Temporary conversations are not saved.
- Files touched only by a subagent are not visible in the transcript and are
  not copied. Paths reached indirectly by shell commands (globs, `cd` plus a
  relative name) can be missed.
- Saved history is never shortened: if the hub shows less than the folder
  already has (e.g. after a restart), the earlier entries are kept and merged.
- It relies on the hub's internal API (checked on 0.44.3). If the API stops
  answering, the launcher logs `[conversations] sync disabled` and paste keeps
  working.

## Version and updates

The running version is shown beside the ChipAgents logo (top left), e.g.
`v0.44.3`. Click it to check for updates again (it also checks every 30 min).

The terminal CLI updates itself when it starts, but `chipagents web` does not,
so Web-only users can fall behind. When the server in your `config.toml`
(`endpoint_url`, ADI's server for ADI installs) offers a newer version, a green
**⬆ Update to x.y.z** button appears. Clicking it:

1. waits until no conversation is running (a restart in the middle of a reply
   leaves the hub showing only the part after the restart), then asks for
   confirmation;
2. downloads `install.sh` from that server and runs it with `--json`, using
   the system and ADI certificates for its `curl` (Netskope);
3. restarts `chipagents web` on the new version. The tab reloads by itself
   with the new sign-in link.

The steps show in the pill and in the launcher window (`[update] ...`). If the
installer fails, the error is shown and the old version keeps running. Older
versions stay in `~/.chipagents/chipagents/`. To go back, re-point
`~/.local/bin/chipagents` to one of them and restart the launcher.

Shared installs (`CHIPAGENTS_INSTALL` set, or no write access) only show
"x.y.z available"; your administrator updates those.

## Limits

- Upload limit is `UPLOAD_MAX_MB` (100 MB) per file; folders up to 2000
  files and 1 GB. Image previews are shown for images up to 25 MB.
- `/__file` (chip downloads) needs the hub token, only serves files under the
  same folders as `/__img` plus the conversations folder, and refuses files
  that look like secrets.
- Uploads require the `X-ChipAgents-Paste: 1` header and a loopback origin
  on the proxy port.
- The page script picks up the hub token from the hub's own requests
  (`x-access-token` on `fetch`, `?token=` on WebSocket/EventSource and the
  page URL), with `localStorage`/`sessionStorage` as fallbacks. This works
  even if the browser blocks site storage or the hub keeps the token in
  memory only. The proxy also forwards the browser's cookies when it checks a
  request, so cookie-based hub sign-in works. A rejected request is logged once
  per 30 s in the launcher window with status codes only, never the token.
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
