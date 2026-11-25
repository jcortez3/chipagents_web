# jcortez3
# ChipAgents Companion (Chrome and Edge extension)

The companion is a side panel that holds your ChipAgents Web hub. From the panel you can share the tab you are viewing (its text, your selection, or a screenshot) and talk with the agent by voice. Every message goes through the normal hub, so conversations are saved in `ChipAgents Conversations` like any other.

## Install (one time per browser)

You need ChipAgents Web running first: run `chipagents-web-paste.bat`.

**Microsoft Edge**
1. Open `edge://extensions`.
2. Turn on **Developer mode** (the switch is on the left side).
3. Click **Load unpacked** and select this folder:
   `C:\Users\<you>\Desktop\chiagents web\companion-extension`
4. Click the puzzle icon in the toolbar, then the eye/pin icon next to **ChipAgents Companion** so it stays in the toolbar.

**Google Chrome**
1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the same folder.
4. Click the puzzle icon, then the pin next to **ChipAgents Companion**.

Leave Developer mode on: Chrome turns unpacked extensions off when it is switched off. If the browser shows "Developer mode is disabled by your administrator", IT policy blocks unpacked extensions on that PC.

After you change any file in this folder, click **Reload** (↻) on the extension's card.

## Connect (first time, and after each launcher restart)

1. Click the companion icon (or press **Alt+Shift+A**). The side panel opens.
2. Open the link the launcher prints (`http://localhost:4300/hub?token=...`) once in the same browser. The companion picks it up by itself.
   You can also paste the link into the panel, or into ⚙ Settings.

When the launcher restarts, the token changes and the panel says the link expired. Open the new link once in that browser.

## Use

| Control | What it does |
|---|---|
| ● Sharing tab / Not sharing | When sharing is on, every message you send (typed or spoken) also gets a snapshot of the current tab. The snapshot is sent only when the page changed or you are in a new conversation. |
| 🎙 (Alt+T) | Start or end a voice conversation. You speak; after a short pause (1.5 s, can be changed) the message is sent. The reply is read aloud, then the panel listens again. |
| ⏹ / Space | Stop speaking. In a voice conversation the panel then listens right away (interrupt). |
| Esc | End the voice conversation or stop speaking. |
| 📄 | Ask about this tab. Sends the page text (or the PDF file for PDF tabs) with the question typed in the hub box, or asks for a summary if the box is empty. |
| ✂ | Same, with only the text you selected on the page. |
| 📸 | Same, with a screenshot of the visible part of the tab. |
| 🔊 / 🔇 | Read replies to typed messages aloud, or not. Voice conversations are always read aloud. |
| ▶ (Alt+R) | Read the last reply aloud. |
| ⧉ | Open the companion in its own window. It then follows the tab you last used in a normal browser window. |
| ⚙ | Hub link, reply voice, speed, speech language, pause length, short spoken answers. |

In a voice conversation the tab is also shared when you mention it, even with sharing off. For example, "summarize this page" or "what am I looking at" adds the page text, and "what's on my screen" also adds a screenshot. Say "stop" or "never mind" to drop what you just said, and "goodbye" to end the conversation.

Voice messages end with a short note asking for brief spoken answers. You can turn this off in ⚙ Settings.

## Where things are saved

- Page snapshots (`tab_<title>.md`, `selection_<title>.md`) and PDFs go to `Desktop\screens\attachments`. Screenshots go to `Desktop\screens` as `paste_*.png`.
- The conversation is a normal hub thread. Its folder in `Desktop\ChipAgents Conversations` holds the transcript and the files the agent read.

## Privacy

- The companion reads a tab only when you click 📄 ✂ 📸, when sharing is on and you send a message, or when you mention the page in a voice message. It never reads tabs in the background.
- Voice input uses the browser's speech service, which sends the audio to Google (Chrome) or Microsoft (Edge).
- Offline voices (for example Zira or David) keep reply text on your PC. Voices marked "online" in Settings send the reply text to Microsoft or Google.

## Troubleshooting

| Problem | Fix |
|---|---|
| "The microphone needs a one-time permission" | Click **Enable microphone**. A tab opens; click **Allow**. The side panel cannot show the permission prompt itself. |
| "The browser's speech service could not be reached" | The network or proxy blocks the browser's speech service. Typing and spoken replies still work. |
| "The browser doesn't let extensions read this kind of page" | Browser pages (`edge://`, `chrome://`), the extension stores, and new-tab pages cannot be read. |
| Local files (`file://`) cannot be read | On the extension's card, click **Details**, then turn on **Allow access to file URLs**. |
| Panel says it can't reach ChipAgents Web | Start `chipagents-web-paste.bat`, then click **Retry**. |
| Message stays in the hub box | The hub did not accept the automatic Enter. Press Enter in the box. |
