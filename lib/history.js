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
  } catch (err) {
    // Silently fail if we can't write history
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

module.exports = {
  getHistory,
  addHistoryEntry,
  getHistoryForDevice,
  getLastEntryForDevice,
  HISTORY_FILE,
};
