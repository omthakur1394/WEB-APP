const BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')
  ? "http://127.0.0.1:8000"
  : "https://falling-forest-1f86.omthakur1394.workers.dev";
const API_URL = `${BASE_URL}/chat`;
const VOICE_LANGUAGE = 'hi-IN';

if (!document.getElementById('jspdf-script')) {
  const s = document.createElement('script');
  s.id = 'jspdf-script';
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  document.head.appendChild(s);
}

const chatContainer = document.getElementById('chat-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const voiceBtn = document.getElementById('voice-btn');
const voiceStatus = document.getElementById('voice-status');
const newChatBtn = document.getElementById('new-chat-btn');
const mobileNewChat = document.getElementById('mobile-new-chat');
const threadDisplay = document.getElementById('thread-id-display');
const chatHistoryList = document.getElementById('chat-history-list');

let currentThreadId = '';
let allSessions = [];
let recognition = null;
let isListening = false;
let isVoiceModeActive = false;
let isSpeaking = false;
let voiceFinalTranscript = '';
let activeVoiceTranscript = '';

function init() {
  setupVoiceInput();
  loadAllSessions();
  const saved = localStorage.getItem("thread_id");
  if (saved) {
    currentThreadId = saved;
    if (threadDisplay) threadDisplay.textContent = currentThreadId;
    loadHistory();
  } else {
    startNewSession();
  }
  messageInput.focus();
}

function syncInputState() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
  sendBtn.disabled = messageInput.value.trim() === '';
}

function setupVoiceInput() {
  if (!voiceBtn) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition || !window.speechSynthesis) {
    voiceBtn.disabled = true;
    voiceBtn.title = 'Voice conversation is not supported in this browser';
    voiceBtn.setAttribute('aria-label', 'Voice conversation is not supported in this browser');
    setVoiceStatus('Voice mode needs a browser with microphone and speech support.');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = VOICE_LANGUAGE;

  recognition.addEventListener('start', () => {
    isListening = true;
    voiceBtn.classList.add('listening', 'active');
    voiceBtn.title = 'Stop voice conversation';
    voiceBtn.setAttribute('aria-label', 'Stop voice conversation');
    setVoiceStatus('Listening...');
  });

  recognition.addEventListener('result', (event) => {
    let interimTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        voiceFinalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    activeVoiceTranscript = `${voiceFinalTranscript} ${interimTranscript}`.trim();
    messageInput.value = activeVoiceTranscript;
    syncInputState();
  });

  recognition.addEventListener('end', () => {
    isListening = false;
    voiceBtn.classList.remove('listening');

    if (!isVoiceModeActive) {
      resetVoiceButton();
      messageInput.focus();
      return;
    }

    const spokenText = activeVoiceTranscript.trim();
    if (spokenText) {
      sendMessage({ text: spokenText, voiceOnly: true });
      return;
    }

    setVoiceStatus('I did not catch that. Listening again...');
    setTimeout(startVoiceListening, 700);
  });

  recognition.addEventListener('error', (event) => {
    console.error('Speech recognition error:', event.error);
    isListening = false;
    voiceBtn.classList.remove('listening');
    if (event.error === 'not-allowed') {
      stopVoiceConversation('Microphone permission was blocked.');
      return;
    }
    if (isVoiceModeActive) {
      setVoiceStatus('Voice input had a problem. Listening again...');
      setTimeout(startVoiceListening, 900);
    }
  });
}

function setVoiceStatus(text) {
  if (!voiceStatus) return;
  voiceStatus.textContent = text;
  voiceStatus.classList.toggle('visible', Boolean(text));
}

function resetVoiceButton() {
  if (!voiceBtn) return;
  voiceBtn.classList.remove('active', 'listening', 'speaking');
  voiceBtn.innerHTML = '<i data-lucide="mic"></i>';
  voiceBtn.title = 'Start voice conversation';
  voiceBtn.setAttribute('aria-label', 'Start voice conversation');
  if (window.lucide) lucide.createIcons({ root: voiceBtn });
}

function startVoiceListening() {
  if (!recognition || !isVoiceModeActive || isListening || isSpeaking) return;

  voiceFinalTranscript = '';
  activeVoiceTranscript = '';
  messageInput.value = '';
  syncInputState();

  try {
    recognition.start();
  } catch (err) {
    console.error('Could not start speech recognition:', err);
  }
}

function startVoiceConversation() {
  if (!recognition) return;
  isVoiceModeActive = true;
  window.speechSynthesis.cancel();
  voiceBtn.classList.add('active');
  voiceBtn.innerHTML = '<i data-lucide="mic-off"></i>';
  voiceBtn.title = 'Stop voice conversation';
  voiceBtn.setAttribute('aria-label', 'Stop voice conversation');
  if (window.lucide) lucide.createIcons({ root: voiceBtn });
  startVoiceListening();
}

function stopVoiceConversation(statusText = '') {
  isVoiceModeActive = false;
  window.speechSynthesis.cancel();
  if (isListening) {
    recognition.stop();
  }
  isListening = false;
  isSpeaking = false;
  voiceFinalTranscript = '';
  activeVoiceTranscript = '';
  resetVoiceButton();
  setVoiceStatus(statusText);
  messageInput.focus();
}

function toggleVoiceConversation() {
  if (isVoiceModeActive) {
    stopVoiceConversation();
  } else {
    startVoiceConversation();
  }
}

function cleanTextForSpeech(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#>~-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function speakAssistantResponse(text) {
  const speechText = cleanTextForSpeech(text);
  if (!speechText) {
    if (isVoiceModeActive) startVoiceListening();
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(speechText);
  utterance.lang = VOICE_LANGUAGE;
  const hindiVoice = window.speechSynthesis
    .getVoices()
    .find(voice => voice.lang && voice.lang.toLowerCase().startsWith('hi'));
  if (hindiVoice) utterance.voice = hindiVoice;
  utterance.rate = 1;
  utterance.pitch = 1;

  utterance.onstart = () => {
    isSpeaking = true;
    voiceBtn.classList.add('speaking');
    setVoiceStatus('Speaking...');
  };

  utterance.onend = () => {
    isSpeaking = false;
    voiceBtn.classList.remove('speaking');
    if (isVoiceModeActive) {
      setVoiceStatus('Listening...');
      startVoiceListening();
    } else {
      setVoiceStatus('');
    }
  };

  utterance.onerror = () => {
    isSpeaking = false;
    voiceBtn.classList.remove('speaking');
    if (isVoiceModeActive) startVoiceListening();
  };

  window.speechSynthesis.speak(utterance);
}

function generateDynamicId() {
  return 'sess_' + Math.random().toString(36).substring(2, 10);
}

function startNewSession() {
  currentThreadId = generateDynamicId();
  localStorage.setItem("thread_id", currentThreadId);

  if (!allSessions.includes(currentThreadId)) {
    allSessions.unshift(currentThreadId);
    localStorage.setItem("all_sessions", JSON.stringify(allSessions));
  }

  if (threadDisplay) threadDisplay.textContent = currentThreadId;
  renderSessionList();

  chatContainer.innerHTML = `
    <div class="welcome-view">
      <div class="welcome-icon"><i data-lucide="bot"></i></div>
      <h1>How can I assist you?</h1>
      <p>I am connected to your secure API and ready to help.</p>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

function loadAllSessions() {
  const saved = localStorage.getItem("all_sessions");
  allSessions = saved ? JSON.parse(saved) : [];
  renderSessionList();
}

function renderSessionList() {
  if (!chatHistoryList) return;
  if (allSessions.length === 0) {
    chatHistoryList.innerHTML = `<div class="history-empty">No history yet</div>`;
    return;
  }

  chatHistoryList.innerHTML = '';
  allSessions.forEach((sessionId, index) => {
    const item = document.createElement('div');
    item.className = 'history-item' + (sessionId === currentThreadId ? ' active' : '');

    const label = document.createElement('span');
    label.innerHTML = `<i data-lucide="message-square"></i> Session ${allSessions.length - index}`;
    label.style.flex = '1';
    label.onclick = () => switchSession(sessionId);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-session-btn';
    deleteBtn.innerHTML = `<i data-lucide="trash-2"></i>`;
    deleteBtn.title = 'Delete session';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteSession(sessionId);
    };

    item.appendChild(label);
    item.appendChild(deleteBtn);
    chatHistoryList.appendChild(item);
  });

  if (window.lucide) lucide.createIcons({ root: chatHistoryList });
}

async function switchSession(sessionId) {
  currentThreadId = sessionId;
  localStorage.setItem("thread_id", sessionId);
  if (threadDisplay) threadDisplay.textContent = sessionId;
  renderSessionList();
  chatContainer.innerHTML = '';
  await loadHistory();
  messageInput.focus();
}

async function loadHistory() {
  try {
    const response = await fetch(`${BASE_URL}/history/${currentThreadId}`);
    const data = await response.json();
    const messages = data.history;

    if (!messages || messages.length === 0) {
      chatContainer.innerHTML = `
        <div class="welcome-view">
          <div class="welcome-icon"><i data-lucide="bot"></i></div>
          <h1>How can I assist you?</h1>
          <p>I am connected to your secure API and ready to help.</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    chatContainer.innerHTML = '';
    messages.forEach(msg => {
      if (msg.role === 'human') appendMessage('user', msg.content);
      else if (msg.role === 'ai') appendMessage('assistant', msg.content);
    });

  } catch (err) {
    console.error("Failed to load history", err);
    chatContainer.innerHTML = `
      <div class="welcome-view">
        <div class="welcome-icon"><i data-lucide="bot"></i></div>
        <h1>How can I assist you?</h1>
        <p>I am connected to your secure API and ready to help.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }
}

async function deleteSession(sessionId) {
  const confirmed = confirm("Delete this session permanently from database?");
  if (!confirmed) return;

  try {
    await fetch(`${BASE_URL}/history/${sessionId}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.error("Failed to delete from database", err);
  }

  allSessions = allSessions.filter(id => id !== sessionId);
  localStorage.setItem("all_sessions", JSON.stringify(allSessions));

  if (sessionId === currentThreadId) {
    startNewSession();
  } else {
    renderSessionList();
  }
}

[newChatBtn, mobileNewChat].forEach(btn => {
  if (btn) btn.addEventListener('click', () => {
    startNewSession();
    messageInput.focus();
  });
});


messageInput.addEventListener('input', () => {
  syncInputState();
});

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener('click', () => sendMessage());
if (voiceBtn) voiceBtn.addEventListener('click', toggleVoiceConversation);

function createStreamingAssistantMessage() {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message assistant';

  const bubbleWrapper = document.createElement('div');
  bubbleWrapper.className = 'bubble-wrapper';

  const toolBadge = document.createElement('div');
  toolBadge.className = 'tool-status-badge';
  toolBadge.style.display = 'none';
  bubbleWrapper.appendChild(toolBadge);

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
  bubbleWrapper.appendChild(bubble);

  msgDiv.appendChild(bubbleWrapper);
  chatContainer.appendChild(msgDiv);
  requestAnimationFrame(() => { msgDiv.classList.add('show'); });
  scrollToBottom();

  let accumulatedText = '';
  let accumulatedReasoning = '';
  let isFirstToken = true;

  return {
    setTool(toolName) {
      toolBadge.style.display = 'inline-flex';
      toolBadge.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Running ${escapeHTML(toolName)}...`;
      if (window.lucide) lucide.createIcons({ root: toolBadge });
      scrollToBottom();
    },
    clearTool() {
      toolBadge.style.display = 'none';
      toolBadge.innerHTML = '';
    },
    appendReasoning(reasoningChunk) {
      accumulatedReasoning += reasoningChunk;
      toolBadge.style.display = 'inline-flex';
      toolBadge.innerHTML = `<i data-lucide="sparkles" class="spin"></i> Thinking...`;
      if (window.lucide) lucide.createIcons({ root: toolBadge });
      scrollToBottom();
    },
    appendToken(token) {
      if (isFirstToken) {
        bubble.innerHTML = '';
        toolBadge.style.display = 'none';
        isFirstToken = false;
      }
      accumulatedText += token;
      bubble.innerHTML = renderMarkdownSafely(accumulatedText);
      scrollToBottom();
    },
    getText() {
      return accumulatedText;
    },
    finalize(finalText = null) {
      if (finalText !== null) {
        accumulatedText = finalText;
      }
      toolBadge.style.display = 'none';
      if (isFirstToken && !accumulatedText) {
        bubble.innerHTML = '<em>No response received.</em>';
      } else {
        bubble.innerHTML = renderMarkdownSafely(accumulatedText);
      }

      const actionRow = document.createElement('div');
      actionRow.className = 'action-buttons';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'msg-action-btn';
      copyBtn.innerHTML = `<i data-lucide="copy"></i> Copy`;
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(accumulatedText);
        copyBtn.innerHTML = `<i data-lucide="check"></i> Copied!`;
        if (window.lucide) lucide.createIcons({ root: copyBtn });
        setTimeout(() => {
          copyBtn.innerHTML = `<i data-lucide="copy"></i> Copy`;
          if (window.lucide) lucide.createIcons({ root: copyBtn });
        }, 2000);
      };

      const pdfBtn = document.createElement('button');
      pdfBtn.className = 'msg-action-btn';
      pdfBtn.innerHTML = `<i data-lucide="download"></i> PDF`;
      pdfBtn.onclick = () => exportToPDF(accumulatedText);

      actionRow.appendChild(copyBtn);
      actionRow.appendChild(pdfBtn);
      bubbleWrapper.appendChild(actionRow);

      if (window.renderMathInElement) {
        renderMathInElement(bubble, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '\\[', right: '\\]', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false }
          ],
          throwOnError: false
        });
      }

      if (window.lucide) lucide.createIcons({ root: msgDiv });
      scrollToBottom();
    },
    remove() {
      msgDiv.remove();
    }
  };
}

async function sendMessage(options = {}) {
  const hasOptions = options && typeof options === 'object';
  const rawText = hasOptions && 'text' in options ? options.text.trim() : messageInput.value.trim();
  const voiceOnly = hasOptions && options.voiceOnly === true;
  const text = voiceOnly
    ? `${rawText}\n\nPlease reply only in Hindi. Keep the answer natural for spoken audio.`
    : rawText;
  const displayText = rawText;
  if (!text) return;

  const welcomeView = document.querySelector('.welcome-view');
  if (welcomeView) welcomeView.remove();

  if (!allSessions.includes(currentThreadId)) {
    allSessions.unshift(currentThreadId);
    localStorage.setItem("all_sessions", JSON.stringify(allSessions));
    renderSessionList();
  }

  appendMessage('user', displayText);
  messageInput.value = '';
  syncInputState();
  voiceFinalTranscript = '';
  activeVoiceTranscript = '';

  if (voiceOnly) setVoiceStatus('Thinking...');
  const streamMsg = createStreamingAssistantMessage();

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, thread_id: currentThreadId })
    });

    if (!response.ok) {
      streamMsg.remove();
      appendMessage('error', `Server error: ${response.statusText}`);
      if (voiceOnly) stopVoiceConversation(`Server error: ${response.statusText}`);
      return;
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("text/event-stream") || response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // Keep partial line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const dataStr = trimmed.slice(6).trim();
            if (!dataStr) continue;

            try {
              const eventData = JSON.parse(dataStr);
              if (eventData.type === "token" && eventData.content) {
                streamMsg.appendToken(eventData.content);
              } else if (eventData.type === "reasoning" && eventData.content) {
                streamMsg.appendReasoning(eventData.content);
              } else if (eventData.type === "tool_start") {
                streamMsg.setTool(eventData.tool || "Tool");
              } else if (eventData.type === "tool_end") {
                streamMsg.clearTool();
              }
            } catch (_) {
              streamMsg.appendToken(dataStr);
            }
          }
        }
      }

      if (buffer.trim().startsWith("data: ")) {
        try {
          const eventData = JSON.parse(buffer.trim().slice(6).trim());
          if (eventData.type === "token" && eventData.content) {
            streamMsg.appendToken(eventData.content);
          } else if (eventData.type === "reasoning" && eventData.content) {
            streamMsg.appendReasoning(eventData.content);
          }
        } catch (_) {}
      }

      streamMsg.finalize();
      const finalResponseText = streamMsg.getText();

      if (voiceOnly) {
        speakAssistantResponse(finalResponseText);
      }
    } else {
      const data = await response.json();
      const answer = data.response || "No response text found.";
      streamMsg.finalize(answer);
      if (voiceOnly) {
        speakAssistantResponse(answer);
      }
    }

  } catch (err) {
    streamMsg.remove();
    appendMessage('error', 'Network error. Could not connect to the API.');
    if (voiceOnly) stopVoiceConversation('Network error. Could not connect to the API.');
    console.error(err);
  }
}
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g,
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag])
  );
}

function renderMarkdownSafely(text) {
  if (!window.marked) return escapeHTML(text).replace(/\n/g, '<br>');
  const mathStash = [];
  function stashMath(str) {
    const id = `\x00MATH${mathStash.length}\x00`;
    mathStash.push(str);
    return id;
  }
  let t = text;
  t = t.replace(/\\\[[\s\S]*?\\\]/g, m => stashMath(m));
  t = t.replace(/\\\([\s\S]*?\\\)/g, m => stashMath(m));
  t = t.replace(/\$\$[\s\S]*?\$\$/g, m => stashMath(m));
  t = t.replace(/(^|[^\\])\$([^\$\n]+?)\$/g, (match, prefix, math) => {
    return prefix + stashMath('$' + math + '$');
  });
  marked.setOptions({ breaks: true, gfm: true });
  t = marked.parse(t);
  t = t.replace(/\x00MATH(\d+)\x00/g, (_, idx) => mathStash[+idx]);
  return t;
}

function appendMessage(role, text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;
  const bubbleWrapper = document.createElement('div');
  bubbleWrapper.className = 'bubble-wrapper';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = renderMarkdownSafely(text);
  bubbleWrapper.appendChild(bubble);

  if (role === 'assistant' && !msgDiv.classList.contains('loading-message')) {
    const actionRow = document.createElement('div');
    actionRow.className = 'action-buttons';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action-btn';
    copyBtn.innerHTML = `<i data-lucide="copy"></i> Copy`;
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(text);
      copyBtn.innerHTML = `<i data-lucide="check"></i> Copied!`;
      if (window.lucide) lucide.createIcons({ root: copyBtn });
      setTimeout(() => {
        copyBtn.innerHTML = `<i data-lucide="copy"></i> Copy`;
        if (window.lucide) lucide.createIcons({ root: copyBtn });
      }, 2000);
    };

    const pdfBtn = document.createElement('button');
    pdfBtn.className = 'msg-action-btn';
    pdfBtn.innerHTML = `<i data-lucide="download"></i> PDF`;
    pdfBtn.onclick = () => exportToPDF(text);

    actionRow.appendChild(copyBtn);
    actionRow.appendChild(pdfBtn);
    bubbleWrapper.appendChild(actionRow);
  }

  msgDiv.appendChild(bubbleWrapper);
  chatContainer.appendChild(msgDiv);

  if (role === 'assistant' && window.renderMathInElement) {
    renderMathInElement(bubble, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false }
      ],
      throwOnError: false
    });
  }

  if (window.lucide) lucide.createIcons({ root: msgDiv });
  requestAnimationFrame(() => { msgDiv.classList.add('show'); });
  scrollToBottom();
}

function appendLoading(id) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message assistant loading-message';
  msgDiv.id = id;
  const bubbleWrapper = document.createElement('div');
  bubbleWrapper.className = 'bubble-wrapper';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
  bubbleWrapper.appendChild(bubble);
  msgDiv.appendChild(bubbleWrapper);
  chatContainer.appendChild(msgDiv);
  requestAnimationFrame(() => { msgDiv.classList.add('show'); });
  scrollToBottom();
}

function removeLoading(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function exportToPDF(rawText) {
  if (!window.jspdf) {
    alert("PDF generator is still loading. Try again in a moment.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Nexus AI Export", 10, 20);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(150);
  doc.text(`Session ID: ${currentThreadId}`, 10, 28);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 10, 33);
  doc.setTextColor(0);
  doc.setFontSize(11);
  const cleanText = rawText
    .replace(/\*/g, '').replace(/_/g, '').replace(/`/g, '')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-').replace(/[\u2026]/g, '...')
    .replace(/[^\x00-\x7F]/g, '');
  const splitText = doc.splitTextToSize(cleanText, 180);
  doc.text(splitText, 10, 50);
  doc.save(`Nexus_Export_${Date.now()}.pdf`);
}

window.addEventListener('DOMContentLoaded', init);
