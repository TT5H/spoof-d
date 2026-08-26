/**
 * Shared utility functions for spoof-d
 * Consolidates duplicated code from index.js and lib/duid.js
 */

const fs = require('fs')

/**
 * Resolve a path for state this tool owns, honouring the name it used before
 * the CLI was renamed from `spoofy` to `spoofd`.
 *
 * Prefers the current path. If only the legacy one exists, keep using it --
 * an upgrade should never orphan somebody's saved history, config or original
 * DUID, and silently copying files around behind their back is worse.
 *
 * @param {string} current - path under the current name
 * @param {string} legacy - path under the pre-rename name
 * @returns {string}
 */
function resolveStatePath (current, legacy) {
  try {
    if (fs.existsSync(current)) return current
    if (fs.existsSync(legacy)) return legacy
  } catch (e) {
    // An unreadable home directory is not worth crashing over.
  }
  return current
}

/**
 * Synchronous sleep using Atomics.wait (non-blocking alternative to busy-wait)
 * Falls back to busy-wait only if SharedArrayBuffer is not available
 * @param {number} ms - Milliseconds to sleep
 */
function sleepSync (ms) {
  if (typeof SharedArrayBuffer !== 'undefined') {
    const sab = new SharedArrayBuffer(4)
    const int32 = new Int32Array(sab)
    Atomics.wait(int32, 0, 0, ms)
  } else {
    const end = Date.now() + ms
    while (Date.now() < end) {
      // Busy wait fallback
    }
  }
}

/**
 * Retries a function with exponential backoff (sync version)
 * @param {Function} fn
 * @param {number} maxRetries
 * @param {number} delay - initial delay in ms
 * @return {any}
 */
function retry (fn, maxRetries, delay) {
  if (maxRetries === undefined) maxRetries = 3
  if (delay === undefined) delay = 500
  let lastError
  for (let i = 0; i < maxRetries; i++) {
    try {
      return fn()
    } catch (err) {
      lastError = err
      if (i < maxRetries - 1) {
        const waitTime = delay * Math.pow(2, i)
        sleepSync(waitTime)
      }
    }
  }
  throw lastError
}

/**
 * Sanitize a network interface name for safe use in shell commands.
 * Allows only alphanumeric characters, hyphens, underscores, dots, and spaces.
 * Throws if the input contains potentially dangerous characters.
 * @param {string} iface - Interface name to sanitize
 * @returns {string} The validated interface name
 */
function sanitizeInterfaceName (iface) {
  if (!iface || typeof iface !== 'string') {
    throw new Error('Interface name must be a non-empty string')
  }
  iface = iface.trim()
  if (iface.length === 0) {
    throw new Error('Interface name must be a non-empty string')
  }
  // Allow alphanumeric, hyphens, underscores, dots, spaces, and parentheses
  // (Windows uses names like "Ethernet", "Wi-Fi", "Local Area Connection (2)")
  if (!/^[a-zA-Z0-9\-_. ()]+$/.test(iface)) {
    throw new Error(
      'Interface name contains invalid characters: ' + iface + '. ' +
      'Only alphanumeric characters, hyphens, underscores, dots, spaces, and parentheses are allowed.'
    )
  }
  return iface
}

/**
 * Escapes a string for safe use in PowerShell single-quoted strings.
 * In PowerShell, single-quoted strings only need single quotes escaped (doubled).
 * This is safer than double-quoted strings which interpret backticks, $, etc.
 * @param {string} str
 * @return {string}
 */
function escapePowerShell (str) {
  if (!str || typeof str !== 'string') return ''
  // In single-quoted PowerShell strings, the only escape needed is '' for literal '
  return str.replace(/'/g, "''")
}

/**
 * Escapes a string for safe use in double-quoted shell commands on Unix.
 * @param {string} str
 * @return {string}
 */
function escapeShellArg (str) {
  if (!str || typeof str !== 'string') return ''
  // Replace single quotes with escaped version for POSIX shells
  return "'" + str.replace(/'/g, "'\\''") + "'"
}

/**
 * Whether a failure was the operating system refusing for lack of privilege,
 * as opposed to an adapter that will not take the change.
 *
 * Forgetting sudo is the single most common way this tool fails, and callers
 * need to tell it apart from a hardware refusal: one is fixed by re-running,
 * the other never is.
 *
 * @param {Error} err
 * @returns {boolean}
 */
function isPermissionFailure (err) {
  if (!err) return false
  if (err.code === 'EPERM' || err.code === 'EACCES') return true
  const message = String(err.message || '') + ' ' + String(err.stderr || '')
  return /operation not permitted|permission denied|access is denied|must be root|not authorized|requires? (root|elevation|administrator)|run as administrator/i.test(message)
}

module.exports = {
  sleepSync,
  isPermissionFailure,
  retry,
  sanitizeInterfaceName,
  escapePowerShell,
  escapeShellArg,
  resolveStatePath
}
