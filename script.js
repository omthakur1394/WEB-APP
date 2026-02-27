const API_URL = "https://falling-forest-1f86.omthakur1394.workers.dev/chat";

// Ensure jsPDF loads for exports
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

let currentThreadId = '';

function init() {
  startNewSession();
  messageInput.focus();
}

function generateDynamicId() {
  return 'sess_' + Math.random().toString(36).substring(2, 10);
}

function startNewSession() {
  currentThreadId = generateDynamicId();
  if (threadDisplay) threadDisplay.textContent = currentThreadId;

  // Render premium welcome view
  chatContainer.innerHTML = `
        <div class="welcome-view">
            <div class="welcome-icon">
                <i data-lucide="bot"></i>
            </div>
            <h1>How can I assist you?</h1>
            <p>I am connected to your secure API and ready to help.</p>
        </div>
    `;
  // Re-init lucide icons for newly injected HTML
  if (window.lucide) lucide.createIcons();
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

  // Protect Math blocks from Marked parser
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
  // Single $ math (only if not escaped)
  t = t.replace(/(^|[^\\])\$([^\$\n]+?)\$/g, (match, prefix, math) => {
    return prefix + stashMath('$' + math + '$');
  });

  // Use marked.js for standard GH flavored markdown
  marked.setOptions({ breaks: true, gfm: true });
  t = marked.parse(t);

  // Restore math blocks directly back into HTML
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

  // Render KaTeX Math after attaching to DOM
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

  requestAnimationFrame(() => {
    msgDiv.classList.add('show');
  });

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
  bubble.innerHTML = `
        <div class="typing-indicator">
            <span></span><span></span><span></span>
        </div>
    `;

  bubbleWrapper.appendChild(bubble);
  msgDiv.appendChild(bubbleWrapper);
  chatContainer.appendChild(msgDiv);

  requestAnimationFrame(() => {
    msgDiv.classList.add('show');
  });
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

  // Fix PDF character spacing and missing text issues by replacing formatting 
  // unicode characters (smart quotes, em-dashes) with ASCII equivalents, and stripping
  // other non-ASCII characters that break jsPDF's built-in Helvetica font rendering.
  const cleanText = rawText
    .replace(/\*/g, '')
    .replace(/_/g, '')
    .replace(/`/g, '')
    .replace(/[\u2018\u2019]/g, "'") // Smart single quotes
    .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
    .replace(/[\u2013\u2014]/g, '-') // En and Em dashes
    .replace(/[\u2026]/g, '...')     // Ellipsis
    .replace(/[^\x00-\x7F]/g, '');   // Fallback: strip remaining non-ASCII characters

  const splitText = doc.splitTextToSize(cleanText, 180);
  doc.text(splitText, 10, 50);

  doc.save(`Nexus_Export_${Date.now()}.pdf`);
}

window.addEventListener('DOMContentLoaded', init);