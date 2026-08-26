/**
 * DUID (DHCP Unique Identifier) manipulation for DHCPv6
 * RFC 8415 - supports types 1-4 (LLT, EN, LL, UUID)
 * Enhanced with cross-platform support and better error handling
 */

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { sanitizeInterfaceName, escapePowerShell, sleepSync, retry, resolveStatePath } = require('./utils')

const platform = os.platform()

const DUID_TYPES = {
  DUID_LLT: 1, // Link-layer + Time
  DUID_EN: 2, // Enterprise Number
  DUID_LL: 3, // Link-layer only
  DUID_UUID: 4 // UUID
}

const HW_TYPE_ETHERNET = 1

function generateRandomMAC () {
  const bytes = []
  for (let i = 0; i < 6; i++) {
    bytes.push(Math.floor(Math.random() * 256))
  }
  // Set locally administered bit, clear multicast bit
  bytes[0] = (bytes[0] | 0x02) & 0xFE
  return bytes.map(b => b.toString(16).padStart(2, '0')).join(':')
}

function getCurrentMACAddress (iface) {
  if (!iface) {
    throw new Error('Interface name required')
  }

  const safeIface = sanitizeInterfaceName(iface)

  try {
    if (platform === 'darwin' || platform === 'linux') {
      let output
      if (platform === 'darwin') {
        output = execFileSync('ifconfig', [safeIface], { encoding: 'utf8' })
        const match = output.match(/ether\s+([0-9a-f:]{17})/i)
        return match ? match[1] : null
      } else {
        output = execFileSync('ip', ['link', 'show', safeIface], { encoding: 'utf8' })
        const match = output.match(/link\/ether\s+([0-9a-f:]{17})/i)
        return match ? match[1] : null
      }
    } else if (platform === 'win32') {
      const escaped = escapePowerShell(safeIface)
      const psCmd = "Get-NetAdapter -Name '" + escaped + "' | Select-Object -ExpandProperty MacAddress"
      const output = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
        encoding: 'utf8', stdio: 'pipe'
      }).trim()
      return output ? output.replace(/-/g, ':').toLowerCase() : null
    }
  } catch (e) {
    // Fallback to os.networkInterfaces()
    const ifaces = os.networkInterfaces()
    for (const name in ifaces) {
      if (name.toLowerCase() === safeIface.toLowerCase()) {
        const info = ifaces[name].find(function (i) { return i.mac && i.mac !== '00:00:00:00:00:00' })
        return info ? info.mac : null
      }
    }
  }

  return null
}

function generateDUID (type = DUID_TYPES.DUID_LL, mac = null) {
  const macAddr = mac || generateRandomMAC()
  // Validate MAC format before parsing
  if (!/^[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}$/.test(macAddr)) {
    throw new Error('Invalid MAC address format: ' + macAddr + '. Expected XX:XX:XX:XX:XX:XX')
  }
  const macBytes = macAddr.split(':').map(h => parseInt(h, 16))

  switch (type) {
    case DUID_TYPES.DUID_LLT: {
      // Type (2) + HW Type (2) + Time (4) + Link-layer (6) = 14 bytes
      const buf = Buffer.alloc(14)
      buf.writeUInt16BE(DUID_TYPES.DUID_LLT, 0)
      buf.writeUInt16BE(HW_TYPE_ETHERNET, 2)
      // Time since Jan 1, 2000 in seconds
      const epoch2000 = Math.floor((Date.now() / 1000) - 946684800)
      buf.writeUInt32BE(epoch2000, 4)
      macBytes.forEach((b, i) => buf.writeUInt8(b, 8 + i))
      return buf
    }

    case DUID_TYPES.DUID_EN: {
      // Type (2) + Enterprise Number (4) + Identifier (variable)
      const identifier = Buffer.from(macAddr.replace(/:/g, ''), 'hex')
      const buf = Buffer.alloc(6 + identifier.length)
      buf.writeUInt16BE(DUID_TYPES.DUID_EN, 0)
      buf.writeUInt32BE(9, 2) // Enterprise number 9 = Cisco (example)
      identifier.copy(buf, 6)
      return buf
    }

    case DUID_TYPES.DUID_LL: {
      // Type (2) + HW Type (2) + Link-layer (6) = 10 bytes
      const buf = Buffer.alloc(10)
      buf.writeUInt16BE(DUID_TYPES.DUID_LL, 0)
      buf.writeUInt16BE(HW_TYPE_ETHERNET, 2)
      macBytes.forEach((b, i) => buf.writeUInt8(b, 4 + i))
      return buf
    }

    case DUID_TYPES.DUID_UUID: {
      // Type (2) + UUID (16) = 18 bytes
      const buf = Buffer.alloc(18)
      buf.writeUInt16BE(DUID_TYPES.DUID_UUID, 0)
      // Generate random UUID v4
      for (let i = 0; i < 16; i++) {
        buf.writeUInt8(Math.floor(Math.random() * 256), 2 + i)
      }
      // Set version (4) and variant bits
      buf[8] = (buf[8] & 0x0F) | 0x40
      buf[10] = (buf[10] & 0x3F) | 0x80
      return buf
    }

    default:
      throw new Error(`Unknown DUID type: ${type}`)
  }
}

/**
 * Convert DUID buffer to hex string
 * @param {Buffer} duid
 * @returns {string}
 */
function duidToHex (duid) {
  return duid.toString('hex').toUpperCase()
}

function hexToDuid (hex) {
  if (!hex || typeof hex !== 'string') {
    throw new Error('DUID hex string must be a non-empty string')
  }
  const cleaned = hex.replace(/[:\s]/g, '')
  if (cleaned.length < 4) {
    throw new Error('DUID too short (minimum 2 bytes for type field)')
  }
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new Error('DUID hex string contains invalid characters')
  }
  return Buffer.from(cleaned, 'hex')
}

function formatDUID (duid) {
  if (!duid || !Buffer.isBuffer(duid) || duid.length === 0) {
    return ''
  }
  const hex = duid.toString('hex')
  const parts = hex.match(/.{2}/g)
  return parts ? parts.join(':').toUpperCase() : ''
}

function syncDUID (iface, type = DUID_TYPES.DUID_LL, verify = true) {
  const currentMac = getCurrentMACAddress(iface)
  if (!currentMac) {
    throw new Error(`Could not get MAC address for interface: ${iface}`)
  }
  const duid = generateDUID(type, currentMac)
  setDUID(duid, iface, verify)
  return duid
}

// Original DUID storage (persists across reboots)

// Where the original DUID lives when the system-wide location is not
// writable. Split out because two branches below need it.
function userDUIDPath () {
  return resolveStatePath(
    path.join(os.homedir(), '.spoofd', 'duid.original'),
    path.join(os.homedir(), '.spoofy', 'duid.original')
  )
}

function getOriginalDUIDPath () {
  switch (platform) {
    case 'darwin':
      return '/var/db/dhcpclient/DUID.original'
    case 'linux': {
      const linuxPath = '/var/lib/spoofd'
      if (!fs.existsSync(linuxPath)) {
        try {
          fs.mkdirSync(linuxPath, { recursive: true, mode: 0o755 })
        } catch (e) {
          return userDUIDPath()
        }
      }
      return resolveStatePath(
        path.join(linuxPath, 'duid.original'),
        path.join('/var/lib/spoofy', 'duid.original')
      )
    }
    case 'win32': {
      const winPath = path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'spoofd')
      if (!fs.existsSync(winPath)) {
        try {
          fs.mkdirSync(winPath, { recursive: true })
        } catch (e) {
          return resolveStatePath(
            path.join(process.env.APPDATA || os.homedir(), 'spoofd', 'duid.original'),
            path.join(process.env.APPDATA || os.homedir(), 'spoofy', 'duid.original')
          )
        }
      }
      return resolveStatePath(
        path.join(winPath, 'duid.original'),
        path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'spoofy', 'duid.original')
      )
    }
    default:
      return userDUIDPath()
  }
}

// Store original DUID (only if not already stored)
function storeOriginalDUID (duid) {
  const originalPath = getOriginalDUIDPath()

  if (fs.existsSync(originalPath)) {
    return false
  }
  const dir = path.dirname(originalPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Store with metadata
  const metadata = {
    duid: duid.toString('hex'),
    storedAt: new Date().toISOString(),
    platform,
    hostname: os.hostname()
  }

  fs.writeFileSync(originalPath, JSON.stringify(metadata, null, 2))
  return true
}

function getOriginalDUID () {
  const originalPath = getOriginalDUIDPath()

  if (!fs.existsSync(originalPath)) {
    return null
  }

  try {
    const content = fs.readFileSync(originalPath, 'utf8')
    const metadata = JSON.parse(content)
    return Buffer.from(metadata.duid, 'hex')
  } catch (e) {
    // Try reading as raw binary (legacy format)
    try {
      return fs.readFileSync(originalPath)
    } catch (e2) {
      return null
    }
  }
}

/**
 * Check if original DUID is stored
 * @returns {boolean}
 */
function hasOriginalDUID () {
  return fs.existsSync(getOriginalDUIDPath())
}

/**
 * Clear the stored original DUID
 * WARNING: This should rarely be used - only for testing or explicit user request
 * @returns {boolean}
 */
function clearOriginalDUID () {
  const originalPath = getOriginalDUIDPath()
  if (fs.existsSync(originalPath)) {
    fs.unlinkSync(originalPath)
    return true
  }
  return false
}

// macOS

const macos = {
  DUID_PATH: '/var/db/dhcpclient/DUID',

  getCurrentDUID () {
    try {
      if (fs.existsSync(this.DUID_PATH)) {
        return fs.readFileSync(this.DUID_PATH)
      }
      const result = execFileSync('defaults', ['read', '/var/db/dhcpclient/DUID'], {
        encoding: 'utf8', stdio: 'pipe'
      }).trim()
      if (result) {
        return hexToDuid(result)
      }
    } catch (e) {}
    return null
  },

  /**
   * Backup original DUID (only once, preserves the true original)
   */
  backupOriginal () {
    const current = this.getCurrentDUID()
    if (current) {
      const stored = storeOriginalDUID(current)
      return stored
    }
    return false
  },

  setDUID (duid, iface = null) {
    this.backupOriginal()
    const safeIface = iface ? sanitizeInterfaceName(iface) : null
    if (safeIface) {
      this._setV6Off(safeIface)
    }

    // Clean up old DUID files using fs instead of shell commands
    try {
      const duidDir = path.dirname(this.DUID_PATH)
      if (fs.existsSync(duidDir)) {
        fs.readdirSync(duidDir).forEach(function (f) {
          if (f.startsWith('DUID')) {
            try { fs.unlinkSync(path.join(duidDir, f)) } catch (e) { /* ignore */ }
          }
        })
        const leasesDir = path.join(duidDir, 'leases')
        if (fs.existsSync(leasesDir)) {
          fs.readdirSync(leasesDir).forEach(function (f) {
            try { fs.unlinkSync(path.join(leasesDir, f)) } catch (e) { /* ignore */ }
          })
        }
      }
    } catch (e) { /* ignore cleanup errors */ }

    const duidDirPath = path.dirname(this.DUID_PATH)
    if (!fs.existsSync(duidDirPath)) {
      fs.mkdirSync(duidDirPath, { recursive: true })
    }
    fs.writeFileSync(this.DUID_PATH, duid)
    if (safeIface) {
      this._setV6Automatic(safeIface)
    }

    return true
  },

  /**
   * Restore DUID to the original (pre-spoofing) value
   * @param {string} [iface] - Network interface
   * @returns {boolean|string} true if restored, false if no original, 'not_spoofed' if current matches original
   */
  restoreDUID (iface = null) {
    const original = getOriginalDUID()

    if (!original) {
      return false // No original stored
    }

    // Check if we're already at original
    const current = this.getCurrentDUID()
    if (current && current.equals(original)) {
      return 'not_spoofed' // Already at original
    }

    const safeIface = iface ? sanitizeInterfaceName(iface) : null

    // Disable IPv6 temporarily
    if (safeIface) {
      this._setV6Off(safeIface)
    }

    // Clear existing DHCP leases and DUID using fs
    try {
      if (fs.existsSync(this.DUID_PATH)) {
        fs.unlinkSync(this.DUID_PATH)
      }
      const leasesDir = path.join(path.dirname(this.DUID_PATH), 'leases')
      if (fs.existsSync(leasesDir)) {
        fs.readdirSync(leasesDir).forEach(function (f) {
          try { fs.unlinkSync(path.join(leasesDir, f)) } catch (e) { /* ignore */ }
        })
      }
    } catch (e) { /* ignore cleanup errors */ }

    // Write original DUID back
    fs.writeFileSync(this.DUID_PATH, original)

    // Re-enable IPv6
    if (safeIface) {
      this._setV6Automatic(safeIface)
    }

    return true
  },

  /**
   * Reset DUID (remove spoofed DUID, system will regenerate)
   * Note: This generates a NEW DUID, not the original. Use restoreDUID() to get original back.
   */
  resetDUID (iface = null) {
    const safeIface = iface ? sanitizeInterfaceName(iface) : null
    const safeTarget = safeIface ? (this.getHardwarePort(safeIface) || safeIface) : null

    // Disable IPv6
    if (safeTarget) {
      this._setV6Off(safeTarget)
    }

    // Remove DUID file (but NOT the .original backup!) using fs
    try {
      if (fs.existsSync(this.DUID_PATH)) {
        fs.unlinkSync(this.DUID_PATH)
      }
    } catch (e) { /* ignore if already absent */ }

    // Re-enable IPv6 (system will generate new DUID)
    if (safeTarget) {
      this._setV6Automatic(safeTarget)
    }

    return true
  },

  /**
   * Get hardware port name from device name
   */
  getHardwarePort (device) {
    try {
      const output = execFileSync('networksetup', ['-listallhardwareports'], { encoding: 'utf8' })
      const lines = output.split('\n')
      const safeDevice = sanitizeInterfaceName(device)
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Device: ' + safeDevice)) {
          // Previous line should be Hardware Port
          const portLine = lines[i - 1]
          const match = portLine.match(/Hardware Port: (.+)/)
          if (match) return match[1]
        }
      }
    } catch (e) { /* interface lookup is best-effort */ }
    return null
  },

  /**
   * Safely disable IPv6 on an interface using execFileSync (no shell injection)
   */
  _setV6Off (ifaceOrPort) {
    try {
      execFileSync('networksetup', ['-setv6off', ifaceOrPort], { stdio: 'pipe' })
    } catch (e) {
      // Try hardware port name as fallback
      const hwPort = this.getHardwarePort(ifaceOrPort)
      if (hwPort) {
        try {
          execFileSync('networksetup', ['-setv6off', hwPort], { stdio: 'pipe' })
        } catch (e2) { /* best-effort IPv6 toggle */ }
      }
    }
  },

  /**
   * Safely re-enable IPv6 on an interface using execFileSync (no shell injection)
   */
  _setV6Automatic (ifaceOrPort) {
    try {
      execFileSync('networksetup', ['-setv6automatic', ifaceOrPort], { stdio: 'pipe' })
    } catch (e) {
      const hwPort = this.getHardwarePort(ifaceOrPort)
      if (hwPort) {
        try {
          execFileSync('networksetup', ['-setv6automatic', hwPort], { stdio: 'pipe' })
        } catch (e2) { /* best-effort IPv6 toggle */ }
      }
    }
  }
}

// =============================================================================
// Linux Implementation
// =============================================================================

const linux = {
  // Common DUID file locations
  SYSTEMD_DUID_PATH: '/etc/systemd/network',
  DHCLIENT_CONF: '/etc/dhcp/dhclient6.conf',
  MACHINE_ID: '/etc/machine-id',

  /**
   * Detect which DHCP client is in use
   */
  detectDHCPClient () {
    try {
      execFileSync('systemctl', ['is-active', 'systemd-networkd'], { stdio: 'pipe' })
      return 'systemd'
    } catch (e) {}

    try {
      execFileSync('pgrep', ['dhclient'], { stdio: 'pipe' })
      return 'dhclient'
    } catch (e) {}

    try {
      execFileSync('pgrep', ['NetworkManager'], { stdio: 'pipe' })
      return 'networkmanager'
    } catch (e) {}

    return 'unknown'
  },

  /**
   * Get current DUID on Linux
   */
  getCurrentDUID () {
    const client = this.detectDHCPClient()

    switch (client) {
      case 'systemd': {
        try {
          const output = execFileSync('networkctl', ['status'], {
            encoding: 'utf8', stdio: 'pipe'
          })
          const match = output.match(/DUID:\s*([0-9a-fA-F:]+)/i)
          if (match) {
            return hexToDuid(match[1])
          }
        } catch (e) {}
        break
      }

      case 'dhclient': {
        try {
          if (fs.existsSync(this.DHCLIENT_CONF)) {
            const content = fs.readFileSync(this.DHCLIENT_CONF, 'utf8')
            const match = content.match(/send\s+dhcp6\.client-id\s+([0-9a-fA-F:]+)/i)
            if (match) {
              return hexToDuid(match[1])
            }
          }
        } catch (e) {}
        break
      }

      case 'networkmanager': {
        try {
          const output = execFileSync('nmcli', ['-g', 'dhcp6.duid', 'connection', 'show'], {
            encoding: 'utf8', stdio: 'pipe'
          })
          if (output.trim()) {
            return hexToDuid(output.trim())
          }
        } catch (e) {}
        break
      }
    }

    return null
  },

  /**
   * Backup original DUID (only once, preserves the true original)
   */
  backupOriginal () {
    const current = this.getCurrentDUID()
    if (current) {
      const stored = storeOriginalDUID(current)
      return stored
    }
    return false
  },

  /**
   * Set DUID on Linux
   */
  setDUID (duid, iface = null) {
    // Store original DUID if this is the first time spoofing
    this.backupOriginal()

    const safeIface = iface ? sanitizeInterfaceName(iface) : null
    const client = this.detectDHCPClient()
    const duidHex = formatDUID(duid).toLowerCase()

    switch (client) {
      case 'systemd': {
        // Create/modify network file for the interface
        // Sanitize interface name for use in filename
        const networkFile = safeIface
          ? path.join(this.SYSTEMD_DUID_PATH, safeIface + '.network')
          : path.join(this.SYSTEMD_DUID_PATH, '00-duid.network')

        if (!fs.existsSync(this.SYSTEMD_DUID_PATH)) {
          fs.mkdirSync(this.SYSTEMD_DUID_PATH, { recursive: true })
        }

        // Raw DUID data (without colons)
        const rawDuid = duid.toString('hex')

        let content
        if (safeIface) {
          content = '[Match]\nName=' + safeIface + '\n\n[DHCPv6]\nDUIDType=raw\nDUIDRawData=' + rawDuid + '\n'
        } else {
          // System-wide DUID
          content = '[DHCPv6]\nDUIDType=raw\nDUIDRawData=' + rawDuid + '\n'
          fs.writeFileSync(path.join(this.SYSTEMD_DUID_PATH, '00-duid.conf'), content)
        }

        if (safeIface) {
          fs.writeFileSync(networkFile, content)
        }

        // Restart networkd
        try {
          execFileSync('systemctl', ['restart', 'systemd-networkd'], { stdio: 'pipe' })
        } catch (e) { /* best-effort restart */ }

        return true
      }

      case 'dhclient': {
        // Modify dhclient6.conf
        const confDir = path.dirname(this.DHCLIENT_CONF)
        if (!fs.existsSync(confDir)) {
          fs.mkdirSync(confDir, { recursive: true })
        }

        let dhContent = ''
        if (fs.existsSync(this.DHCLIENT_CONF)) {
          dhContent = fs.readFileSync(this.DHCLIENT_CONF, 'utf8')
          // Remove existing DUID line
          dhContent = dhContent.replace(/send\s+dhcp6\.client-id\s+[^;]+;/g, '')
        }

        dhContent += '\nsend dhcp6.client-id ' + duidHex + ';\n'
        fs.writeFileSync(this.DHCLIENT_CONF, dhContent)

        // Restart dhclient if running — use execFileSync to avoid injection
        if (safeIface) {
          try {
            execFileSync('dhclient', ['-6', '-r', safeIface], { stdio: 'pipe' })
          } catch (e) { /* dhclient release is best-effort */ }
          try {
            execFileSync('dhclient', ['-6', safeIface], { stdio: 'pipe' })
          } catch (e) { /* dhclient renew is best-effort */ }
        }

        return true
      }

      case 'networkmanager': {
        if (safeIface) {
          // Get connection name for interface — use execFileSync with args array
          try {
            const connName = execFileSync('nmcli', ['-g', 'GENERAL.CONNECTION', 'device', 'show', safeIface], {
              encoding: 'utf8'
            }).trim()

            if (connName) {
              // connName comes from nmcli output; sanitize before reuse
              const safeConn = sanitizeInterfaceName(connName)
              execFileSync('nmcli', ['connection', 'modify', safeConn, 'ipv6.dhcp-duid', duidHex], {
                stdio: 'pipe'
              })
              execFileSync('nmcli', ['connection', 'down', safeConn], { stdio: 'pipe' })
              execFileSync('nmcli', ['connection', 'up', safeConn], { stdio: 'pipe' })
            }
          } catch (e) { /* NM DUID change is best-effort */ }
        }
        return true
      }

      default:
        throw new Error('Could not detect DHCP client. Please configure DUID manually.')
    }
  },

  /**
   * Restore DUID to the original (pre-spoofing) value
   */
  restoreDUID (iface = null) {
    const original = getOriginalDUID()

    if (!original) {
      return false // No original stored
    }

    // Check if we're already at original
    const current = this.getCurrentDUID()
    if (current && current.equals(original)) {
      return 'not_spoofed' // Already at original
    }

    // Set the original DUID back
    const safeIface = iface ? sanitizeInterfaceName(iface) : null
    const client = this.detectDHCPClient()
    const duidHex = formatDUID(original).toLowerCase()

    switch (client) {
      case 'systemd': {
        const rawDuid = original.toString('hex')
        const sContent = '[DHCPv6]\nDUIDType=raw\nDUIDRawData=' + rawDuid + '\n'
        fs.writeFileSync(path.join(this.SYSTEMD_DUID_PATH, '00-duid.conf'), sContent)
        try {
          execFileSync('systemctl', ['restart', 'systemd-networkd'], { stdio: 'pipe' })
        } catch (e) { /* best-effort restart */ }
        break
      }

      case 'dhclient': {
        const confDir = path.dirname(this.DHCLIENT_CONF)
        if (!fs.existsSync(confDir)) {
          fs.mkdirSync(confDir, { recursive: true })
        }

        let dContent = ''
        if (fs.existsSync(this.DHCLIENT_CONF)) {
          dContent = fs.readFileSync(this.DHCLIENT_CONF, 'utf8')
          dContent = dContent.replace(/send\s+dhcp6\.client-id\s+[^;]+;/g, '')
        }

        dContent += '\nsend dhcp6.client-id ' + duidHex + ';\n'
        fs.writeFileSync(this.DHCLIENT_CONF, dContent)

        if (safeIface) {
          try {
            execFileSync('dhclient', ['-6', '-r', safeIface], { stdio: 'pipe' })
          } catch (e) { /* best-effort release */ }
          try {
            execFileSync('dhclient', ['-6', safeIface], { stdio: 'pipe' })
          } catch (e) { /* best-effort renew */ }
        }
        break
      }

      case 'networkmanager': {
        if (safeIface) {
          try {
            const rConnName = execFileSync('nmcli', ['-g', 'GENERAL.CONNECTION', 'device', 'show', safeIface], {
              encoding: 'utf8'
            }).trim()

            if (rConnName) {
              const safeRConn = sanitizeInterfaceName(rConnName)
              execFileSync('nmcli', ['connection', 'modify', safeRConn, 'ipv6.dhcp-duid', duidHex], {
                stdio: 'pipe'
              })
              execFileSync('nmcli', ['connection', 'down', safeRConn], { stdio: 'pipe' })
              execFileSync('nmcli', ['connection', 'up', safeRConn], { stdio: 'pipe' })
            }
          } catch (e) { /* NM restore is best-effort */ }
        }
        break
      }
    }

    return true
  },

  /**
   * Reset DUID to system default (generates NEW DUID, not original)
   * Use restoreDUID() to get the original back
   */
  resetDUID (iface = null) {
    const safeIface = iface ? sanitizeInterfaceName(iface) : null
    const client = this.detectDHCPClient()

    switch (client) {
      case 'systemd': {
        // Remove custom DUID configuration
        const files = [
          path.join(this.SYSTEMD_DUID_PATH, '00-duid.conf'),
          safeIface ? path.join(this.SYSTEMD_DUID_PATH, safeIface + '.network') : null
        ].filter(Boolean)

        files.forEach(function (f) {
          if (fs.existsSync(f)) {
            fs.unlinkSync(f)
          }
        })

        try {
          execFileSync('systemctl', ['restart', 'systemd-networkd'], { stdio: 'pipe' })
        } catch (e) { /* best-effort restart */ }
        break
      }

      case 'dhclient': {
        if (fs.existsSync(this.DHCLIENT_CONF)) {
          let dhResetContent = fs.readFileSync(this.DHCLIENT_CONF, 'utf8')
          dhResetContent = dhResetContent.replace(/send\s+dhcp6\.client-id\s+[^;]+;/g, '')
          fs.writeFileSync(this.DHCLIENT_CONF, dhResetContent)
        }
        break
      }

      case 'networkmanager': {
        if (safeIface) {
          try {
            const resetConnName = execFileSync('nmcli', ['-g', 'GENERAL.CONNECTION', 'device', 'show', safeIface], {
              encoding: 'utf8'
            }).trim()

            if (resetConnName) {
              const safeResetConn = sanitizeInterfaceName(resetConnName)
              // Reset to default (stable)
              execFileSync('nmcli', ['connection', 'modify', safeResetConn, 'ipv6.dhcp-duid', 'stable-llt'], {
                stdio: 'pipe'
              })
            }
          } catch (e) { /* NM reset is best-effort */ }
        }
        break
      }
    }

    return true
  }
}

// =============================================================================
// Windows Implementation
// =============================================================================

const windows = {
  REGISTRY_PATH: 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\Tcpip6\\Parameters',

  /**
   * Get current DUID on Windows
   */
  getCurrentDUID () {
    try {
      const output = execFileSync('reg', [
        'query', this.REGISTRY_PATH, '/v', 'Dhcpv6DUID'
      ], { encoding: 'utf8', stdio: 'pipe' })

      // Parse REG_BINARY output
      const match = output.match(/Dhcpv6DUID\s+REG_BINARY\s+([0-9A-Fa-f]+)/)
      if (match) {
        return Buffer.from(match[1], 'hex')
      }
    } catch (e) {}
    return null
  },

  /**
   * Backup original DUID (only once, preserves the true original)
   */
  backupOriginal () {
    const current = this.getCurrentDUID()
    if (current) {
      const stored = storeOriginalDUID(current)
      return stored
    }
    return false
  },

  /**
   * Set DUID on Windows
   */
  setDUID (duid, iface = null) {
    // Store original DUID if this is the first time spoofing
    this.backupOriginal()

    const duidHex = duid.toString('hex').toUpperCase()
    // Validate duidHex is purely hex to prevent registry injection
    if (!/^[0-9A-F]+$/.test(duidHex)) {
      throw new Error('Invalid DUID hex data')
    }

    // Set registry value using execFileSync with args array
    try {
      execFileSync('reg', ['add', this.REGISTRY_PATH, '/v', 'Dhcpv6DUID', '/t', 'REG_BINARY', '/d', duidHex, '/f'], {
        stdio: 'pipe'
      })
    } catch (e) {
      throw new Error('Failed to set DUID. Make sure you are running as Administrator.')
    }

    // Restart IPv6 on the interface
    this._restartIPv6(iface)

    return true
  },

  /**
   * Restore DUID to the original (pre-spoofing) value
   */
  restoreDUID (iface = null) {
    const original = getOriginalDUID()

    if (!original) {
      return false // No original stored
    }

    // Check if we're already at original
    const current = this.getCurrentDUID()
    if (current && current.equals(original)) {
      return 'not_spoofed' // Already at original
    }

    const duidHex = original.toString('hex').toUpperCase()

    // Set registry value using execFileSync
    try {
      execFileSync('reg', ['add', this.REGISTRY_PATH, '/v', 'Dhcpv6DUID', '/t', 'REG_BINARY', '/d', duidHex, '/f'], {
        stdio: 'pipe'
      })
    } catch (e) {
      throw new Error('Failed to restore DUID. Make sure you are running as Administrator.')
    }

    // Restart IPv6 on the interface
    this._restartIPv6(iface)

    return true
  },

  /**
   * Reset DUID (delete registry key, system will regenerate)
   * Note: This generates a NEW DUID, not the original. Use restoreDUID() to get original back.
   */
  resetDUID (iface = null) {
    try {
      execFileSync('reg', ['delete', this.REGISTRY_PATH, '/v', 'Dhcpv6DUID', '/f'], { stdio: 'pipe' })
    } catch (e) {
      // May not exist, which is fine
    }

    // Restart IPv6 to trigger regeneration
    this._restartIPv6(iface)

    return true
  },

  /**
   * Safely restart IPv6 on a Windows interface using execFileSync (no shell injection)
   */
  _restartIPv6 (iface) {
    if (!iface) return
    const safeIface = sanitizeInterfaceName(iface)
    try {
      execFileSync('netsh', ['interface', 'ipv6', 'set', 'interface', safeIface, 'disabled'], { stdio: 'pipe' })
      execFileSync('netsh', ['interface', 'ipv6', 'set', 'interface', safeIface, 'enabled'], { stdio: 'pipe' })
    } catch (e) {
      // Try PowerShell method as fallback (using execFileSync to bypass cmd.exe)
      const escaped = escapePowerShell(safeIface)
      const psCmd = "Disable-NetAdapterBinding -Name '" + escaped + "' -ComponentID ms_tcpip6; Enable-NetAdapterBinding -Name '" + escaped + "' -ComponentID ms_tcpip6"
      try {
        execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', psCmd], { stdio: 'pipe' })
      } catch (e2) { /* IPv6 restart is best-effort */ }
    }
  }
}

// =============================================================================
// Cross-platform API
// =============================================================================

/**
 * Get platform-specific implementation
 */
function getPlatformImpl () {
  switch (platform) {
    case 'darwin':
      return macos
    case 'linux':
      return linux
    case 'win32':
      return windows
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
}

/**
 * Get current DUID
 * @returns {Buffer|null}
 */
function getCurrentDUID () {
  return getPlatformImpl().getCurrentDUID()
}

// sleepSync and retry are now imported from ./utils

/**
 * Set a new DUID with verification
 * @param {Buffer|string} duid - DUID buffer or hex string
 * @param {string} [iface] - Network interface
 * @param {boolean} [verify=true] - Whether to verify the change
 * @returns {Buffer} The DUID that was set
 */
function setDUID (duid, iface = null, verify = true) {
  const duidBuf = Buffer.isBuffer(duid) ? duid : hexToDuid(duid)

  // Set the DUID
  getPlatformImpl().setDUID(duidBuf, iface)

  // Verify the change if requested
  if (verify) {
    let newDuid = null
    let retryErr = null
    let fallbackErr = null

    try {
      // Retry verification with exponential backoff (DUID changes may take time to propagate)
      newDuid = retry(function () {
        const current = getCurrentDUID()
        if (!current) {
          throw new Error('DUID not found after setting')
        }
        return current
      }, 3, 1000)
    } catch (err) {
      retryErr = err
      // If verification fails, try one more time after a longer delay
      try {
        sleepSync(2000)
        newDuid = getCurrentDUID()
      } catch (e) {
        fallbackErr = e
      }
    }

    if (!newDuid) {
      // Report both errors for accurate debugging
      let errMsg = 'DUID change verification failed. ' +
        'Expected: ' + formatDUID(duidBuf) + ', but could not read current DUID. ' +
        'The DUID may have been set but verification failed.'
      if (retryErr) errMsg += ' Retry error: ' + retryErr.message + '.'
      if (fallbackErr) errMsg += ' Fallback error: ' + fallbackErr.message + '.'
      throw new Error(errMsg)
    }

    // Compare DUIDs (handle both Buffer and hex string comparison)
    const expectedHex = duidBuf.toString('hex').toLowerCase()
    const actualHex = newDuid.toString('hex').toLowerCase()

    if (actualHex !== expectedHex) {
      throw new Error(
        'DUID change verification failed. ' +
        'Expected: ' + formatDUID(duidBuf) + ', but got: ' + formatDUID(newDuid) + '. ' +
        'The DUID may not have been set correctly.'
      )
    }
  }

  return duidBuf
}

/**
 * Randomize DUID
 * @param {number} [type] - DUID type (default: DUID-LL)
 * @param {string} [iface] - Network interface
 * @param {string} [mac] - Optional MAC address to base DUID on
 * @param {boolean} [verify=true] - Whether to verify the change
 */
function randomizeDUID (type = DUID_TYPES.DUID_LL, iface = null, mac = null, verify = true) {
  const duid = generateDUID(type, mac)
  setDUID(duid, iface, verify)
  return duid
}

/**
 * Restore DUID from backup
 * @param {string} [iface] - Network interface
 * @param {boolean} [verify=true] - Whether to verify the change
 */
function restoreDUID (iface = null, verify = true) {
  const original = getOriginalDUID()
  if (!original) {
    return false // No original stored
  }

  const result = getPlatformImpl().restoreDUID(iface)

  // Verify the change if requested and restore was successful
  if (verify && result === true) {
    let newDuid
    try {
      // Retry verification with exponential backoff
      newDuid = retry(() => {
        const current = getCurrentDUID()
        if (!current) {
          throw new Error('DUID not found after restore')
        }
        return current
      }, 3, 1000)
    } catch (err) {
      // Wait a bit longer and try once more
      sleepSync(2000)
      newDuid = getCurrentDUID()
      if (!newDuid) {
        throw new Error(
          'DUID restore verification failed. ' +
          'Expected to restore original DUID, but could not read current DUID. ' +
          `Original error: ${err.message}`
        )
      }
    }

    // Verify it matches the original
    const expectedHex = original.toString('hex').toLowerCase()
    const actualHex = newDuid.toString('hex').toLowerCase()

    if (actualHex !== expectedHex) {
      throw new Error(
        'DUID restore verification failed. ' +
        `Expected: ${formatDUID(original)}, but got: ${formatDUID(newDuid)}. ` +
        'The DUID may not have been restored correctly.'
      )
    }
  }

  return result
}

/**
 * Reset DUID to system default
 * @param {string} [iface] - Network interface
 */
function resetDUID (iface = null) {
  return getPlatformImpl().resetDUID(iface)
}

/**
 * Parse DUID buffer and return info
 * @param {Buffer} duid
 * @returns {object}
 */
function parseDUID (duid) {
  if (!duid || duid.length < 2) {
    return { type: 'unknown', raw: duid }
  }

  const type = duid.readUInt16BE(0)
  const result = {
    type,
    typeName: Object.keys(DUID_TYPES).find(k => DUID_TYPES[k] === type) || 'unknown',
    raw: formatDUID(duid)
  }

  switch (type) {
    case DUID_TYPES.DUID_LLT:
      if (duid.length >= 14) {
        result.hwType = duid.readUInt16BE(2)
        result.time = duid.readUInt32BE(4)
        result.timeDate = new Date((result.time + 946684800) * 1000)
        result.lladdr = Array.from(duid.slice(8, 14))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(':')
      }
      break

    case DUID_TYPES.DUID_EN:
      if (duid.length >= 6) {
        result.enterpriseNumber = duid.readUInt32BE(2)
        result.identifier = duid.slice(6).toString('hex')
      }
      break

    case DUID_TYPES.DUID_LL:
      if (duid.length >= 10) {
        result.hwType = duid.readUInt16BE(2)
        result.lladdr = Array.from(duid.slice(4, 10))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(':')
      }
      break

    case DUID_TYPES.DUID_UUID:
      if (duid.length >= 18) {
        const uuid = duid.slice(2, 18)
        result.uuid = [
          uuid.slice(0, 4).toString('hex'),
          uuid.slice(4, 6).toString('hex'),
          uuid.slice(6, 8).toString('hex'),
          uuid.slice(8, 10).toString('hex'),
          uuid.slice(10, 16).toString('hex')
        ].join('-')
      }
      break
  }

  return result
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  // Constants
  DUID_TYPES,

  // Generation
  generateDUID,
  generateRandomMAC,
  getCurrentMACAddress,

  // Conversion utilities
  duidToHex,
  hexToDuid,
  formatDUID,
  parseDUID,

  // Original DUID management
  getOriginalDUID,
  hasOriginalDUID,
  storeOriginalDUID,
  clearOriginalDUID,
  getOriginalDUIDPath,

  // Cross-platform API
  getCurrentDUID,
  setDUID,
  randomizeDUID,
  restoreDUID,
  resetDUID,
  syncDUID,

  // Platform-specific (for advanced use)
  platforms: {
    macos,
    linux,
    windows
  }
}
