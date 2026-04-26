const API_URL = "https://falling-forest-1f86.omthakur1394.workers.dev/chat";
const BASE_URL = "https://falling-forest-1f86.omthakur1394.workers.dev";

if (!document.getElementById('jspdf-script')) {
  const s = document.createElement('script');
  s.id = 'jspdf-script';
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  document.head.appendChild(s);
}

const chatContainer = document.getElementById('chat-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const mobileNewChat = document.getElementById('mobile-new-chat');
const threadDisplay = document.getElementById('thread-id-display');
const chatHistoryList = document.getElementById('chat-history-list');

let currentThreadId = '';
let allSessions = [];

function init() {
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
    item.innerHTML = `<i data-lucide="message-square"></i> Session ${allSessions.length - index}`;
    item.title = sessionId;
    item.onclick = () => switchSession(sessionId);
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

[newChatBtn, mobileNewChat].forEach(btn => {
  if (btn) btn.addEventListener('click', () => {
    startNewSession();
    messageInput.focus();
  });
});

messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
  sendBtn.disabled = messageInput.value.trim() === '';
});

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener('click', sendMessage);

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  const welcomeView = document.querySelector('.welcome-view');
  if (welcomeView) welcomeView.remove();

  if (!allSessions.includes(currentThreadId)) {
    allSessions.unshift(currentThreadId);
    localStorage.setItem("all_sessions", JSON.stringify(allSessions));
    renderSessionList();
  }

  appendMessage('user', text);
  messageInput.value = '';
  messageInput.style.height = 'auto';
  sendBtn.disabled = true;

  const loadingId = 'loading-' + Date.now();
  appendLoading(loadingId);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, thread_id: currentThreadId })
    });

    removeLoading(loadingId);

    if (!response.ok) {
      appendMessage('error', `Server error: ${response.statusText}`);
      return;
    }

    const data = await response.json();
    appendMessage('assistant', data.response || "No response text found.");

  } catch (err) {
    removeLoading(loadingId);
    appendMessage('error', 'Network error. Could not connect to the API.');
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