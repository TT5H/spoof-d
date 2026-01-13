/**
 * NetworkManager detection and management utilities for Linux
 * Provides functions to detect NetworkManager presence, running status,
 * and whether interfaces are managed by NetworkManager.
 */

const cp = require('child_process')
const os = require('os')

const platform = os.platform()

// Only available on Linux
if (platform !== 'linux') {
  module.exports = {
    isNetworkManagerPresent: () => ({ present: false, running: false, method: 'n/a' }),
    getNMDeviceStatus: () => ({ present: false, running: false, managed: false, state: 'unknown', raw: null }),
    reconnectNMDevice: () => Promise.reject(new Error('NetworkManager utilities are only available on Linux')),
    disconnectNMDevice: () => Promise.reject(new Error('NetworkManager utilities are only available on Linux'))
  }
  return
}

/**
 * Executes a command with timeout
 * @param {string} command - Command to execute
 * @param {Array<string>} args - Command arguments
 * @param {number} timeout - Timeout in milliseconds (default: 15000)
 * @returns {Promise<string>} Command output
 */
function execWithTimeout (command, args = [], timeout = 15000) {
  return new Promise((resolve, reject) => {
    const proc = cp.spawn(command, args, { stdio: 'pipe' })
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error(`Command timeout after ${timeout}ms`))
    }, timeout)

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`))
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

/**
 * Detects if NetworkManager is present and running
 * @returns {Promise<{present: boolean, running: boolean, method: string}>}
 */
async function isNetworkManagerPresent () {
  // Try nmcli first (preferred method)
  try {
    const output = await execWithTimeout('nmcli', ['-t', '-f', 'RUNNING', 'general'], 5000)
    const running = output.trim().toLowerCase() === 'yes' || output.trim() === 'running'
    return {
      present: true,
      running: running,
      method: 'nmcli'
    }
  } catch (err) {
    // nmcli not found or failed, try systemctl
    try {
      const output = await execWithTimeout('systemctl', ['is-active', 'NetworkManager'], 5000)
      const running = output.trim() === 'active'
      return {
        present: true,
        running: running,
        method: 'systemctl'
      }
    } catch (err2) {
      // systemctl also failed, check if NetworkManager service exists
      try {
        await execWithTimeout('systemctl', ['status', 'NetworkManager'], 2000)
        // Service exists but might not be active
        return {
          present: true,
          running: false,
          method: 'systemctl-status'
        }
      } catch (err3) {
        // NetworkManager not present
        return {
          present: false,
          running: false,
          method: 'unknown'
        }
      }
    }
  }
}

/**
 * Gets NetworkManager device status for a specific interface
 * @param {string} iface - Interface name (e.g., 'eth0', 'wlan0')
 * @returns {Promise<{present: boolean, running: boolean, managed: boolean, state: string, raw: string|null}>}
 */
async function getNMDeviceStatus (iface) {
  const nmStatus = await isNetworkManagerPresent()

  if (!nmStatus.present || !nmStatus.running) {
    return {
      present: nmStatus.present,
      running: nmStatus.running,
      managed: false,
      state: 'unknown',
      raw: null
    }
  }

  try {
    // Use tab-separated output for reliable parsing
    const output = await execWithTimeout('nmcli', ['-t', '-f', 'DEVICE,STATE,MANAGED', 'device', 'status'], 10000)
    const lines = output.split('\n').filter(line => line.trim())

    for (const line of lines) {
      const parts = line.split(':')
      if (parts.length >= 3) {
        const device = parts[0]
        const state = parts[1]
        const managed = parts[2].toLowerCase() === 'yes'

        if (device === iface) {
          return {
            present: true,
            running: true,
            managed: managed,
            state: state,
            raw: line
          }
        }
      }
    }

    // Interface not found in nmcli output (might be unmanaged or not exist)
    return {
      present: true,
      running: true,
      managed: false,
      state: 'unknown',
      raw: null
    }
  } catch (err) {
    // nmcli failed, return unknown status
    return {
      present: true,
      running: true,
      managed: false,
      state: 'unknown',
      raw: null
    }
  }
}

/**
 * Disconnects a NetworkManager device
 * @param {string} iface - Interface name
 * @param {number} timeout - Timeout in milliseconds (default: 20000)
 * @returns {Promise<void>}
 */
async function disconnectNMDevice (iface, timeout = 20000) {
  const nmStatus = await isNetworkManagerPresent()
  if (!nmStatus.present || !nmStatus.running) {
    throw new Error('NetworkManager is not running')
  }

  try {
    await execWithTimeout('nmcli', ['device', 'disconnect', iface], timeout)
  } catch (err) {
    throw new Error(`Failed to disconnect device ${iface}: ${err.message}`)
  }
}

/**
 * Connects a NetworkManager device
 * @param {string} iface - Interface name
 * @param {number} timeout - Timeout in milliseconds (default: 20000)
 * @returns {Promise<void>}
 */
async function reconnectNMDevice (iface, timeout = 20000) {
  const nmStatus = await isNetworkManagerPresent()
  if (!nmStatus.present || !nmStatus.running) {
    throw new Error('NetworkManager is not running')
  }

  try {
    // First disconnect, then connect
    await disconnectNMDevice(iface, timeout)
    // Small delay to ensure disconnect completes
    await new Promise(resolve => setTimeout(resolve, 500))
    await execWithTimeout('nmcli', ['device', 'connect', iface], timeout)
  } catch (err) {
    throw new Error(`Failed to reconnect device ${iface}: ${err.message}`)
  }
}

/**
 * Disables and re-enables NetworkManager networking (use with caution)
 * @param {boolean} enable - If true, enable networking; if false, disable
 * @param {number} timeout - Timeout in milliseconds (default: 20000)
 * @returns {Promise<void>}
 */
async function toggleNMNetworking (enable, timeout = 20000) {
  const nmStatus = await isNetworkManagerPresent()
  if (!nmStatus.present || !nmStatus.running) {
    throw new Error('NetworkManager is not running')
  }

  try {
    const action = enable ? 'on' : 'off'
    await execWithTimeout('nmcli', ['networking', action], timeout)
  } catch (err) {
    throw new Error(`Failed to ${enable ? 'enable' : 'disable'} NetworkManager networking: ${err.message}`)
  }
}

module.exports = {
  isNetworkManagerPresent,
  getNMDeviceStatus,
  reconnectNMDevice,
  disconnectNMDevice,
  toggleNMNetworking
}
