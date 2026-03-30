const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')

const HISTORY_FILE = path.join(os.homedir(), '.spoofy_history.json')

function getHistory () {
  if (!fs.existsSync(HISTORY_FILE)) {
    return []
  }
  try {
    const content = fs.readFileSync(HISTORY_FILE, 'utf8')
    return JSON.parse(content)
  } catch (err) {
    return []
  }
}

/**
 * Atomically save history to disk using write-to-temp + rename pattern.
 * This prevents corruption from concurrent writes or crashes mid-write.
 */
function saveHistory (history) {
  try {
    const tmpFile = HISTORY_FILE + '.' + crypto.randomBytes(6).toString('hex') + '.tmp'
    fs.writeFileSync(tmpFile, JSON.stringify(history, null, 2), 'utf8')
    fs.renameSync(tmpFile, HISTORY_FILE)
    return true
  } catch (err) {
    // Clean up temp file if rename failed
    try {
      if (fs.existsSync(HISTORY_FILE + '.tmp')) {
        fs.unlinkSync(HISTORY_FILE + '.tmp')
      }
    } catch (e) { /* ignore cleanup errors */ }
    // Log warning if we can't write history (only in verbose mode or if DEBUG is set)
    if (process.env.DEBUG || process.env.SPOOFY_VERBOSE) {
      console.warn('Warning: Could not save history to ' + HISTORY_FILE + ': ' + err.message)
    }
    return false
  }
}

function addHistoryEntry (device, oldMac, newMac, operation) {
  const history = getHistory()
  const entry = {
    timestamp: new Date().toISOString(),
    device,
    oldMac,
    newMac,
    operation,
    platform: process.platform
  }
  history.unshift(entry)
  // Keep only last 100 entries
  if (history.length > 100) {
    history.splice(100)
  }
  saveHistory(history)
  return entry
}

function getHistoryForDevice (device) {
  const history = getHistory()
  return history.filter(function (entry) { return entry.device === device })
}

function getLastEntryForDevice (device) {
  const history = getHistory()
  return history.find(function (entry) { return entry.device === device })
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
function addDUIDHistoryEntry (device, oldDuid, newDuid, operation, iface) {
  const history = getHistory()
  const entry = {
    timestamp: new Date().toISOString(),
    type: 'duid',
    device: device || iface || 'system',
    oldDuid: oldDuid || null,
    newDuid: newDuid || null,
    operation,
    platform: process.platform
  }
  history.unshift(entry)
  if (history.length > 100) {
    history.splice(100)
  }
  saveHistory(history)
  return entry
}

/**
 * Get DUID history for a specific device
 * @param {string} device - Device name
 * @returns {Array} Array of DUID history entries
 */
function getDUIDHistoryForDevice (device) {
  const history = getHistory()
  return history.filter(function (entry) { return entry.type === 'duid' && entry.device === device })
}

/**
 * Get all DUID history entries
 * @returns {Array} Array of all DUID history entries
 */
function getDUIDHistory () {
  const history = getHistory()
  return history.filter(function (entry) { return entry.type === 'duid' })
}

module.exports = {
  getHistory,
  addHistoryEntry,
  getHistoryForDevice,
  getLastEntryForDevice,
  addDUIDHistoryEntry,
  getDUIDHistoryForDevice,
  getDUIDHistory,
  HISTORY_FILE
}
