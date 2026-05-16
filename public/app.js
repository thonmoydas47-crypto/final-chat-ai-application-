// ============================================================
// CHAT FRONTEND
// ============================================================
// Sends each user message + the running history to /api/chat,
// reads the streamed Server-Sent Events response, and types
// the AI reply into the page chunk-by-chunk.
// ============================================================

const messagesEl = document.getElementById('messages');
const formEl = document.getElementById('composer');
const inputEl = document.getElementById('composer-input');
const sendBtn = document.getElementById('composer-send');

const history = [];

formEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.value = '';
  setBusy(true);

  appendMessage('user', text);
  history.push({ role: 'user', text });

  const aiBubble = appendMessage('assistant', '', { streaming: true });

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => '');
      throw new Error(errText || `Request failed (${response.status})`);
    }

    let assistantText = '';
    for await (const eventData of readSseStream(response.body)) {
      if (eventData === '[DONE]') break;
      let payload;
      try {
        payload = JSON.parse(eventData);
      } catch {
        continue;
      }
      if (payload.error) throw new Error(payload.error);
      if (payload.text) {
        assistantText += payload.text;
        aiBubble.textContent = assistantText;
        scrollToBottom();
      }
    }

    history.push({ role: 'assistant', text: assistantText });
  } catch (err) {
    aiBubble.textContent = `⚠️ ${err.message}`;
  } finally {
    aiBubble.parentElement.classList.remove('is-streaming');
    setBusy(false);
    inputEl.focus();
  }
});

function setBusy(busy) {
  inputEl.disabled = busy;
  sendBtn.disabled = busy;
  sendBtn.textContent = busy ? '...' : 'Send';
}

function appendMessage(role, text, { streaming = false } = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role === 'assistant' ? 'ai-message' : 'user-message'}`;
  if (streaming) wrapper.classList.add('is-streaming');

  const bubble = document.createElement('div');
  bubble.className = 'message-content';
  bubble.textContent = text;
  wrapper.appendChild(bubble);

  messagesEl.appendChild(wrapper);
  scrollToBottom();
  return bubble;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function* readSseStream(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
      if (dataLine) yield dataLine.slice(6);
    }
  }
}

function useSuggestion(text) {
  const inputElement = document.getElementById('composer-input');
  if (inputElement) {
    inputElement.value = text;
    inputElement.focus();
  }
}
