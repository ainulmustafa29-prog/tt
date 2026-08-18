/* ========================================
   TempMal.com — Mail.tm API Layer
   ======================================== */

const API_BASE = "https://api.mail.tm";
const SESSION_KEY = "tempmal_session";
const THEME_KEY = "tempmal_theme";

/* ---------- DOM refs ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const dom = {
  themeToggle: $("#themeToggle"),
  currentEmail: $("#currentEmail"),
  copyEmailBtn: $("#copyEmailBtn"),
  deleteEmailBtn: $("#deleteEmailBtn"),
  editEmailBtn: $("#editEmailBtn"),
  refreshEmailBtn: $("#refreshEmailBtn"),
  newEmailBtn: $("#newEmailBtn"),
  mailboxStatus: $("#mailboxStatus"),
  unreadCount: $("#unreadCount"),
  inboxCount: $("#inboxCount"),
  lastRefreshTime: $("#lastRefreshTime"),
  inboxRefreshBtn: $("#inboxRefreshBtn"),
  inboxNewEmailBtn: $("#inboxNewEmailBtn"),
  emptyInbox: $("#emptyInbox"),
  messageList: $("#messageList"),
  emptyInboxRefreshBtn: $("#emptyInboxRefreshBtn"),
  confirmDialog: $("#confirmDialog"),
  confirmCancelBtn: $("#confirmCancelBtn"),
  confirmOkBtn: $("#confirmOkBtn"),
  toastContainer: $("#toastContainer"),
  readerOverlay: $("#readerOverlay"),
  readerBackBtn: $("#readerBackBtn"),
  readerFrom: $("#readerFrom"),
  readerTo: $("#readerTo"),
  readerSubject: $("#readerSubject"),
  readerDate: $("#readerDate"),
  readerContent: $("#readerContent"),
  readerAttachments: $("#readerAttachments"),
  attachmentList: $("#attachmentList"),
};

/* ---------- State ---------- */
const state = {
  currentEmail: null,
  accountId: null,
  token: null,
  messages: [],
  selectedMessage: null,
  unreadCount: 0,
  loading: false,
  error: null,
  connectionStatus: "connecting",
  theme: "light",
  listenerActive: false,
  listenerType: null,
  pollTimer: null,
  eventSource: null,
  lastRefresh: null,
};

/* ========================================
   Utilities
   ======================================== */
function randomUsername(length = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function randomPassword(length = 16) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function sanitizeHtml(html) {
  if (!html) return "";
  let s = String(html);
  s = s.replace(/<!--[\s\S]*?-->/gi, "");
  s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, "");
  s = s.replace(/<\/?(script|iframe|embed|object|form|input|button|textarea|select|link|base|meta|title|style|noscript|template|slot|math|svg|path|img|audio|video|source|track|frame|frameset|applet)\b[^>]*>/gi, "");
  s = s.replace(/\s(on\w+)\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "");
  s = s.replace(/(href|src)\s*=\s*(".*?javascript:.*?"|'.*?javascript:.*?'|[^\s>]*javascript:[^\s>]*)/gi, "$1=\"\"");
  s = s.replace(/(href|src)\s*=\s*(".*?data:text\/html.*?"|'.*?data:text\/html.*?'|[^\s>]*data:text\/html[^\s>]*)/gi, "$1=\"\"");
  s = s.replace(/\s+on\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#039;/g, "'");
  s = escapeHtml(s);
  const paragraphs = s.split(/\n\s*\n/).map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");
  return paragraphs || escapeHtml(s);
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  dom.toastContainer.appendChild(toast);
  const remove = () => {
    toast.classList.add("toast-out");
    toast.addEventListener("animationend", () => toast.remove());
  };
  setTimeout(remove, 3000);
}

/* ========================================
   Mail.tm API
   ======================================== */
async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = data["hydra:description"] || data.detail || data.message || "";
    } catch (_) {}

    if (res.status === 400) throw new Error("Invalid request. Please try again.");
    if (res.status === 401) throw new Error("Your temporary mailbox session is no longer valid.");
    if (res.status === 404) throw new Error("The requested mailbox or email could not be found.");
    if (res.status === 422) throw new Error("This email address could not be created. Please try again.");
    if (res.status === 429) throw new Error("Too many requests. Please wait a moment and try again.");
    throw new Error(detail || "Temporary email service is currently unavailable. Please try again later.");
  }

  if (res.status === 204) return null;
  return res.json();
}

async function getDomains() {
  let page = 1;
  const all = [];
  while (true) {
    const data = await api(`/domains?page=${page}`);
    const members = data["hydra:member"] || [];
    all.push(...members);
    if (!data["hydra:next"]) break;
    page += 1;
  }
  return all.filter((d) => d.isActive);
}

async function createAccount(address, password) {
  return api("/accounts", {
    method: "POST",
    body: JSON.stringify({ address, password }),
  });
}

async function getToken(address, password) {
  return api("/token", {
    method: "POST",
    body: JSON.stringify({ address, password }),
  });
}

async function getCurrentAccount(token) {
  const authToken = token || state.token;
  if (!authToken) throw new Error("No token");
  return api("/me", {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

async function getMessages(page = 1) {
  if (!state.token) throw new Error("No token");
  const data = await api(`/messages?page=${page}&order=desc`, {
    headers: { Authorization: `Bearer ${state.token}` },
  });
  return {
    messages: data["hydra:member"] || [],
    totalItems: data["hydra:totalItems"] || 0,
  };
}

async function getMessage(id) {
  if (!state.token) throw new Error("No token");
  return api(`/messages/${id}`, {
    headers: { Authorization: `Bearer ${state.token}` },
  });
}

async function markMessageAsRead(id) {
  if (!state.token) throw new Error("No token");
  return api(`/messages/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${state.token}` },
    body: JSON.stringify({ seen: true }),
  });
}

async function deleteAccount() {
  if (!state.token || !state.accountId) throw new Error("No account");
  return api(`/accounts/${state.accountId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${state.token}` },
  });
}

/* ========================================
   Session Management
   ======================================== */
function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (_) {}
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (_) {}
}

/* ========================================
   Mailbox lifecycle
   ======================================== */
async function createNewMailbox() {
  setLoading(true);
  setStatus("connecting");
  stopRealtimeListener();

  try {
    const domains = await getDomains();
    if (!domains.length) throw new Error("No active domains available.");

    const domain = domains[0].domain;
    const username = randomUsername(10);
    const password = randomPassword(16);
    const address = `${username}@${domain}`;

    const account = await createAccount(address, password);
    const tokenData = await getToken(address, password);
    const me = await getCurrentAccount(tokenData.token);

    const session = {
      accountId: me.id || account.id,
      address: me.address || address,
      token: tokenData.token,
    };

    state.accountId = session.accountId;
    state.currentEmail = session.address;
    state.token = session.token;
    state.messages = [];
    state.selectedMessage = null;
    state.unreadCount = 0;
    state.error = null;
    state.lastRefresh = null;

    saveSession(session);
    updateEmailUI();
    setStatus("active");
    await loadInbox();
    startRealtimeListener();
    showToast("New email created", "success");
  } catch (err) {
    console.error(err);
    setStatus("error");
    showToast(err.message || "Unable to create email", "error");
  } finally {
    setLoading(false);
  }
}

async function restoreSession() {
  setLoading(true);
  setStatus("connecting");

  try {
    const session = loadSession();
    if (!session || !session.token || !session.address) {
      throw new Error("NO_SESSION");
    }

    state.token = session.token;
    state.currentEmail = session.address;
    state.accountId = session.accountId;

    const me = await getCurrentAccount();
    state.accountId = me.id || session.accountId;
    state.currentEmail = me.address || session.address;
    state.error = null;
    setStatus("active");
    updateEmailUI();
    await loadInbox();
    startRealtimeListener();
  } catch (err) {
    console.error(err);
    clearSession();
    state.token = null;
    state.currentEmail = null;
    state.accountId = null;
    state.messages = [];
    state.selectedMessage = null;
    state.unreadCount = 0;
    setStatus("offline");
    updateEmailUI();
    renderInbox();
    showToast("Session expired. Creating a new mailbox.", "error");
    await createNewMailbox();
  } finally {
    setLoading(false);
  }
}

async function loadInbox() {
  if (!state.token) return;
  setLoading(true);
  try {
    const { messages, totalItems } = await getMessages(1);
    state.messages = messages;
    state.unreadCount = messages.filter((m) => !m.seen).length;
    state.lastRefresh = new Date();
    renderInbox();
    dom.lastRefreshTime.textContent = `Refreshed ${formatDate(state.lastRefresh.toISOString())}`;
  } catch (err) {
    console.error(err);
    showToast("Unable to load inbox", "error");
  } finally {
    setLoading(false);
  }
}

/* ========================================
   Real-time updates
   ======================================== */
function startRealtimeListener() {
  stopRealtimeListener();
  if (!state.token) return;

  if ("EventSource" in window) {
    try {
      const url = `${API_BASE}/events?token=${encodeURIComponent(state.token)}`;
      const es = new EventSource(url);
      state.eventSource = es;
      state.listenerType = "sse";
      state.listenerActive = true;

      es.addEventListener("message", () => {
        if (!state.loading) {
          loadInbox().then(() => {
            if (state.selectedMessage) {
              // keep reader open
            }
          });
          showToast("New email received", "success");
        }
      });

      es.onerror = () => {
        es.close();
        state.listenerActive = false;
        state.eventSource = null;
        startPolling();
      };

      return;
    } catch (_) {}
  }

  startPolling();
}

function startPolling() {
  stopPolling();
  state.listenerType = "poll";
  state.listenerActive = true;
  state.pollTimer = setInterval(async () => {
    if (state.loading || document.hidden) return;
    try {
      await loadInbox();
    } catch (_) {}
  }, 20000);
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function stopRealtimeListener() {
  if (state.eventSource) {
    try { state.eventSource.close(); } catch (_) {}
    state.eventSource = null;
  }
  stopPolling();
  state.listenerActive = false;
  state.listenerType = null;
}

/* Pause/resume on visibility */
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (state.listenerType === "poll") {
      stopPolling();
    }
  } else {
    if (state.listenerType === "poll" && state.listenerActive) {
      startPolling();
    }
    if (state.token && !state.loading) {
      loadInbox().catch(() => {});
    }
  }
});

/* ========================================
   UI Helpers
   ======================================== */
function setLoading(isLoading) {
  state.loading = isLoading;
  const buttons = [
    dom.refreshEmailBtn,
    dom.newEmailBtn,
    dom.inboxRefreshBtn,
    dom.inboxNewEmailBtn,
    dom.copyEmailBtn,
    dom.deleteEmailBtn,
    dom.editEmailBtn,
  ];
  buttons.forEach((btn) => {
    if (btn) btn.disabled = isLoading;
  });
}

function setStatus(status) {
  state.connectionStatus = status;
  dom.mailboxStatus.className = "meta-value";
  const dot = dom.mailboxStatus.querySelector(".mailbox-status-dot");
  if (dot) {
    dot.className = "mailbox-status-dot";
  }

  if (status === "connecting") {
    dom.mailboxStatus.textContent = "Connecting...";
    if (dot) dot.classList.add("connecting");
  } else if (status === "active") {
    dom.mailboxStatus.textContent = "Active";
    if (dot) dot.classList.add("active");
  } else if (status === "offline") {
    dom.mailboxStatus.textContent = "Offline";
  } else if (status === "error") {
    dom.mailboxStatus.textContent = "Error";
    if (dot) dot.classList.add("error");
  }
}

function updateEmailUI() {
  dom.currentEmail.textContent = state.currentEmail || "—";
  dom.refreshEmailBtn.disabled = !state.token || state.loading;
  dom.newEmailBtn.disabled = !state.token || state.loading;
  dom.inboxRefreshBtn.disabled = !state.token || state.loading;
  dom.inboxNewEmailBtn.disabled = !state.token || state.loading;
  dom.copyEmailBtn.disabled = !state.currentEmail || state.loading;
  dom.deleteEmailBtn.disabled = !state.token || state.loading;
  dom.editEmailBtn.disabled = !state.token || state.loading;
}

/* ========================================
   Inbox rendering
   ======================================== */
function renderInbox() {
  dom.inboxCount.textContent = `${state.messages.length} message${state.messages.length === 1 ? "" : "s"}`;
  dom.unreadCount.textContent = String(state.unreadCount);

  if (!state.messages.length) {
    dom.emptyInbox.hidden = false;
    dom.messageList.innerHTML = "";
    dom.messageList.hidden = true;
    return;
  }

  dom.emptyInbox.hidden = true;
  dom.messageList.hidden = false;

  dom.messageList.innerHTML = state.messages
    .map((m) => {
      const senderName = m.from?.name || m.from?.address || "Unknown";
      const senderEmail = m.from?.address || "";
      const subject = m.subject || "(No subject)";
      const preview = m.intro || "";
      const date = formatDate(m.createdAt);
      const isUnread = !m.seen;
      const hasAttachments = (m.attachments && m.attachments.length) ? true : false;

      return `
        <tr class="${isUnread ? "message-unread" : ""}" data-id="${m.id}" tabindex="0" aria-label="Message from ${escapeHtml(senderName)}: ${escapeHtml(subject)}">
          <td>${escapeHtml(senderName)}<br><span style="color:var(--text-muted);font-size:0.8rem;font-weight:normal">${escapeHtml(senderEmail)}</span></td>
          <td>${escapeHtml(subject)}${preview ? `<br><span style="color:var(--text-muted);font-size:0.8rem;font-weight:normal">${escapeHtml(preview)}</span>` : ""}</td>
          <td>${escapeHtml(date)}</td>
          <td style="text-align:right">
            ${hasAttachments ? `<span style="font-size:0.75rem;color:var(--primary);font-weight:600">Attachment</span>` : ""}
          </td>
        </tr>
      `;
    })
    .join("");

  $$("#messageList tr").forEach((el) => {
    const handler = () => openMessage(el.dataset.id);
    el.addEventListener("click", handler);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handler();
      }
    });
  });
}

/* ========================================
   Message Reader
   ======================================== */
async function openMessage(id) {
  if (!state.token) return;
  setLoading(true);
  try {
    const msg = await getMessage(id);
    state.selectedMessage = msg;

    dom.readerFrom.textContent = [msg.from?.name, msg.from?.address].filter(Boolean).join(" <") + (msg.from?.address ? ">" : "");
    const toList = Array.isArray(msg.to) ? msg.to : msg.to ? [msg.to] : [];
    dom.readerTo.textContent = toList.map((t) => [t.name, t.address].filter(Boolean).join(" <") + (t.address ? ">" : "")).join(", ") || "—";
    dom.readerSubject.textContent = msg.subject || "(No subject)";
    dom.readerDate.textContent = formatDate(msg.createdAt);

    let html = msg.html && msg.html.length ? msg.html[0] : null;
    let text = msg.text || "";

    if (html) {
      const safe = sanitizeHtml(html);
      dom.readerContent.innerHTML = safe;
    } else {
      dom.readerContent.textContent = text;
    }

    if (msg.attachments && msg.attachments.length) {
      dom.readerAttachments.hidden = false;
      dom.attachmentList.innerHTML = msg.attachments
        .map((a) => {
          const size = formatSize(a.size);
          const mime = a.contentType || "";
          const href = a.downloadUrl || a.contentUrl || "#";
          const isExternal = href === "#";
          return `
            <li class="attachment-item">
              <div class="attachment-info">
                <span class="attachment-name">${escapeHtml(a.filename || "attachment")}</span>
                <span class="attachment-meta">${escapeHtml(mime)}${size ? " · " + escapeHtml(size) : ""}</span>
              </div>
              ${isExternal ? `<span class="btn-secondary" style="opacity:0.6;cursor:not-allowed;padding:0.35rem 0.75rem;font-size:0.8rem;border-radius:var(--radius)">Unavailable</span>` : `<a class="btn-secondary" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" download style="padding:0.35rem 0.75rem;font-size:0.8rem;border-radius:var(--radius);display:inline-flex;align-items:center;text-decoration:none">Download</a>`}
            </li>
          `;
        })
        .join("");
    } else {
      dom.readerAttachments.hidden = true;
      dom.attachmentList.innerHTML = "";
    }

    dom.readerOverlay.hidden = false;

    if (!msg.seen) {
      try {
        await markMessageAsRead(id);
        msg.seen = true;
        const found = state.messages.find((m) => m.id === id);
        if (found) found.seen = true;
        state.unreadCount = state.messages.filter((m) => !m.seen).length;
        renderInbox();
      } catch (_) {}
    }
  } catch (err) {
    console.error(err);
    showToast(err.message || "Unable to open email", "error");
  } finally {
    setLoading(false);
  }
}

function closeReader() {
  dom.readerOverlay.hidden = true;
  state.selectedMessage = null;
}

/* ========================================
   Copy
   ======================================== */
async function copyEmail() {
  if (!state.currentEmail) return;
  try {
    await navigator.clipboard.writeText(state.currentEmail);
    showToast("Email copied!", "success");
    const label = dom.copyEmailBtn.querySelector(".btn-copy-label");
    const original = label.textContent;
    label.textContent = "Copied!";
    setTimeout(() => {
      label.textContent = original;
    }, 1800);
  } catch (_) {
    showToast("Please copy the email address manually.", "error");
  }
}

/* ========================================
   New Email flow
   ======================================== */
function askNewEmail() {
  dom.confirmDialog.hidden = false;
}

function cancelNewEmail() {
  dom.confirmDialog.hidden = true;
}

async function confirmNewEmail() {
  dom.confirmDialog.hidden = true;
  setLoading(true);
  try {
    stopRealtimeListener();
    state.messages = [];
    state.selectedMessage = null;
    state.unreadCount = 0;
    state.lastRefresh = null;
    renderInbox();
    closeReader();

    if (state.token && state.accountId) {
      try {
        await deleteAccount();
      } catch (_) {}
    }

    clearSession();
    state.token = null;
    state.currentEmail = null;
    state.accountId = null;

    await createNewMailbox();
  } catch (err) {
    console.error(err);
    showToast(err.message || "Unable to create new email", "error");
  } finally {
    setLoading(false);
  }
}

/* ========================================
   Theme
   ======================================== */
function initTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) {
      state.theme = saved;
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      state.theme = "dark";
    }
  } catch (_) {}
  applyTheme();
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  const light = dom.themeToggle.querySelector(".theme-icon-light");
  const dark = dom.themeToggle.querySelector(".theme-icon-dark");
  if (light && dark) {
    light.style.display = state.theme === "dark" ? "none" : "inline";
    dark.style.display = state.theme === "dark" ? "inline" : "none";
  }
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem(THEME_KEY, state.theme); } catch (_) {}
  applyTheme();
}

/* ========================================
   FAQ accordion
   ======================================== */
function initFaq() {
  $$(".faq-question").forEach((btn) => {
    btn.addEventListener("click", () => {
      const expanded = btn.getAttribute("aria-expanded") === "true";
      const answer = document.getElementById(btn.getAttribute("aria-controls"));
      if (!answer) return;
      btn.setAttribute("aria-expanded", String(!expanded));
      if (expanded) {
        answer.hidden = true;
      } else {
        answer.hidden = false;
      }
    });
  });
}

/* ========================================
   Event Bindings
   ======================================== */
function bindEvents() {
  dom.themeToggle.addEventListener("click", toggleTheme);
  const mobileNavToggle = $("#mobileNavToggle");
  const sideCol = document.querySelector(".side-col");
  if (mobileNavToggle && sideCol) {
    mobileNavToggle.addEventListener("click", () => {
      const expanded = mobileNavToggle.getAttribute("aria-expanded") === "true";
      mobileNavToggle.setAttribute("aria-expanded", String(!expanded));
      sideCol.classList.toggle("mobile-open", !expanded);
    });
  }
  dom.copyEmailBtn.addEventListener("click", copyEmail);
  dom.refreshEmailBtn.addEventListener("click", () => loadInbox());
  dom.newEmailBtn.addEventListener("click", askNewEmail);
  dom.inboxRefreshBtn.addEventListener("click", () => loadInbox());
  dom.inboxNewEmailBtn.addEventListener("click", askNewEmail);
  dom.emptyInboxRefreshBtn.addEventListener("click", () => loadInbox());
  dom.readerBackBtn.addEventListener("click", closeReader);
  dom.confirmCancelBtn.addEventListener("click", cancelNewEmail);
  dom.confirmOkBtn.addEventListener("click", confirmNewEmail);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !dom.confirmDialog.hidden) {
      cancelNewEmail();
    }
    if (e.key === "Escape" && !dom.readerOverlay.hidden) {
      closeReader();
    }
  });

  dom.confirmDialog.addEventListener("click", (e) => {
    if (e.target === dom.confirmDialog) cancelNewEmail();
  });

  dom.readerOverlay.addEventListener("click", (e) => {
    if (e.target === dom.readerOverlay) closeReader();
  });
}

/* ========================================
   Init
   ======================================== */
function init() {
  initTheme();
  initFaq();
  bindEvents();
  updateEmailUI();
  renderInbox();
  restoreSession();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
