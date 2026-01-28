const fs = require("fs");
const path = require("path");
const os = require("os");

const HISTORY_FILE = path.join(os.homedir(), ".spoofy_history.json");

function getHistory() {
  if (!fs.existsSync(HISTORY_FILE)) {
    return [];
  }
  try {
    const content = fs.readFileSync(HISTORY_FILE, "utf8");
    return JSON.parse(content);
  } catch (err) {
    return [];
  }
}

function saveHistory(history) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf8");
    return true;
  } catch (err) {
    // Log warning if we can't write history (only in verbose mode or if DEBUG is set)
    if (process.env.DEBUG || process.env.SPOOFY_VERBOSE) {
      console.warn(`Warning: Could not save history to ${HISTORY_FILE}: ${err.message}`);
    }
    return false;
  }
}

function addHistoryEntry(device, oldMac, newMac, operation) {
  const history = getHistory();
  const entry = {
    timestamp: new Date().toISOString(),
    device: device,
    oldMac: oldMac,
    newMac: newMac,
    operation: operation, // 'set', 'randomize', 'reset'
    platform: process.platform,
  };
  history.unshift(entry); // Add to beginning
  // Keep only last 100 entries
  if (history.length > 100) {
    history.splice(100);
  }
  saveHistory(history);
  return entry;
}

function getHistoryForDevice(device) {
  const history = getHistory();
  return history.filter((entry) => entry.device === device);
}

function getLastEntryForDevice(device) {
  const history = getHistory();
  return history.find((entry) => entry.device === device);
}

/**
 * Add DUID change history entry
 * @param {string} device - Network interface device name
 * @param {string} oldDuid - Old DUID (formatted hex string)
 * @param {string} newDuid - New DUID (formatted hex string)
 * @param {string} operation - Operation type ('set', 'randomize', 'restore', 'reset', 'sync')
 * @param {string} [iface] - Optional interface name
 * @returns {Object} The history entry
 */
function addDUIDHistoryEntry(device, oldDuid, newDuid, operation, iface = null) {
  const history = getHistory();
  const entry = {
    timestamp: new Date().toISOString(),
    type: 'duid', // Mark as DUID entry
    device: device || iface || 'system',
    oldDuid: oldDuid || null,
    newDuid: newDuid || null,
    operation: operation, // 'set', 'randomize', 'restore', 'reset', 'sync'
    platform: process.platform,
  };
  history.unshift(entry); // Add to beginning
  // Keep only last 100 entries
  if (history.length > 100) {
    history.splice(100);
  }
  saveHistory(history);
  return entry;
}

/**
 * Get DUID history for a specific device
 * @param {string} device - Device name
 * @returns {Array} Array of DUID history entries
 */
function getDUIDHistoryForDevice(device) {
  const history = getHistory();
  return history.filter((entry) => entry.type === 'duid' && entry.device === device);
}

/**
 * Get all DUID history entries
 * @returns {Array} Array of all DUID history entries
 */
function getDUIDHistory() {
  const history = getHistory();
  return history.filter((entry) => entry.type === 'duid');
}

module.exports = {
  getHistory,
  addHistoryEntry,
  getHistoryForDevice,
  getLastEntryForDevice,
  addDUIDHistoryEntry,
  getDUIDHistoryForDevice,
  getDUIDHistory,
  HISTORY_FILE,
};
