// jcortez3
const msg = document.getElementById('msg');
async function ask() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    msg.textContent = '✓ Microphone enabled. This tab closes by itself. Click 🎙 in the companion panel to talk.';
    chrome.runtime.sendMessage({ type: 'micGranted' }).catch(() => {});
    setTimeout(() => chrome.tabs.getCurrent((t) => t && chrome.tabs.remove(t.id)), 2500);
  } catch (e) {
    msg.textContent = `The microphone is blocked (${e.name}). Click the site settings icon at the left of the address bar, set Microphone to Allow, then click Ask again.`;
  }
}
document.getElementById('again').addEventListener('click', ask);
ask();
