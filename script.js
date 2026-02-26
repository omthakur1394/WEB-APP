const API_BASE = 'https://falling-forest-1f86.omthakur1394.workers.dev';

let messageCount  = 0;
let isLoading     = false;
let progressEl    = null;
let currentThread = 1;
let stopRequested = false;
let activeStreamIv = null;

const messagesEl  = document.getElementById('messages');
const inputEl     = document.getElementById('userInput');
const sendBtn     = document.getElementById('sendBtn');
const stopBtn     = document.getElementById('stopBtn');
const threadInput = document.getElementById('threadId');
const msgCountEl  = document.getElementById('msgCount');
const sessionIdEl = document.getElementById('sessionId');

threadInput.addEventListener('input', () => {
  currentThread = parseInt(threadInput.value) || currentThread;
  sessionIdEl.textContent = threadInput.value || currentThread;
});

document.getElementById('newThreadBtn').addEventListener('click', () => {
  currentThread++;
  threadInput.value = currentThread;
  sessionIdEl.textContent = currentThread;
  threadInput.style.transition = 'background 0.3s';
  threadInput.style.background = 'rgba(99,179,237,0.2)';
  setTimeout(() => { threadInput.style.background = ''; }, 500);
  messagesEl.innerHTML = '';
  messageCount = 0;
  msgCountEl.textContent = 0;
  const welcome = document.createElement('div');
  welcome.className = 'welcome'; welcome.id = 'welcomeScreen';
  welcome.innerHTML = buildWelcomeHTML(`New thread <span style="color:var(--accent);font-weight:700">#${currentThread}</span> started. Memory is fresh — ask anything.`);
  messagesEl.appendChild(welcome);
  inputEl.focus();
});

function buildWelcomeHTML(subtitle) {
  return `
    <svg class="hexagon" viewBox="0 0 80 80" fill="none">
      <polygon points="40,4 72,22 72,58 40,76 8,58 8,22" stroke="url(#g1)" stroke-width="2" fill="rgba(99,179,237,0.04)"/>
      <polygon points="40,14 62,26 62,54 40,66 18,54 18,26" stroke="url(#g2)" stroke-width="1.5" fill="rgba(104,211,145,0.03)" stroke-dasharray="4 2"/>
      <circle cx="40" cy="40" r="10" fill="url(#g3)" opacity="0.9"/>
      <circle cx="40" cy="40" r="16" stroke="url(#g1)" stroke-width="1" fill="none" opacity="0.4"/>
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#63b3ed"/><stop offset="100%" stop-color="#68d391"/></linearGradient>
        <linearGradient id="g2" x1="80" y1="0" x2="0" y2="80" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#68d391"/><stop offset="100%" stop-color="#b794f4"/></linearGradient>
        <radialGradient id="g3"><stop offset="0%" stop-color="#63b3ed"/><stop offset="100%" stop-color="#4299e1"/></radialGradient>
      </defs>
    </svg>
    <h1>Your AI Research<br>Command Center</h1>
    <p>${subtitle}</p>
    <div class="suggestion-grid">
      <div class="suggestion" onclick="sendSuggestion(this)"><strong>📄 Research</strong>Latest breakthroughs in quantum computing from Arxiv</div>
      <div class="suggestion" onclick="sendSuggestion(this)"><strong>🌐 Web Search</strong>What are the newest LLM models released in 2025?</div>
      <div class="suggestion" onclick="sendSuggestion(this)"><strong>📚 Wikipedia</strong>Explain transformer architecture and attention mechanisms</div>
      <div class="suggestion" onclick="sendSuggestion(this)"><strong>🔬 Multi-Tool</strong>Overview of CRISPR gene editing current state</div>
    </div>`;
}

function autoResize(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,200)+'px'; }
function handleKeyDown(e) { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} }
function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
  // Double-tap after paint to ensure it works during streaming
  requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
}
function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }

function sendSuggestion(el) {
  const lines = el.innerText.trim().split('\n').map(l=>l.trim()).filter(Boolean);
  inputEl.value = lines.slice(1).join(' ') || lines[0];
  autoResize(inputEl); sendMessage();
}

function hideWelcome() {
  const w = document.getElementById('welcomeScreen');
  if (!w) return;
  w.style.transition='opacity 0.3s,transform 0.3s'; w.style.opacity='0'; w.style.transform='scale(0.96)';
  setTimeout(()=>w.remove(),300);
}

function setStopVisible(v) {
  stopBtn.classList.toggle('visible', v);
  sendBtn.style.display = v ? 'none' : '';
}

function stopStreaming() {
  stopRequested = true;
  if (activeStreamIv) { clearInterval(activeStreamIv); activeStreamIv = null; }
  setStopVisible(false);
  document.querySelectorAll('.stream-cursor').forEach(el=>el.remove());
  const allMsgs = messagesEl.querySelectorAll('.message.assistant');
  if (allMsgs.length) addMessageActions(allMsgs[allMsgs.length-1]);
  isLoading = false;
  sendBtn.disabled = false;
  inputEl.focus();
}

/* ── IMPROVED MARKDOWN PARSER ── */
function cleanRawText(raw) {
  // Remove stray standalone asterisks and backslashes used as decorators
  let t = raw;
  // Remove lines that are purely asterisks/dashes used as dividers
  t = t.replace(/^[\*\-]{1,3}\s*$/gm, '');
  // Remove leading/trailing lone asterisks not part of bold/italic syntax
  t = t.replace(/(^|\s)\*(\s|$)/gm, '$1$2');
  // Fix escaped forward slashes: \/ → /
  t = t.replace(/\\\//g, '/');
  // Fix other common escape artifacts
  t = t.replace(/\\([^\\ntr*_`#\[\](){}|])/g, '$1');
  return t;
}

function renderMarkdown(raw) {
  let t = cleanRawText(raw);

  // ── STEP 1: Stash math ──
  const mathStash = [];
  function stashMath(str) {
    const id = `\x00MATH${mathStash.length}\x00`;
    mathStash.push(str);
    return id;
  }
  t = t.replace(/\\\[[\s\S]*?\\\]/g, m => stashMath(m));
  t = t.replace(/\\\([\s\S]*?\\\)/g, m => stashMath(m));
  t = t.replace(/\$\$[\s\S]*?\$\$/g, m => stashMath(m));
  t = t.replace(/\$([^\$\n]+)\$/g, m => stashMath(m));

  // ── STEP 2: Escape HTML ──
  t = t.replace(/&(?!amp;|lt;|gt;|quot;)/g,'&amp;');

  // Fenced code blocks
  t = t.replace(/```(\w*)\n?([\s\S]*?)```/g, (_,lang,code)=>{
    const escaped = code.replace(/&amp;/g,'&').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<pre><code class="lang-${lang}">${escaped.trimEnd()}</code></pre>`;
  });

  // Inline code
  t = t.replace(/`([^`\n]+)`/g, (_,c)=>`<code>${c.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code>`);

  // Headings
  t = t.replace(/^#{4}\s+(.+)$/gm, '<h4>$1</h4>');
  t = t.replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>');
  t = t.replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>');
  t = t.replace(/^#{1}\s+(.+)$/gm, '<h1>$1</h1>');

  // HR
  t = t.replace(/^-{3,}$/gm, '<hr>');

  // Bold & italic
  t = t.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
  t = t.replace(/__(.+?)__/g, '<strong>$1</strong>');
  t = t.replace(/_(.+?)_/g, '<em>$1</em>');

  // Tables
  t = t.replace(/((?:^\|.+\|\n?)+)/gm, tableBlock => {
    const rows = tableBlock.trim().split('\n').filter(r=>r.trim());
    if (rows.length < 2) return tableBlock;
    const isSep = r => /^\|[-:| ]+\|$/.test(r.trim());
    let html = '<table>';
    let inBody = false;
    rows.forEach((row, i) => {
      if (isSep(row)) { inBody = true; return; }
      const cells = row.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
      const tag = (!inBody && i===0) ? 'th' : 'td';
      html += '<tr>' + cells.map(c=>`<${tag}>${c}</${tag}>`).join('') + '</tr>';
    });
    html += '</table>';
    return html;
  });

  // Blockquote
  t = t.replace(/^>\s?(.+)/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  t = t.replace(/((?:^[-*+]\s.+\n?)+)/gm, block => {
    const items = block.trim().split('\n').map(l=>l.replace(/^[-*+]\s/,'').trim());
    return '<ul>' + items.map(i=>`<li>${i}</li>`).join('') + '</ul>';
  });

  // Ordered lists
  t = t.replace(/((?:^\d+\.\s.+\n?)+)/gm, block => {
    const items = block.trim().split('\n').map(l=>l.replace(/^\d+\.\s/,'').trim());
    return '<ol>' + items.map(i=>`<li>${i}</li>`).join('') + '</ol>';
  });

  // Paragraphs
  t = t.split('\n\n').map(block => {
    block = block.trim();
    if (!block) return '';
    if (/^<(h[1-4]|ul|ol|pre|table|blockquote|hr)/.test(block)) return block;
    return '<p>' + block.replace(/\n/g,'<br>') + '</p>';
  }).join('\n');

  // ── STEP 3: Restore math ──
  t = t.replace(/\x00MATH(\d+)\x00/g, (_, idx) => mathStash[+idx]);

  return t;
}

function renderMath(el) {
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(el, {
      delimiters: [
        { left: '$$',   right: '$$',   display: true  },
        { left: '\\[',  right: '\\]',  display: true  },
        { left: '$',    right: '$',    display: false },
        { left: '\\(',  right: '\\)',  display: false },
      ],
      throwOnError: false,
      output: 'html',
    });
  }
}

/* ── PDF EXPORT ── */
function exportToPDF(msgEl) {
  const contentEl = msgEl.querySelector('.bubble-content');
  if (!contentEl) return;
  const htmlContent = contentEl.innerHTML;
  const text = contentEl.innerText;

  // Use print-based PDF generation
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>NEXUS AI Response</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; font-size: 14px; line-height: 1.75; color: #1a1a2e; padding: 48px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; padding-bottom: 16px; border-bottom: 2px solid #63b3ed; }
    .header-logo { font-size: 20px; font-weight: 800; letter-spacing: 0.15em; color: #63b3ed; }
    .header-meta { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #718096; }
    h1,h2,h3,h4 { font-weight: 700; margin: 20px 0 8px; }
    h1 { font-size: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    h2 { font-size: 17px; color: #2b6cb0; }
    h3 { font-size: 15px; color: #276749; }
    h4 { font-size: 14px; color: #744210; }
    p  { margin: 8px 0; }
    strong { font-weight: 700; }
    em { font-style: italic; color: #4a5568; }
    ul,ol { padding-left: 22px; margin: 8px 0; }
    li { margin: 3px 0; }
    code { font-family: 'JetBrains Mono', monospace; font-size: 12px; background: #ebf4ff; padding: 2px 6px; border-radius: 4px; color: #2b6cb0; }
    pre { background: #1a202c; color: #a0c4ff; border-radius: 8px; padding: 14px 16px; margin: 10px 0; overflow-x: auto; }
    pre code { background: transparent; padding: 0; color: #a0c4ff; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
    th { background: #ebf4ff; color: #2b6cb0; padding: 8px 12px; text-align: left; border: 1px solid #bee3f8; font-weight: 600; }
    td { padding: 7px 12px; border: 1px solid #e2e8f0; }
    tr:nth-child(even) td { background: #f7fafc; }
    blockquote { border-left: 3px solid #63b3ed; padding: 8px 14px; margin: 10px 0; background: #ebf4ff; border-radius: 0 6px 6px 0; color: #4a5568; font-style: italic; }
    hr { border: none; border-top: 1px solid #e2e8f0; margin: 14px 0; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #a0aec0; text-align: center; }
    @media print { body { padding: 24px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-logo">NEXUS</div>
    <div class="header-meta">AI Research Assistant &nbsp;·&nbsp; Exported ${new Date().toLocaleString()}</div>
  </div>
  <div class="content">${htmlContent}</div>
  <div class="footer">Generated by NEXUS AI · Powered by Groq + LangGraph</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`);
  printWindow.document.close();

  showToast('PDF export opened — use Print → Save as PDF');
}

function showToast(msg) {
  let toast = document.getElementById('pdfToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'pdfToast';
    toast.className = 'pdf-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ── ADD MESSAGE ACTIONS (copy + pdf) ── */
function addMessageActions(msgEl) {
  if (msgEl.querySelector('.msg-actions')) return;
  const bubble = msgEl.querySelector('.bubble');
  if (!bubble) return;
  const actions = document.createElement('div');
  actions.className = 'msg-actions';
  actions.innerHTML = `
    <button class="action-btn copy-btn" title="Copy message">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>COPY
    </button>
    <button class="action-btn pdf-btn" title="Export as PDF">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        <line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="11" x2="15" y2="11"/>
      </svg>PDF
    </button>`;
  bubble.appendChild(actions);

  // Copy handler
  actions.querySelector('.copy-btn').addEventListener('click', () => {
    const contentEl = msgEl.querySelector('.bubble-content');
    const text = contentEl ? contentEl.innerText : '';
    navigator.clipboard.writeText(text).then(() => {
      const btn = actions.querySelector('.copy-btn');
      btn.classList.add('copied');
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>COPIED`;
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>COPY`;
      }, 2000);
    });
  });

  // PDF handler
  actions.querySelector('.pdf-btn').addEventListener('click', () => exportToPDF(msgEl));
}

/* ── TOOL DETECTION ── */
function detectTools(query) {
  const q = query.toLowerCase();
  const tools = [];
  const arxivKw  = ['arxiv','paper','preprint','research','study','published','journal','abstract','algorithm','neural','deep learning','machine learning','llm','transformer','diffusion','model','training','findings'];
  const wikiKw   = ['wikipedia','who is','what is','explain','define','history','biography','overview','concept','theory','law of','invention','country','capital','meaning','definition'];
  const tavilyKw = ['latest','current','today','news','2024','2025','recent','now','trending','update','release','new','just announced','search','find','web','online','price','stock'];
  if (arxivKw.some(k=>q.includes(k)))  tools.push('arxiv');
  if (wikiKw.some(k=>q.includes(k)))   tools.push('wiki');
  if (tavilyKw.some(k=>q.includes(k))) tools.push('tavily');
  if (tools.length === 0) tools.push('tavily');
  return [...new Set(tools)].slice(0,3);
}

const TOOL_META = {
  arxiv:  { icon:'📄', label:'ArXiv',     queries:['Scanning paper index…','Fetching abstracts…','Parsing citations…'] },
  wiki:   { icon:'📚', label:'Wikipedia', queries:['Searching articles…','Reading entry…','Extracting sections…'] },
  tavily: { icon:'🌐', label:'Tavily',    queries:['Querying web…','Ranking results…','Extracting content…'] },
};

function createProgressBlock(tools) {
  hideWelcome();
  const wrap = document.createElement('div');
  wrap.className = 'tool-progress'; wrap.id = 'toolProgress';
  const stepsHtml = tools.map(t => {
    const m = TOOL_META[t];
    return `<div class="tp-step waiting ${t}" id="step-${t}">
      <div class="step-icon-wrap ${t}">${m.icon}</div>
      <div class="step-info">
        <div class="step-name ${t}">${m.label}</div>
        <div class="step-sub" id="step-sub-${t}">Queued…</div>
        <div class="step-bar-wrap"><div class="step-bar" id="step-bar-${t}"></div></div>
      </div>
      <div class="step-status wait-s" id="step-status-${t}">queued</div>
    </div>`;
  }).join('');
  wrap.innerHTML = `<div class="tool-progress-inner">
    <div class="tp-header"><div class="tp-spinner"></div>AGENT · TOOL CALLS IN PROGRESS</div>
    <div class="tp-steps">${stepsHtml}</div>
    <div class="query-ticker"><span class="query-ticker-label">▶ STATUS</span><span id="queryTickerText">Initialising agent…</span></div>
  </div>`;
  messagesEl.appendChild(wrap);
  scrollToBottom();
  progressEl = wrap;
}

function removeProgressBlock() {
  if (!progressEl) return;
  progressEl.style.transition='opacity 0.35s,transform 0.35s';
  progressEl.style.opacity='0'; progressEl.style.transform='translateY(-4px) scale(0.98)';
  const el=progressEl; setTimeout(()=>el.remove(),350); progressEl=null;
}

function animateStep(toolKey, durationMs) {
  return new Promise(resolve => {
    const stepEl=document.getElementById(`step-${toolKey}`);
    const subEl=document.getElementById(`step-sub-${toolKey}`);
    const barEl=document.getElementById(`step-bar-${toolKey}`);
    const statusEl=document.getElementById(`step-status-${toolKey}`);
    const tickerEl=document.getElementById('queryTickerText');
    if (!stepEl){resolve();return;}
    const meta=TOOL_META[toolKey];
    setActive(toolKey,true);
    stepEl.className=`tp-step active ${toolKey}`;
    statusEl.textContent='calling'; statusEl.className='step-status calling';
    let qi=0;
    const subInterval=setInterval(()=>{
      const msg=meta.queries[qi%meta.queries.length];
      subEl.textContent=msg;
      if(tickerEl)tickerEl.textContent=`[${meta.label}] ${msg}`;
      qi++;
    },Math.floor(durationMs/meta.queries.length));
    const totalTicks=60; let tick=0;
    const barInterval=setInterval(()=>{
      tick++;
      barEl.style.width=Math.min((tick/totalTicks)*95,95)+'%';
      scrollToBottom();
      if(tick>=totalTicks)clearInterval(barInterval);
    },durationMs/totalTicks);
    setTimeout(()=>{
      clearInterval(subInterval); clearInterval(barInterval);
      barEl.style.width='100%'; subEl.textContent='Completed ✓';
      statusEl.textContent='done'; statusEl.className='step-status done-s';
      stepEl.className=`tp-step done ${toolKey}`;
      setActive(toolKey,false); scrollToBottom(); resolve();
    },durationMs);
  });
}

async function runToolAnimations(tools,totalMs) {
  const perTool=Math.floor(totalMs/tools.length);
  for(const t of tools){await animateStep(t,perTool);await sleep(100);}
}

function setActive(key,on){
  const chip=document.getElementById(`chip-${key}`);
  const card=document.getElementById(`card-${key}`);
  if(chip)chip.classList.toggle('active',on);
  if(card)card.classList.toggle('active',on);
}

/* ── APPEND MESSAGE ── */
function appendMessage(role, content, isError=false) {
  hideWelcome();
  const msg = document.createElement('div');
  msg.className = `message ${role}`;
  const avatarHtml = role==='user'
    ? `<div class="avatar user-av">YOU</div>`
    : `<div class="avatar ai-av"><svg width="20" height="20" viewBox="0 0 80 80" fill="none"><polygon points="40,4 72,22 72,58 40,76 8,58 8,22" stroke="#63b3ed" stroke-width="2" fill="none"/><circle cx="40" cy="40" r="8" fill="#63b3ed" opacity="0.9"/></svg></div>`;
  const rendered = (role==='user')
    ? content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')
    : renderMarkdown(content);
  msg.innerHTML = `${avatarHtml}
    <div class="bubble ${isError?'error-bubble':''}">
      <div class="bubble-label">${role==='user'?'You':'Nexus AI'}</div>
      <div class="bubble-content">${rendered}</div>
    </div>`;
  if (role === 'assistant') { addMessageActions(msg); renderMath(msg); }
  messagesEl.appendChild(msg);
  scrollToBottom();
  return msg;
}

/* ── TYPEWRITER STREAM ── */
function streamInText(rawText) {
  return new Promise(resolve => {
    hideWelcome();
    stopRequested = false;
    setStopVisible(true);

    const msg = document.createElement('div');
    msg.className = 'message assistant';
    msg.innerHTML = `
      <div class="avatar ai-av"><svg width="20" height="20" viewBox="0 0 80 80" fill="none"><polygon points="40,4 72,22 72,58 40,76 8,58 8,22" stroke="#63b3ed" stroke-width="2" fill="none"/><circle cx="40" cy="40" r="8" fill="#63b3ed" opacity="0.9"/></svg></div>
      <div class="bubble"><div class="bubble-label">Nexus AI</div><div class="bubble-content" id="streamContent"></div></div>`;
    messagesEl.appendChild(msg);
    scrollToBottom();

    const contentEl = document.getElementById('streamContent');
    const chars = rawText.split('');
    let i = 0;
    const chunkSize = rawText.length > 800 ? 5 : 1;
    const speed = Math.max(8, Math.min(25, Math.floor(2500 / (chars.length / chunkSize))));
    let accumulated = '';

    activeStreamIv = setInterval(() => {
      if (stopRequested) {
        clearInterval(activeStreamIv); activeStreamIv = null;
        contentEl.innerHTML = renderMarkdown(accumulated);
        renderMath(contentEl);
        setStopVisible(false);
        addMessageActions(msg);
        resolve(); return;
      }
      const end = Math.min(i + chunkSize, chars.length);
      accumulated += chars.slice(i, end).join('');
      i = end;
      contentEl.innerHTML = renderMarkdown(accumulated) + '<span class="stream-cursor"></span>';
      scrollToBottom();
      if (i >= chars.length) {
        clearInterval(activeStreamIv); activeStreamIv = null;
        contentEl.innerHTML = renderMarkdown(accumulated);
        renderMath(contentEl);
        setStopVisible(false);
        addMessageActions(msg);
        resolve();
      }
    }, speed);
  });
}

/* ── MAIN SEND ── */
async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || isLoading) return;

  const threadId = String(currentThread);
  isLoading = true;
  sendBtn.disabled = true;
  inputEl.value = '';
  inputEl.style.height = 'auto';

  appendMessage('user', text);
  messageCount++;
  msgCountEl.textContent = messageCount;

  const tools = detectTools(text);
  createProgressBlock(tools);

  const fetchPromise = fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, thread_id: threadId })
  });

  const animMs = Math.min(7000, Math.max(2400, tools.length * 1300));
  const [, res] = await Promise.all([
    runToolAnimations(tools, animMs),
    fetchPromise
  ]);

  await sleep(450);
  removeProgressBlock();
  await sleep(320);

  if (!res.ok) {
    const err = await res.text();
    appendMessage('assistant', `Error ${res.status}: ${err}`, true);
  } else {
    const data = await res.json();
    await streamInText(data.response || 'No response received.');
    messageCount++;
    msgCountEl.textContent = messageCount;
  }

  isLoading = false;
  sendBtn.disabled = false;
  setStopVisible(false);
  inputEl.focus();
}

window.addEventListener('load', () => setTimeout(() => inputEl.focus(), 800));