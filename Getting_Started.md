# jcortez3
# ChipAgents Web: Getting Started

This guide goes from downloading the zip on GitHub to installing your first
skill.

---

## 1. Download

1. Open https://github.com/jcortez3/chipagents_web (ask Justine for access
   if the page does not open).
2. Click the green **Code** button, then **Download ZIP**.
3. In **Downloads**, right-click `chipagents_web-main.zip` and choose
   **Extract All…**.
4. Move the extracted `chipagents_web-main` folder to your **Desktop**. You
   can rename it, for example to `chipagents web`.

> Keep the whole folder together. Do not move single files out of it.

---

## 2. One-time setup (first PC use only)

### 2a. Install WSL (Ubuntu)

Skip this step if you already have Ubuntu in the Start menu.

1. Open **PowerShell as Administrator**.
2. Run `wsl --install`.
3. Restart the PC.
4. Open **Ubuntu** from the Start menu and create a Linux user name and
   password.

### 2b. Install Node.js and Python tools

In the **Ubuntu** window, run:

```bash
sudo apt update
sudo apt install -y nodejs python3 python3-pil git
node -v
```

`node -v` must show **v18** or newer.

### 2c. Install the ChipAgents CLI and log in

1. Double-click **`chipagents-web-paste.bat`** in the folder.
2. The first time, it stops and prints the exact commands for your PC. It
   also sets up the ADI certificates. The commands look like this:

   ```bash
   export CURL_CA_BUNDLE=$HOME/certs/ca-all.pem NODE_EXTRA_CA_CERTS=$HOME/certs/adi-ca-bundle.pem
   curl -LsSf https://chipagentssrv.engawsus1.analog.com/agent/install.sh | bash
   ~/.local/bin/chipagents login
   ```

3. Copy those commands into the **Ubuntu** window and run them. Log in with
   your ADI account when the browser opens.
4. Optional, but it helps later:

   ```bash
   echo 'export NODE_EXTRA_CA_CERTS=$HOME/certs/adi-ca-bundle.pem' >> ~/.bashrc
   ```

---

## 3. Start ChipAgents Web

1. Double-click **`chipagents-web-paste.bat`** again.
   - The first run creates a **ChipAgents Web** shortcut on your Desktop, so
     use that from now on.
2. A black window opens and your browser opens ChipAgents Web
   (`http://localhost:4300/hub?token=…`).
   - **Keep the black window open.** Closing it stops ChipAgents Web.
   - If the browser does not open, copy the `http://localhost:4300/hub?token=…`
     link from the black window into your browser.
3. Add a workspace, which is the folder you want the agent to work in, and
   start a chat.

What you get on top of normal ChipAgents Web:

| Feature | How |
|---|---|
| Paste screenshots | Ctrl+V in the chat box |
| Attach files and folders | Drag and drop them onto the chat box |
| Make images | `/img a robot soldering a chip` (or `/img jpg …`, `/img svg …`) |
| Image previews | Image paths in replies show inline. Click one to enlarge it. |
| Saved conversations | `Desktop\ChipAgents Conversations\` (one folder per chat) |
| Updates | A green **⬆ Update to x.y.z** button appears when there is a new version |
| Skills | The blue **🧩 Skills** button (see section 4) |

---

## 4. Skills

A **skill** is a folder with a `SKILL.md` file that teaches ChipAgents a
task. Click the blue **🧩 Skills** button at the top left, next to the
version number.

### Install a skill someone sent you (for example on Teams)

1. Download the skill file (`.zip`).
2. In **🧩 Skills**, open the **Import** tab.
3. Drag the file into the box, or click **Choose file…**.
   - A skill folder works too: drag it in or use **Choose folder…**.
4. Check the card that appears:
   - Lines marked ✖ are errors, and the skill cannot be installed.
   - Lines marked ⚠ are warnings. Read them first.
5. Under **Install into**, choose:
   - **User (all workspaces)**, the usual choice.
   - **Workspace: …**, which makes it work only in that workspace.
6. Click **Install**.
7. **Start a new chat** (or type `/reload`) to use the skill.

### Install from the shared catalog

1. Open the **Catalog** tab.
2. Pick a scope under **Install into**.
3. Click **Install**.
   - **Installed ✓** means you already have the same version.
   - **⬆ Update** means a different version is available.

### Share one of your skills

1. Open the **Installed** tab and find the skill. The search box helps.
2. Pick one way to share:
   - **⬇ Export .zip** downloads the skill. Post the `.zip` on Teams.
   - **📤 Publish** copies the skill into the shared catalog folder
     (`skill-catalog`).

### Update or remove a skill

These are in the **Installed** tab:

- **⬆ Update** gets the catalog version.
- **🗑 Delete** removes the skill, keeping a copy in Backups.
- **↺ Backups → ↺ Restore** brings back an older or deleted copy.

### Good to know

- Nothing is lost. Replacing or deleting a skill keeps the old copy in
  Backups, which holds the last 5 per skill.
- To turn a skill **on or off**, type `/skills` in a chat.
- If you are asked to confirm **"auto-approve-scripts"**, that skill can
  run its scripts without asking you. Only say yes if you trust where it
  came from.

---

## 5. Every day

1. Double-click the **ChipAgents Web** shortcut on your Desktop.
2. Work in the browser tab that opens.
3. When you are done, close the black window.

## 6. Getting a newer version of this tool

ChipAgents Web checks GitHub for a newer version every few hours and
downloads it in the background.

1. When a teal **⬆ ChipAgents Web update** button appears beside the
   version (top left), click it to see what changed.
2. Click **Update now**. If a conversation is still running, wait until it
   finishes. Click **Later** to be asked again at the next new version.
3. The black window restarts the tool (about a minute) and the browser tab
   reloads by itself.
4. Your chats, settings, installed skills and the skills in `skill-catalog`
   are kept. The replaced files are backed up in
   `~/.chipagents/web-updater/backups/`.
5. If the update says the ChipAgents Companion extension changed, click
   **Reload** on its card in `edge://extensions` or `chrome://extensions`.

To check right away, click the version button (for example `v0.48.2`).
If you downloaded this tool before the self-update existed, download the ZIP
once more (step 1); after that, updates come by themselves.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "self signed certificate in certificate chain" | Close the black window and start again. The launcher re-exports the ADI certificates. |
| "Node.js was not found in WSL" | Do step 2b. |
| "ChipAgents CLI was not found in WSL" | Do step 2c. |
| Browser says the page can't be reached | The black window was closed, so start it again. |
| "hub access token was rejected" | Use the newest `http://localhost:4300/hub?token=…` link from the black window. The link changes on every start. |
| A new skill does not show up | Start a new chat, or type `/reload`. |
| **🧩 Skills** button missing | Make sure you opened the port **4300** link from the black window. |
| Tab did not reload after **Update now** | Use the newest link from the black window. If the update failed, the old version keeps running and the error is in the black window (`[tool-update] ...`). |
