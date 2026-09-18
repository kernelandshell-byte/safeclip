const els = {
  lockBtn: document.getElementById("lockBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  unlockHeaderBtn: document.getElementById("unlockHeaderBtn"),

  viewSetup: document.getElementById("view-setup"),
  setupPass1: document.getElementById("setupPass1"),
  setupPass2: document.getElementById("setupPass2"),
  setupAllowRecent: document.getElementById("setupAllowRecent"),
  setupError: document.getElementById("setupError"),
  setupBtn: document.getElementById("setupBtn"),

  viewUnlock: document.getElementById("view-unlock"),
  unlockPass: document.getElementById("unlockPass"),
  unlockError: document.getElementById("unlockError"),
  unlockBtn: document.getElementById("unlockBtn"),

  viewMain: document.getElementById("view-main"),
  search: document.getElementById("search"),
  list: document.getElementById("list"),
  empty: document.getElementById("empty"),
  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  importFile: document.getElementById("importFile"),

  folderPicker: document.getElementById("folderPicker"),
  folderChips: document.getElementById("folderChips"),
  newFolderInput: document.getElementById("newFolderInput"),
  folderCancelBtn: document.getElementById("folderCancelBtn"),
  folderSaveBtn: document.getElementById("folderSaveBtn"),

  autoLockBar: document.getElementById("autoLockBar"),
  autoLockCountdown: document.getElementById("autoLockCountdown"),
  extendBtn: document.getElementById("extendBtn"),

  settingsPanel: document.getElementById("settingsPanel"),
  autoLockSelect: document.getElementById("autoLockSelect"),
  allowRecentToggle: document.getElementById("allowRecentToggle"),
  settingsCloseBtn: document.getElementById("settingsCloseBtn"),
  changePassphraseBtn: document.getElementById("changePassphraseBtn"),

  rotatePanel: document.getElementById("rotatePanel"),
  rotateOld: document.getElementById("rotateOld"),
  rotateNew: document.getElementById("rotateNew"),
  rotateConfirm: document.getElementById("rotateConfirm"),
  rotateError: document.getElementById("rotateError"),
  rotateCancelBtn: document.getElementById("rotateCancelBtn"),
  rotateSaveBtn: document.getElementById("rotateSaveBtn"),

  importConfirmPanel: document.getElementById("importConfirmPanel"),
  importConfirmPass: document.getElementById("importConfirmPass"),
  importConfirmError: document.getElementById("importConfirmError"),
  importConfirmCancelBtn: document.getElementById("importConfirmCancelBtn"),
  importConfirmBtn: document.getElementById("importConfirmBtn"),
};

let allItems = [];
let activeTab = "recent";
let currentState = null;
let allowRecentWithoutPassphrase = false;
let expandedFolders = new Set();
let pendingStarId = null;
let pendingImportBackup = null;
let pendingAction = null;
let countdownInterval = null;

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function showView(name) {
  els.viewSetup.classList.toggle("hidden", name !== "setup");
  els.viewUnlock.classList.toggle("hidden", name !== "unlock");
  els.viewMain.classList.toggle("hidden", name !== "main");
}

function updateHeaderControls() {
  const ready = currentState === "ready";
  els.lockBtn.classList.toggle("hidden", !ready);
  els.settingsBtn.classList.toggle("hidden", !ready);
  els.unlockHeaderBtn.classList.toggle("hidden", currentState !== "ready-partial");
  if (!ready) {
    els.autoLockBar.classList.add("hidden");
    stopCountdown();
  }
}

function requireUnlock(action) {
  pendingAction = action;
  showView("unlock");
  els.unlockError.classList.add("hidden");
  els.unlockPass.value = "";
  els.unlockPass.focus();
}

function resolvePendingAction() {
  const action = pendingAction;
  pendingAction = null;
  if (!action) return;
  if (action.type === "star") {
    openFolderPicker(action.itemId);
  } else if (action.type === "view-saved") {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === "saved"));
    activeTab = "saved";
    applyFilter();
  }
}

async function init() {
  const status = await send({ type: "GET_STATUS" });
  currentState = status.state;
  allowRecentWithoutPassphrase = !!status.allowRecentWithoutPassphrase;

  if (status.state === "needs-setup") {
    showView("setup");
    els.setupPass1.focus();
    return;
  }

  if (status.state === "needs-unlock") {
    showView("unlock");
    if (status.lockedUntil) {
      showLockoutMessage(status.lockedUntil);
    } else {
      els.unlockError.classList.add("hidden");
    }
    els.unlockPass.focus();
    return;
  }

  // "ready" or "ready-partial"
  showView("main");
  updateHeaderControls();
  if (status.state === "ready" && status.lockAt) {
    startCountdown(status.lockAt);
  }
  loadHistory();
  if (status.state === "ready") {
    resolvePendingAction();
  }
}

// ---- Password visibility toggles ----

document.querySelectorAll(".eye-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.target);
    const willShow = input.type === "password";
    input.type = willShow ? "text" : "password";
    btn.querySelector(".icon-eye").classList.toggle("hidden", willShow);
    btn.querySelector(".icon-eye-off").classList.toggle("hidden", !willShow);
    btn.setAttribute("aria-label", willShow ? "Hide passphrase" : "Show passphrase");
  });
});

// ---- Setup (passphrase is now required) ----

els.setupBtn.addEventListener("click", async () => {
  const p1 = els.setupPass1.value;
  const p2 = els.setupPass2.value;
  els.setupError.classList.add("hidden");

  if (p1.length < 8) {
    els.setupError.textContent = "Use at least 8 characters.";
    els.setupError.classList.remove("hidden");
    return;
  }
  if (p1 !== p2) {
    els.setupError.textContent = "Passphrases don't match.";
    els.setupError.classList.remove("hidden");
    return;
  }

  await send({
    type: "SETUP_PASSPHRASE",
    passphrase: p1,
    allowRecentWithoutPassphrase: els.setupAllowRecent.checked,
  });
  init();
});

// ---- Unlock ----

function showLockoutMessage(lockedUntil) {
  const seconds = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000));
  els.unlockError.textContent = `Too many attempts. Try again in ${seconds}s.`;
  els.unlockError.classList.remove("hidden");
}

els.unlockBtn.addEventListener("click", attemptUnlock);
els.unlockPass.addEventListener("keydown", (e) => {
  if (e.key === "Enter") attemptUnlock();
});

async function attemptUnlock() {
  const pass = els.unlockPass.value;
  els.unlockError.classList.add("hidden");
  const res = await send({ type: "UNLOCK", passphrase: pass });
  if (res?.ok) {
    init();
  } else if (res?.lockedUntil) {
    els.unlockPass.value = "";
    showLockoutMessage(res.lockedUntil);
  } else {
    els.unlockError.textContent = "That passphrase didn't work.";
    els.unlockError.classList.remove("hidden");
    els.unlockPass.value = "";
    els.unlockPass.focus();
  }
}

els.unlockHeaderBtn.addEventListener("click", () => requireUnlock(null));

// ---- Lock ----

els.lockBtn.addEventListener("click", async () => {
  await send({ type: "LOCK_NOW" });
  init();
});

// ---- Extend session ----

els.extendBtn.addEventListener("click", async () => {
  await send({ type: "EXTEND_SESSION" });
  const status = await send({ type: "GET_STATUS" });
  if (status.lockAt) startCountdown(status.lockAt);
});

// ---- Settings ----

els.settingsBtn.addEventListener("click", async () => {
  const settings = await send({ type: "GET_SETTINGS" });
  els.autoLockSelect.value = String(settings.autoLockMinutes || 0);
  els.allowRecentToggle.checked = allowRecentWithoutPassphrase;
  els.settingsPanel.classList.remove("hidden");
});

els.settingsCloseBtn.addEventListener("click", async () => {
  const minutes = parseInt(els.autoLockSelect.value, 10) || 0;
  await send({ type: "SET_AUTO_LOCK_MINUTES", minutes });

  const newAllow = els.allowRecentToggle.checked;
  if (newAllow !== allowRecentWithoutPassphrase) {
    const res = await send({ type: "SET_ALLOW_RECENT_WITHOUT_PASSPHRASE", value: newAllow });
    if (!res?.ok) alert("Couldn't update that setting. Try unlocking first.");
  }

  els.settingsPanel.classList.add("hidden");
  init();
});

// ---- Change passphrase ----

els.changePassphraseBtn.addEventListener("click", () => {
  els.settingsPanel.classList.add("hidden");
  els.rotateOld.value = "";
  els.rotateNew.value = "";
  els.rotateConfirm.value = "";
  els.rotateError.classList.add("hidden");
  els.rotatePanel.classList.remove("hidden");
  els.rotateOld.focus();
});

els.rotateCancelBtn.addEventListener("click", () => {
  els.rotatePanel.classList.add("hidden");
});

els.rotateSaveBtn.addEventListener("click", attemptRotate);
els.rotateConfirm.addEventListener("keydown", (e) => {
  if (e.key === "Enter") attemptRotate();
});

async function attemptRotate() {
  const oldPass = els.rotateOld.value;
  const newPass = els.rotateNew.value;
  const confirmPass = els.rotateConfirm.value;
  els.rotateError.classList.add("hidden");

  if (newPass.length < 8) {
    els.rotateError.textContent = "New passphrase needs to be at least 8 characters.";
    els.rotateError.classList.remove("hidden");
    return;
  }
  if (newPass !== confirmPass) {
    els.rotateError.textContent = "New passphrases don't match.";
    els.rotateError.classList.remove("hidden");
    return;
  }

  const res = await send({
    type: "ROTATE_PASSPHRASE",
    oldPassphrase: oldPass,
    newPassphrase: newPass,
  });

  if (res?.ok) {
    els.rotatePanel.classList.add("hidden");
    init();
  } else if (res?.lockedUntil) {
    const seconds = Math.max(1, Math.ceil((res.lockedUntil - Date.now()) / 1000));
    els.rotateError.textContent = `Too many attempts. Try again in ${seconds}s.`;
    els.rotateError.classList.remove("hidden");
    els.rotateOld.value = "";
  } else if (res?.reason === "wrong-passphrase") {
    els.rotateError.textContent = "Current passphrase didn't match.";
    els.rotateError.classList.remove("hidden");
    els.rotateOld.value = "";
    els.rotateOld.focus();
  } else {
    els.rotateError.textContent = "Couldn't update your passphrase. Try again.";
    els.rotateError.classList.remove("hidden");
  }
}

// ---- Tabs ----

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    if (tab === "saved" && currentState !== "ready") {
      requireUnlock({ type: "view-saved" });
      return;
    }
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeTab = tab;
    applyFilter();
  });
});

// ---- Auto-lock countdown ----

function stopCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = null;
}

function updateCountdownText(lockAt) {
  const msLeft = lockAt - Date.now();
  if (msLeft <= 0) {
    stopCountdown();
    send({ type: "LOCK_NOW" }).then(init);
    return;
  }
  const totalSeconds = Math.ceil(msLeft / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  els.autoLockCountdown.textContent = `Auto-locks in ${m}:${String(s).padStart(2, "0")}`;
}

function startCountdown(lockAt) {
  stopCountdown();
  els.autoLockBar.classList.remove("hidden");
  updateCountdownText(lockAt);
  countdownInterval = setInterval(() => updateCountdownText(lockAt), 1000);
}

// ---- History rendering ----

function timeAgo(ts) {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function buildItemRow(item) {
  const li = document.createElement("li");
  li.title = "Click to copy back to clipboard";

  const textEl = document.createElement("div");
  textEl.className = "text";
  textEl.textContent = item.text.length > 220 ? item.text.slice(0, 220) + "…" : item.text;

  const timeEl = document.createElement("span");
  timeEl.className = "time";
  timeEl.textContent = timeAgo(item.ts);

  const starBtn = document.createElement("button");
  starBtn.className = "star";
  starBtn.type = "button";
  starBtn.textContent = item.starred ? "★" : "☆";
  starBtn.title = item.starred ? "Unstar" : "Star to keep this permanently";
  starBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!item.starred) {
      if (currentState !== "ready") {
        requireUnlock({ type: "star", itemId: item.id });
        return;
      }
      openFolderPicker(item.id);
    } else {
      send({ type: "SET_ITEM_META", id: item.id, starred: false, folder: item.folder }).then(loadHistory);
    }
  });

  const delBtn = document.createElement("button");
  delBtn.className = "del";
  delBtn.type = "button";
  delBtn.textContent = "Delete";
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    send({ type: "DELETE_ITEM", id: item.id }).then(loadHistory);
  });

  const actionsEl = document.createElement("span");
  actionsEl.className = "actions";
  actionsEl.append(starBtn, delBtn);

  const metaEl = document.createElement("div");
  metaEl.className = "meta";
  metaEl.append(timeEl, actionsEl);

  li.append(textEl, metaEl);

  li.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(item.text);
      li.classList.add("copied");
      setTimeout(() => li.classList.remove("copied"), 450);
    } catch (e) {
      // popup lost focus before the write landed, nothing to do
    }
  });

  return li;
}

function setEmpty(isEmpty, message) {
  els.empty.classList.toggle("hidden", !isEmpty);
  els.empty.textContent = message;
}

function renderRecent(items) {
  els.list.innerHTML = "";
  const q = els.search.value.trim();
  setEmpty(
    items.length === 0,
    q
      ? "No matches."
      : "Nothing copied yet. Select text on any page and copy it, it'll show up here."
  );
  for (const item of items) els.list.appendChild(buildItemRow(item));
}

function svgEl(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function buildFolderIcon() {
  const svg = svgEl("svg", {
    viewBox: "0 0 24 24", width: "15", height: "15", fill: "none", stroke: "currentColor",
    "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", class: "folder-icon",
  });
  svg.appendChild(svgEl("path", { d: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" }));
  return svg;
}

function buildChevronIcon() {
  const svg = svgEl("svg", {
    viewBox: "0 0 24 24", width: "14", height: "14", fill: "none", stroke: "currentColor",
    "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", class: "folder-chevron",
  });
  svg.appendChild(svgEl("path", { d: "M9 6l6 6-6 6" }));
  return svg;
}

function renderSaved(items) {
  els.list.innerHTML = "";
  const q = els.search.value.trim();
  setEmpty(
    items.length === 0,
    q ? "No matches." : "Nothing saved yet. Star something in Recent to keep it here."
  );

  const groups = new Map();
  for (const item of items) {
    const folder = item.folder || "General";
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder).push(item);
  }

  const searching = q.length > 0;
  const folderNames = [...groups.keys()].sort((a, b) => a.localeCompare(b));

  for (const folder of folderNames) {
    const folderItems = groups.get(folder);
    const isExpanded = searching || expandedFolders.has(folder);

    const row = document.createElement("div");
    row.className = "folder-row" + (isExpanded ? " expanded" : "");

    const nameEl = document.createElement("span");
    nameEl.className = "folder-name";
    nameEl.textContent = folder;

    const countEl = document.createElement("span");
    countEl.className = "folder-count";
    countEl.textContent = String(folderItems.length);

    row.append(buildFolderIcon(), nameEl, countEl, buildChevronIcon());
    row.addEventListener("click", () => {
      if (expandedFolders.has(folder)) expandedFolders.delete(folder);
      else expandedFolders.add(folder);
      applyFilter();
    });
    els.list.appendChild(row);

    if (isExpanded) {
      const container = document.createElement("div");
      container.className = "folder-items";
      for (const item of folderItems) container.appendChild(buildItemRow(item));
      els.list.appendChild(container);
    }
  }
}

function applyFilter() {
  const q = els.search.value.trim().toLowerCase();
  let items = activeTab === "recent" ? allItems.filter((i) => !i.starred) : allItems.filter((i) => i.starred);
  if (q) items = items.filter((i) => i.text.toLowerCase().includes(q));
  items = items.slice().sort((a, b) => b.ts - a.ts);
  if (activeTab === "recent") renderRecent(items);
  else renderSaved(items);
}

async function loadHistory() {
  const res = await send({ type: "DECRYPT_ALL" });
  allItems = res?.history || [];
  applyFilter();
}

els.search.addEventListener("input", applyFilter);

// ---- Folder picker (replaces the native window.prompt) ----

function openFolderPicker(itemId) {
  pendingStarId = itemId;

  const folders = [...new Set(allItems.filter((i) => i.starred && i.folder).map((i) => i.folder))].sort(
    (a, b) => a.localeCompare(b)
  );

  els.folderChips.innerHTML = "";
  for (const folder of folders) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = folder;
    chip.addEventListener("click", () => confirmFolder(folder));
    els.folderChips.appendChild(chip);
  }

  els.newFolderInput.value = "";
  els.folderPicker.classList.remove("hidden");
  els.newFolderInput.focus();
}

function closeFolderPicker() {
  els.folderPicker.classList.add("hidden");
  pendingStarId = null;
}

async function confirmFolder(folderName) {
  const name = (folderName ?? els.newFolderInput.value).trim();
  if (!name || !pendingStarId) return;
  await send({ type: "SET_ITEM_META", id: pendingStarId, starred: true, folder: name });
  expandedFolders.add(name);
  closeFolderPicker();
  loadHistory();
}

els.folderCancelBtn.addEventListener("click", closeFolderPicker);
els.folderSaveBtn.addEventListener("click", () => confirmFolder());
els.newFolderInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmFolder();
});

// ---- Export / import ----

els.exportBtn.addEventListener("click", async () => {
  if (allowRecentWithoutPassphrase) {
    const proceed = confirm(
      "Since Recent doesn't require your passphrase, this backup file includes what's needed to read your Recent scratchpad without it too. Saved items stay protected by your real passphrase regardless.\n\nExport anyway?"
    );
    if (!proceed) return;
  }

  const res = await send({ type: "EXPORT_BACKUP" });
  if (!res?.ok) return;

  const blob = new Blob([JSON.stringify(res.backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `safeclip-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
});

els.importBtn.addEventListener("click", () => els.importFile.click());

els.importFile.addEventListener("change", async () => {
  const file = els.importFile.files[0];
  if (!file) return;

  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch (e) {
    alert("That doesn't look like a valid SafeClip backup file.");
    els.importFile.value = "";
    return;
  }

  if (parsed?.format !== "safeclip-backup") {
    alert("That doesn't look like a valid SafeClip backup file.");
    els.importFile.value = "";
    return;
  }

  const proceed = confirm(
    "This replaces your current vault with the one in this backup file. This can't be undone. Continue?"
  );
  els.importFile.value = "";
  if (!proceed) return;

  pendingImportBackup = parsed;

  if (currentState !== "needs-setup") {
    els.importConfirmError.classList.add("hidden");
    els.importConfirmPass.value = "";
    els.importConfirmPanel.classList.remove("hidden");
    els.importConfirmPass.focus();
  } else {
    runImport(null);
  }
});

async function runImport(currentPassphrase) {
  const res = await send({
    type: "IMPORT_BACKUP",
    backup: pendingImportBackup,
    currentPassphrase,
  });

  if (res?.ok) {
    pendingImportBackup = null;
    els.importConfirmPanel.classList.add("hidden");
    init();
    return;
  }

  if (res?.reason === "wrong-passphrase") {
    els.importConfirmError.textContent = res.lockedUntil
      ? `Too many attempts. Try again in ${Math.max(1, Math.ceil((res.lockedUntil - Date.now()) / 1000))}s.`
      : "That passphrase didn't work.";
    els.importConfirmError.classList.remove("hidden");
    els.importConfirmPass.value = "";
    els.importConfirmPass.focus();
    return;
  }

  alert("Import failed. The file may be corrupted.");
  pendingImportBackup = null;
  els.importConfirmPanel.classList.add("hidden");
}

els.importConfirmCancelBtn.addEventListener("click", () => {
  pendingImportBackup = null;
  els.importConfirmPanel.classList.add("hidden");
});

els.importConfirmBtn.addEventListener("click", () => runImport(els.importConfirmPass.value));
els.importConfirmPass.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runImport(els.importConfirmPass.value);
});

init();
