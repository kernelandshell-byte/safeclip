// All encryption, key management, and storage lives here, in the
// background service worker. The popup never touches raw storage or
// keys directly. It only ever talks to this file via messages.
//
// Two independent encryption keys exist:
//  - The PASSPHRASE key (derived from what you type in, never stored).
//    Saved items are ALWAYS under this key, no matter what. Starring
//    something requires having this key available (i.e. being unlocked).
//  - The RECENT key (a random key stored locally, no passphrase needed).
//    Only ever used for unstarred Recent items, and only if the person
//    has explicitly turned that convenience on. Never used for Saved.

const RECENT_LIMIT = 30;
const SAVED_LIMIT = 300;
const PBKDF2_ITERATIONS = 300000;
const VERIFY_PLAINTEXT = "safeclip-verify-v1";
const VERIFY_AAD = "safeclip-verifier";
const AUTO_LOCK_ALARM = "safeclip-auto-lock";
const DEFAULT_AUTO_LOCK_MINUTES = 15;

const MAX_ATTEMPTS_BEFORE_LOCKOUT = 5;
const BASE_LOCKOUT_MS = 30 * 1000;
const MAX_LOCKOUT_MS = 5 * 60 * 1000;

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}

// ---------- Config / settings / unlock-attempt state ----------

async function getConfig() {
  const { config } = await chrome.storage.local.get("config");
  return config || null;
}

async function saveConfig(config) {
  await chrome.storage.local.set({ config });
}

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return settings || { autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

async function getUnlockState() {
  const { unlockState } = await chrome.storage.local.get("unlockState");
  return unlockState || { failedAttempts: 0, lockoutUntil: null };
}

async function saveUnlockState(state) {
  await chrome.storage.local.set({ unlockState: state });
}

// ---------- Key derivation & crypto primitives ----------

async function deriveKeyFromPassphrase(passphrase, saltB64) {
  const salt = new Uint8Array(base64ToBuf(saltB64));
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

async function encryptWithKey(key, text, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const params = { name: "AES-GCM", iv };
  if (aad) params.additionalData = new TextEncoder().encode(aad);
  const cipherBuf = await crypto.subtle.encrypt(params, key, encoded);
  return { iv: bufToBase64(iv), data: bufToBase64(cipherBuf) };
}

async function decryptWithKey(key, entry, aad) {
  const iv = new Uint8Array(base64ToBuf(entry.iv));
  const data = base64ToBuf(entry.data);
  const params = { name: "AES-GCM", iv };
  if (aad) params.additionalData = new TextEncoder().encode(aad);
  const plainBuf = await crypto.subtle.decrypt(params, key, data);
  return new TextDecoder().decode(plainBuf);
}

async function decryptEnvelope(entry, key) {
  return JSON.parse(await decryptWithKey(key, entry, entry.id));
}

async function decryptWithAnyKey(entry, keys) {
  for (const key of keys) {
    if (!key) continue;
    try {
      return await decryptEnvelope(entry, key);
    } catch (e) {
      // try the next key
    }
  }
  return null;
}

// ---------- Session key cache (memory-only, wiped when Chrome fully closes) ----------

async function cacheSessionKey(key) {
  const jwk = await crypto.subtle.exportKey("jwk", key);
  await chrome.storage.session.set({ activeKeyJwk: jwk });
}

async function getCachedSessionKey() {
  const { activeKeyJwk } = await chrome.storage.session.get("activeKeyJwk");
  if (!activeKeyJwk) return null;
  return crypto.subtle.importKey("jwk", activeKeyJwk, { name: "AES-GCM" }, true, [
    "encrypt",
    "decrypt",
  ]);
}

// ---------- The Recent-tier key (only used if explicitly allowed) ----------

async function getOrCreateRecentKey() {
  const { recentKeyJwk } = await chrome.storage.local.get("recentKeyJwk");
  if (recentKeyJwk) {
    return crypto.subtle.importKey("jwk", recentKeyJwk, { name: "AES-GCM" }, true, [
      "encrypt",
      "decrypt",
    ]);
  }
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const jwk = await crypto.subtle.exportKey("jwk", key);
  await chrome.storage.local.set({ recentKeyJwk: jwk });
  return key;
}

async function activeKeysFor(config) {
  const passKey = await getCachedSessionKey();
  const recentKey = config.allowRecentWithoutPassphrase ? await getOrCreateRecentKey() : null;
  return { passKey, recentKey };
}

// ---------- Auto-lock ----------

async function scheduleAutoLock() {
  await chrome.alarms.clear(AUTO_LOCK_ALARM);
  const { autoLockMinutes } = await getSettings();
  if (!autoLockMinutes) {
    await chrome.storage.session.remove("lockAt");
    return;
  }
  chrome.alarms.create(AUTO_LOCK_ALARM, { delayInMinutes: autoLockMinutes });
  await chrome.storage.session.set({ lockAt: Date.now() + autoLockMinutes * 60000 });
}

async function clearAutoLock() {
  await chrome.alarms.clear(AUTO_LOCK_ALARM);
  await chrome.storage.session.remove("lockAt");
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_LOCK_ALARM) lockNow();
});

// ---------- Passphrase verify / throttle (shared by unlock AND rotation) ----------

async function verifyPassphrase(passphrase, config) {
  const key = await deriveKeyFromPassphrase(passphrase, config.saltB64);
  try {
    const plain = await decryptWithKey(
      key,
      { iv: config.verifyIv, data: config.verifyData },
      VERIFY_AAD
    );
    return plain === VERIFY_PLAINTEXT ? key : null;
  } catch (e) {
    return null;
  }
}

// Shared by unlockWithPassphrase() and rotatePassphrase(), since both are ways
// to guess a passphrase, so both have to hit the same throttle, or one
// becomes a bypass of the other.
async function attemptPassphrase(passphrase, config) {
  const state = await getUnlockState();
  if (state.lockoutUntil && Date.now() < state.lockoutUntil) {
    return { key: null, lockedUntil: state.lockoutUntil };
  }

  const key = await verifyPassphrase(passphrase, config);

  if (key) {
    await saveUnlockState({ failedAttempts: 0, lockoutUntil: null });
    return { key, lockedUntil: null };
  }

  const attempts = state.failedAttempts + 1;
  let lockoutUntil = null;
  if (attempts >= MAX_ATTEMPTS_BEFORE_LOCKOUT) {
    const extra = attempts - MAX_ATTEMPTS_BEFORE_LOCKOUT;
    lockoutUntil = Date.now() + Math.min(BASE_LOCKOUT_MS * 2 ** extra, MAX_LOCKOUT_MS);
  }
  await saveUnlockState({ failedAttempts: attempts, lockoutUntil });
  return { key: null, lockedUntil: lockoutUntil };
}

// ---------- Setup / unlock / lock / rotate ----------

async function setupPassphrase(passphrase, allowRecentWithoutPassphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = bufToBase64(salt);
  const key = await deriveKeyFromPassphrase(passphrase, saltB64);
  const verify = await encryptWithKey(key, VERIFY_PLAINTEXT, VERIFY_AAD);
  await saveConfig({
    saltB64,
    verifyIv: verify.iv,
    verifyData: verify.data,
    allowRecentWithoutPassphrase: !!allowRecentWithoutPassphrase,
  });
  await saveUnlockState({ failedAttempts: 0, lockoutUntil: null });
  await cacheSessionKey(key);
  await scheduleAutoLock();
}

async function unlockWithPassphrase(passphrase) {
  const config = await getConfig();
  if (!config) return { ok: false };

  const { key, lockedUntil } = await attemptPassphrase(passphrase, config);
  if (!key) return { ok: false, lockedUntil };

  await cacheSessionKey(key);
  await scheduleAutoLock();
  return { ok: true };
}

async function lockNow() {
  await chrome.storage.session.remove(["activeKeyJwk", "lockAt"]);
  await chrome.alarms.clear(AUTO_LOCK_ALARM);
}

async function rotatePassphrase(oldPassphrase, newPassphrase) {
  const config = await getConfig();
  if (!config) return { ok: false, reason: "no-passphrase" };

  const { key: oldKey, lockedUntil } = await attemptPassphrase(oldPassphrase, config);
  if (!oldKey) return { ok: false, reason: "wrong-passphrase", lockedUntil };

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = bufToBase64(salt);
  const newKey = await deriveKeyFromPassphrase(newPassphrase, saltB64);

  // Only entries actually under the OLD passphrase key need touching.
  // Anything that only decrypts under the Recent key isn't tied to the
  // passphrase at all and is left completely alone.
  const { history = [] } = await chrome.storage.local.get("history");
  const newHistory = [];
  for (const entry of history) {
    try {
      const envelope = await decryptEnvelope(entry, oldKey);
      const enc = await encryptWithKey(newKey, JSON.stringify(envelope), entry.id);
      newHistory.push({ id: entry.id, iv: enc.iv, data: enc.data });
    } catch (e) {
      newHistory.push(entry); // not under the old passphrase key, leave as-is
    }
  }

  const verify = await encryptWithKey(newKey, VERIFY_PLAINTEXT, VERIFY_AAD);
  await saveConfig({ ...config, saltB64, verifyIv: verify.iv, verifyData: verify.data });
  await chrome.storage.local.set({ history: newHistory });
  await cacheSessionKey(newKey);
  await scheduleAutoLock();
  return { ok: true };
}

async function setAllowRecentWithoutPassphrase(newValue) {
  const config = await getConfig();
  if (!config) return { ok: false };
  if (!!config.allowRecentWithoutPassphrase === !!newValue) return { ok: true };

  // Changing this requires being unlocked either way: turning it on means
  // moving existing Recent items OFF the passphrase key, turning it off
  // means moving them BACK onto it, and both directions need the real key.
  const passKey = await getCachedSessionKey();
  if (!passKey) return { ok: false, reason: "needs-unlock" };

  const oldRecentKey = config.allowRecentWithoutPassphrase ? await getOrCreateRecentKey() : null;
  const newRecentKey = newValue ? await getOrCreateRecentKey() : null;

  const { history = [] } = await chrome.storage.local.get("history");
  const newHistory = [];
  for (const entry of history) {
    const envelope = await decryptWithAnyKey(entry, [passKey, oldRecentKey]);
    if (!envelope) {
      newHistory.push(entry); // unreadable under either key, leave untouched
      continue;
    }
    if (envelope.starred) {
      newHistory.push(entry); // Saved is never affected by this setting
      continue;
    }
    const targetKey = newRecentKey || passKey;
    const enc = await encryptWithKey(targetKey, JSON.stringify(envelope), entry.id);
    newHistory.push({ id: entry.id, iv: enc.iv, data: enc.data });
  }

  await saveConfig({ ...config, allowRecentWithoutPassphrase: !!newValue });
  await chrome.storage.local.set({ history: newHistory });
  return { ok: true };
}

async function getStatus() {
  const config = await getConfig();
  if (!config) return { state: "needs-setup" };

  const passKey = await getCachedSessionKey();
  if (passKey) {
    const { lockAt } = await chrome.storage.session.get("lockAt");
    const settings = await getSettings();
    return {
      state: "ready",
      lockAt: lockAt || null,
      autoLockMinutes: settings.autoLockMinutes,
      allowRecentWithoutPassphrase: !!config.allowRecentWithoutPassphrase,
    };
  }

  if (config.allowRecentWithoutPassphrase) {
    return { state: "ready-partial", allowRecentWithoutPassphrase: true };
  }

  const unlockState = await getUnlockState();
  const stillLocked = unlockState.lockoutUntil && Date.now() < unlockState.lockoutUntil;
  return { state: "needs-unlock", lockedUntil: stillLocked ? unlockState.lockoutUntil : null };
}

// ---------- Clip storage ----------

function pruneDecorated(decorated) {
  const starred = decorated.filter((d) => d.envelope.starred).map((d) => d.entry);
  const unstarred = decorated
    .filter((d) => !d.envelope.starred)
    .sort((a, b) => b.envelope.ts - a.envelope.ts)
    .slice(0, RECENT_LIMIT)
    .map((d) => d.entry);
  return [...starred.slice(0, SAVED_LIMIT), ...unstarred];
}

async function decorateHistory(history, keys) {
  const decorated = [];
  for (const entry of history) {
    const envelope = await decryptWithAnyKey(entry, keys);
    if (envelope) decorated.push({ entry, envelope });
  }
  return decorated;
}

async function addClip(text) {
  const config = await getConfig();
  if (!config) return;

  const { passKey, recentKey } = await activeKeysFor(config);
  if (passKey) scheduleAutoLock();

  const writeKey = recentKey || passKey; // fixed by the setting, not by current lock state
  if (!writeKey) return; // locked, and Recent isn't allowed without unlocking

  const { history = [] } = await chrome.storage.local.get("history");
  const decorated = await decorateHistory(history, [passKey, recentKey]);

  if (decorated.length > 0) {
    const mostRecent = decorated.reduce((a, b) => (a.envelope.ts > b.envelope.ts ? a : b));
    if (mostRecent.envelope.text === text) return;
  }

  const id = crypto.randomUUID();
  const envelope = { text, ts: Date.now(), starred: false, folder: null };
  const enc = await encryptWithKey(writeKey, JSON.stringify(envelope), id);
  decorated.push({ entry: { id, iv: enc.iv, data: enc.data }, envelope });

  await chrome.storage.local.set({ history: pruneDecorated(decorated) });
}

async function decryptAll() {
  const config = await getConfig();
  if (!config) return [];

  const { passKey, recentKey } = await activeKeysFor(config);
  if (passKey) scheduleAutoLock();
  if (!passKey && !recentKey) return [];

  const { history = [] } = await chrome.storage.local.get("history");
  const results = [];
  for (const entry of history) {
    const envelope = await decryptWithAnyKey(entry, [passKey, recentKey]);
    if (envelope) {
      results.push({
        id: entry.id,
        ts: envelope.ts,
        text: envelope.text,
        starred: !!envelope.starred,
        folder: envelope.folder || null,
      });
    }
  }
  return results;
}

async function setItemMeta(id, starred, folder) {
  const config = await getConfig();
  if (!config) return { ok: false };

  // Any change to starred status needs the real passphrase key. Saved
  // always lives there, so there's nothing to promote to or read from
  // without it.
  const passKey = await getCachedSessionKey();
  if (!passKey) return { ok: false, reason: "needs-unlock" };

  const recentKey = config.allowRecentWithoutPassphrase ? await getOrCreateRecentKey() : null;

  const { history = [] } = await chrome.storage.local.get("history");
  const idx = history.findIndex((h) => h.id === id);
  if (idx === -1) return { ok: false };

  const envelope = await decryptWithAnyKey(history[idx], [passKey, recentKey]);
  if (!envelope) return { ok: false };

  envelope.starred = starred;
  if (starred) envelope.folder = folder || envelope.folder || "General";

  const targetKey = starred ? passKey : recentKey || passKey;
  const enc = await encryptWithKey(targetKey, JSON.stringify(envelope), id);
  const updatedHistory = [...history];
  updatedHistory[idx] = { id, iv: enc.iv, data: enc.data };

  const decorated = await decorateHistory(updatedHistory, [passKey, recentKey]);
  await chrome.storage.local.set({ history: pruneDecorated(decorated) });
  return { ok: true };
}

// ---------- Backup export / import ----------

async function exportBackup() {
  const { config, history = [], recentKeyJwk } = await chrome.storage.local.get([
    "config",
    "history",
    "recentKeyJwk",
  ]);
  const backup = { format: "safeclip-backup", version: 3, exportedAt: Date.now(), config, history };
  if (config?.allowRecentWithoutPassphrase && recentKeyJwk) {
    backup.recentKeyJwk = recentKeyJwk;
  }
  return backup;
}

async function importBackup(backup, currentPassphrase) {
  if (!backup || backup.format !== "safeclip-backup" || !backup.config) {
    return { ok: false, reason: "invalid" };
  }

  const currentConfig = await getConfig();
  if (currentConfig) {
    if (!currentPassphrase) return { ok: false, reason: "passphrase-required" };
    const { key, lockedUntil } = await attemptPassphrase(currentPassphrase, currentConfig);
    if (!key) return { ok: false, reason: "wrong-passphrase", lockedUntil };
  }

  await chrome.storage.session.remove("activeKeyJwk");
  await clearAutoLock();
  await saveUnlockState({ failedAttempts: 0, lockoutUntil: null });

  const toSet = { config: backup.config, history: backup.history || [] };
  if (backup.recentKeyJwk) toSet.recentKeyJwk = backup.recentKeyJwk;
  await chrome.storage.local.set(toSet);
  return { ok: true };
}

// ---------- Message router ----------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg?.type) {
    case "GET_STATUS":
      getStatus().then(sendResponse);
      return true;

    case "GET_SETTINGS":
      getSettings().then(sendResponse);
      return true;

    case "SET_AUTO_LOCK_MINUTES":
      (async () => {
        const settings = await getSettings();
        settings.autoLockMinutes = msg.minutes || null;
        await saveSettings(settings);
        const config = await getConfig();
        const cached = await getCachedSessionKey();
        if (config && cached) await scheduleAutoLock();
        sendResponse({ ok: true });
      })();
      return true;

    case "SET_ALLOW_RECENT_WITHOUT_PASSPHRASE":
      setAllowRecentWithoutPassphrase(!!msg.value).then(sendResponse);
      return true;

    case "EXTEND_SESSION":
      scheduleAutoLock().then(() => sendResponse({ ok: true }));
      return true;

    case "SETUP_PASSPHRASE":
      setupPassphrase(msg.passphrase, !!msg.allowRecentWithoutPassphrase).then(() =>
        sendResponse({ ok: true })
      );
      return true;

    case "UNLOCK":
      unlockWithPassphrase(msg.passphrase).then(sendResponse);
      return true;

    case "ROTATE_PASSPHRASE":
      rotatePassphrase(msg.oldPassphrase, msg.newPassphrase).then(sendResponse);
      return true;

    case "LOCK_NOW":
      lockNow().then(() => sendResponse({ ok: true }));
      return true;

    case "CLIP_COPY":
      addClip(msg.text).then(() => sendResponse({ ok: true }));
      return true;

    case "DECRYPT_ALL":
      decryptAll().then((history) => sendResponse({ history }));
      return true;

    case "SET_ITEM_META":
      setItemMeta(msg.id, msg.starred, msg.folder).then(sendResponse);
      return true;

    case "DELETE_ITEM":
      (async () => {
        const { history = [] } = await chrome.storage.local.get("history");
        const updated = history.filter((h) => h.id !== msg.id);
        await chrome.storage.local.set({ history: updated });
        sendResponse({ ok: true });
      })();
      return true;

    case "EXPORT_BACKUP":
      exportBackup().then((backup) => sendResponse({ ok: true, backup }));
      return true;

    case "IMPORT_BACKUP":
      importBackup(msg.backup, msg.currentPassphrase).then(sendResponse);
      return true;

    default:
      return false;
  }
});
