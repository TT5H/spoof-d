/*! spoof. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> */
module.exports = {
  findInterface,
  findInterfaces,
  normalize,
  randomize,
  setInterfaceMAC,
  getInterfaceMAC,
  validateMAC,
  duid: require("./lib/duid"),
};

/**
 * Validates a MAC address format
 * @param {string} mac
 * @return {Object} {valid: boolean, normalized: string|null, error: string|null}
 */
function validateMAC(mac) {
  if (!mac || typeof mac !== "string") {
    return {
      valid: false,
      normalized: null,
      error: "MAC address must be a non-empty string",
    };
  }
  
  const normalized = normalize(mac);
  if (!normalized) {
    return {
      valid: false,
      normalized: null,
      error: "Invalid MAC address format",
    };
  }
  
  // Check for invalid addresses
  if (normalized === "00:00:00:00:00:00" || normalized === "FF:FF:FF:FF:FF:FF") {
    return {
      valid: false,
      normalized: normalized,
      error: "Cannot be all zeros or broadcast address",
    };
  }
  
  return {
    valid: true,
    normalized: normalized,
    error: null,
  };
}

const cp = require("child_process");
const quote = require("shell-quote").quote;
const zeroFill = require("zero-fill");

/**
 * Custom error classes for better error handling
 */
class SpoofyError extends Error {
  constructor(message, code, suggestions = []) {
    super(message);
    this.name = "SpoofyError";
    this.code = code;
    this.suggestions = suggestions;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends SpoofyError {
  constructor(message, suggestions = []) {
    super(message, "VALIDATION_ERROR", suggestions);
    this.name = "ValidationError";
  }
}

class PermissionError extends SpoofyError {
  constructor(message, suggestions = []) {
    super(message, "PERMISSION_ERROR", suggestions);
    this.name = "PermissionError";
  }
}

class NetworkError extends SpoofyError {
  constructor(message, suggestions = []) {
    super(message, "NETWORK_ERROR", suggestions);
    this.name = "NetworkError";
  }
}

class PlatformError extends SpoofyError {
  constructor(message, suggestions = []) {
    super(message, "PLATFORM_ERROR", suggestions);
    this.name = "PlatformError";
  }
}

/**
 * Escapes a string for use in PowerShell commands
 * @param {string} str
 * @return {string}
 */
function escapePowerShell(str) {
  return str.replace(/'/g, "''").replace(/"/g, '`"');
}

/**
 * Executes a command with timeout and better error handling
 * @param {string} command
 * @param {Object} options
 * @param {number} timeout
 * @return {string}
 */
function execWithTimeout(command, options = {}, timeout = 30000) {
  try {
    return cp.execSync(command, {
      ...options,
      timeout: timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    }).toString();
  } catch (err) {
    if (err.signal === "SIGTERM") {
      throw new NetworkError(
        `Command timed out after ${timeout}ms: ${command.substring(0, 50)}...`,
        ["Try again with a slower network connection", "Check if the interface is busy"]
      );
    }
    throw err;
  }
}

/**
 * Synchronous sleep using Atomics.wait (non-blocking alternative to busy-wait)
 * Falls back to busy-wait only if SharedArrayBuffer is not available
 * @param {number} ms - Milliseconds to sleep
 */
function sleepSync(ms) {
  if (typeof SharedArrayBuffer !== 'undefined') {
    const sab = new SharedArrayBuffer(4);
    const int32 = new Int32Array(sab);
    Atomics.wait(int32, 0, 0, ms);
  } else {
    // Fallback for environments without SharedArrayBuffer
    const end = Date.now() + ms;
    while (Date.now() < end) {
      // Busy wait fallback
    }
  }
}

/**
 * Retries a function with exponential backoff
 * @param {Function} fn
 * @param {number} maxRetries
 * @param {number} delay
 * @return {any}
 */
function retry(fn, maxRetries = 3, delay = 500) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return fn();
    } catch (err) {
      lastError = err;
      if (i < maxRetries - 1) {
        const waitTime = delay * Math.pow(2, i);
        sleepSync(waitTime);
      }
    }
  }
  throw lastError;
}

/**
 * Parses PowerShell error output for better error messages
 * @param {string} errorOutput
 * @return {string}
 */
function parsePowerShellError(errorOutput) {
  if (!errorOutput) return "Unknown PowerShell error";
  
  // Try to extract meaningful error messages
  const errorMatch = errorOutput.match(/Error:\s*(.+?)(?:\r?\n|$)/i);
  if (errorMatch) {
    return errorMatch[1].trim();
  }
  
  // Try to find exception messages
  const exceptionMatch = errorOutput.match(/Exception:\s*(.+?)(?:\r?\n|$)/i);
  if (exceptionMatch) {
    return exceptionMatch[1].trim();
  }
  
  // Return first non-empty line
  const lines = errorOutput.split(/\r?\n/).filter(line => line.trim());
  if (lines.length > 0) {
    return lines[0].trim();
  }
  
  return errorOutput.trim();
}

// Regex to validate a MAC address
// Example: 00-00-00-00-00-00 or 00:00:00:00:00:00 or 000000000000
const MAC_ADDRESS_RE =
  /([0-9A-F]{1,2})[:-]?([0-9A-F]{1,2})[:-]?([0-9A-F]{1,2})[:-]?([0-9A-F]{1,2})[:-]?([0-9A-F]{1,2})[:-]?([0-9A-F]{1,2})/i;

// Regex to validate a MAC address in cisco-style
// Example: 0123.4567.89ab
const CISCO_MAC_ADDRESS_RE =
  /([0-9A-F]{0,4})\.([0-9A-F]{0,4})\.([0-9A-F]{0,4})/i;

/**
 * Returns the list of interfaces found on this machine as reported by the
 * `networksetup` command.
 * @param {Array.<string>|null} targets
 * @return {Array.<Object>}
 */
function findInterfaces(targets) {
  if (!targets) targets = [];

  targets = targets.map((target) => target.toLowerCase());

  try {
    if (process.platform === "darwin") {
      return findInterfacesDarwin(targets);
    } else if (process.platform === "linux") {
      return findInterfacesLinux(targets);
    } else if (process.platform === "win32") {
      return findInterfacesWin32(targets);
    } else {
      throw new Error(
        `Unsupported platform: ${process.platform}. ` +
        "Supported platforms: darwin (macOS), linux, win32 (Windows)"
      );
    }
  } catch (err) {
    // Provide better error messages
    if (err.message.includes("spawn") || err.message.includes("ENOENT")) {
      const suggestions = [];
      if (process.platform === "linux") {
        suggestions.push("Install iproute2: sudo apt-get install iproute2 (Debian/Ubuntu) or sudo yum install iproute (RHEL/CentOS)");
      } else if (process.platform === "win32") {
        suggestions.push("Ensure PowerShell is installed and available in PATH");
      }
      throw new PlatformError(
        `Failed to execute system command. ` +
        `Platform: ${process.platform}. ` +
        `Error: ${err.message}`,
        suggestions
      );
    }
    throw err;
  }
}

function findInterfacesDarwin(targets) {
  // Parse the output of `networksetup -listallhardwareports` which gives
  // us 3 fields per port:
  // - the port name,
  // - the device associated with this port, if any,
  // - the MAC address, if any, otherwise 'N/A'

  let output = cp.execSync("networksetup -listallhardwareports").toString();

  const details = [];
  while (true) {
    const result = /(?:Hardware Port|Device|Ethernet Address): (.+)/.exec(
      output
    );
    if (!result || !result[1]) {
      break;
    }
    details.push(result[1]);
    output = output.slice(result.index + result[1].length);
  }

  const interfaces = []; // to return

  // Split the results into chunks of 3 (for our three fields) and yield
  // those that match `targets`.
  for (let i = 0; i < details.length; i += 3) {
    const port = details[i];
    const device = details[i + 1];
    let address = details[i + 2];

    address = MAC_ADDRESS_RE.exec(address.toUpperCase());
    if (address) {
      address = normalize(address[0]);
    }

    const it = {
      address: address,
      currentAddress: getInterfaceMAC(device),
      device: device,
      port: port,
    };

    if (targets.length === 0) {
      // Not trying to match anything in particular, return everything.
      interfaces.push(it);
      continue;
    }

    for (let j = 0; j < targets.length; j++) {
      const target = targets[j];
      if (target === port.toLowerCase() || target === device.toLowerCase()) {
        interfaces.push(it);
        break;
      }
    }
  }

  return interfaces;
}

function findInterfacesLinux(targets) {
  // Use modern `ip link` command instead of deprecated `ifconfig`
  let output;
  try {
    output = cp.execSync("ip -o link show", { stdio: "pipe" }).toString();
  } catch (err) {
    // Fallback to ifconfig if ip command is not available
    try {
      output = cp.execSync("ifconfig", { stdio: "pipe" }).toString();
      return findInterfacesLinuxLegacy(output, targets);
    } catch (err2) {
      return [];
    }
  }

  const interfaces = [];
  const lines = output.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Parse: <index>: <name>: <flags> ... link/ether <mac> ...
    const match = /^\d+:\s+([^:]+):\s+.*?\s+link\/ether\s+([0-9a-f:]+)/i.exec(line);
    if (!match) continue;

    const device = match[1].trim();
    let address = match[2] ? normalize(match[2]) : null;

    const it = {
      address: address,
      currentAddress: getInterfaceMAC(device),
      device: device,
      port: device, // Linux doesn't have port names like macOS
    };

    if (targets.length === 0) {
      interfaces.push(it);
      continue;
    }

    for (let j = 0; j < targets.length; j++) {
      const target = targets[j];
      if (target === device.toLowerCase()) {
        interfaces.push(it);
        break;
      }
    }
  }

  return interfaces;
}

function findInterfacesLinuxLegacy(output, targets) {
  // Legacy ifconfig parsing (fallback)
  const details = [];
  while (true) {
    const result = /(.*?)HWaddr(.*)/im.exec(output);
    if (!result || !result[1] || !result[2]) {
      break;
    }
    details.push(result[1], result[2]);
    output = output.slice(result.index + result[0].length);
  }

  const interfaces = [];

  for (let i = 0; i < details.length; i += 2) {
    const s = details[i].split(":");

    let device, port;
    if (s.length >= 2) {
      device = s[0].split(" ")[0];
      port = s[1].trim();
    }

    let address = details[i + 1].trim();
    if (address) {
      address = normalize(address);
    }

    const it = {
      address: address,
      currentAddress: getInterfaceMAC(device),
      device: device,
      port: port || device,
    };

    if (targets.length === 0) {
      interfaces.push(it);
      continue;
    }

    for (let j = 0; j < targets.length; j++) {
      const target = targets[j];
      if (target === (port || device).toLowerCase() || target === device.toLowerCase()) {
        interfaces.push(it);
        break;
      }
    }
  }

  return interfaces;
}

function findInterfacesWin32(targets) {
  // Use PowerShell Get-NetAdapter for better reliability
  let interfaces = [];
  
  try {
    const psCommand = `Get-NetAdapter | Select-Object Name, InterfaceDescription, MacAddress, Status | ConvertTo-Json -Compress`;
    const output = cp
      .execSync(
        `powershell -Command "${psCommand}"`,
        { stdio: "pipe", shell: true }
      )
      .toString()
      .trim();

    // Parse JSON output
    const adapters = JSON.parse(output);
    const adapterArray = Array.isArray(adapters) ? adapters : [adapters];

    for (const adapter of adapterArray) {
      if (!adapter || !adapter.Name) continue;

      const it = {
        address: adapter.MacAddress ? normalize(adapter.MacAddress) : null,
        currentAddress: adapter.MacAddress ? normalize(adapter.MacAddress) : null,
        device: adapter.Name,
        port: adapter.InterfaceDescription || adapter.Name,
        description: adapter.InterfaceDescription,
        status: adapter.Status,
      };

      if (targets.length === 0) {
        interfaces.push(it);
        continue;
      }

      for (let j = 0; j < targets.length; j++) {
        const target = targets[j];
        if (
          target === it.port.toLowerCase() ||
          target === it.device.toLowerCase() ||
          (it.description && target === it.description.toLowerCase())
        ) {
          interfaces.push(it);
          break;
        }
      }
    }
  } catch (err) {
    // Fallback to ipconfig method if PowerShell fails
    const output = cp.execSync("ipconfig /all", { stdio: "pipe" }).toString();
    const lines = output.split("\n");
    let it = false;
    
    for (let i = 0; i < lines.length; i++) {
      // Check if new device
      let result;
      if (lines[i].substr(0, 1).match(/[A-Z]/)) {
        if (it) {
          if (targets.length === 0) {
            interfaces.push(it);
          } else {
            for (let j = 0; j < targets.length; j++) {
              const target = targets[j];
              if (
                target === it.port.toLowerCase() ||
                target === it.device.toLowerCase()
              ) {
                interfaces.push(it);
                break;
              }
            }
          }
        }

        it = {
          port: "",
          device: "",
        };

        result = /adapter (.+?):/.exec(lines[i]);
        if (!result) {
          continue;
        }

        it.device = result[1];
      }

      if (!it) {
        continue;
      }

      // Try to find address
      result = /Physical Address.+?:(.*)/im.exec(lines[i]);
      if (result) {
        it.address = normalize(result[1].trim());
        it.currentAddress = it.address;
        continue;
      }

      // Try to find description
      result = /description.+?:(.*)/im.exec(lines[i]);
      if (result) {
        it.description = result[1].trim();
        it.port = it.description || it.device;
        continue;
      }
    }
    
    // Add the last interface
    if (it) {
      if (targets.length === 0) {
        interfaces.push(it);
      } else {
        for (let j = 0; j < targets.length; j++) {
          const target = targets[j];
          if (
            target === it.port.toLowerCase() ||
            target === it.device.toLowerCase()
          ) {
            interfaces.push(it);
            break;
          }
        }
      }
    }
  }

  return interfaces;
}

/**
 * Returns the first interface which matches `target`
 * @param  {string} target
 * @return {Object}
 */
function findInterface(target) {
  const interfaces = findInterfaces([target]);
  return interfaces && interfaces[0];
}

/**
 * Returns currently-set MAC address of given interface. This is distinct from the
 * interface's hardware MAC address.
 * @return {string}
 */
function getInterfaceMAC(device) {
  if (process.platform === "darwin" || process.platform === "linux") {
    let output;
    try {
      output = cp
        .execSync(quote(["ifconfig", device]), { stdio: "pipe" })
        .toString();
    } catch (err) {
      return null;
    }

    const address = MAC_ADDRESS_RE.exec(output);
    return address && normalize(address[0]);
  } else if (process.platform === "win32") {
    // Use PowerShell to get current MAC address
    try {
      const escapedDevice = escapePowerShell(device);
      const psCommand = `Get-NetAdapter -Name '${escapedDevice}' | Select-Object -ExpandProperty MacAddress`;
      const output = cp
        .execSync(
          `powershell -Command "${psCommand}"`,
          { stdio: "pipe", shell: true }
        )
        .toString()
        .trim();
      
      if (output) {
        return normalize(output);
      }
    } catch (err) {
      // Fallback to ipconfig method
      try {
        const output = cp
          .execSync(`ipconfig /all`, { stdio: "pipe" })
          .toString();
        const regex = new RegExp(
          `adapter ${device.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:[\\s\\S]*?Physical Address[\\s\\S]*?:\\s*([0-9A-F-]+)`,
          "i"
        );
        const match = regex.exec(output);
        if (match && match[1]) {
          return normalize(match[1]);
        }
      } catch (err2) {
        return null;
      }
    }
    return null;
  }
}

/**
 * Sets the mac address for given `device` to `mac`.
 *
 * Device varies by platform:
 *   OS X, Linux: this is the interface name in ifconfig
 *   Windows: this is the network adapter name in ipconfig
 *
 * @param {string} device
 * @param {string} mac
 * @param {string=} port
 */
async function setInterfaceMAC(device, mac, port, nmOptions = null) {
  // Validate MAC address format
  if (!mac || typeof mac !== "string") {
    throw new ValidationError("MAC address must be a non-empty string");
  }
  
  const normalizedMac = normalize(mac);
  if (!normalizedMac) {
    throw new ValidationError(
      `"${mac}" is not a valid MAC address. ` +
      "Expected format: XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX",
      [
        "Use colons (:) or dashes (-) as separators",
        "Each byte must be a valid hexadecimal value (00-FF)",
        "Example: 00:11:22:33:44:55"
      ]
    );
  }

  // Validate MAC address is not all zeros or broadcast
  if (normalizedMac === "00:00:00:00:00:00" || normalizedMac === "FF:FF:FF:FF:FF:FF") {
    throw new ValidationError(
      `"${normalizedMac}" is not a valid MAC address (cannot be all zeros or broadcast address)`,
      ["Generate a random MAC address using: spoofy randomize"]
    );
  }

  // Validate device name
  if (!device || typeof device !== "string" || device.trim().length === 0) {
    throw new ValidationError(
      "Device name must be a non-empty string",
      ["List available devices using: spoofy list"]
    );
  }

  // Use normalized MAC address
  mac = normalizedMac;

  const isWirelessPort = port && port.toLowerCase() === "wi-fi";

  if (process.platform === "darwin") {
    let macChangeError = null;

    if (isWirelessPort) {
      // On modern macOS (Sequoia 15.4+, Tahoe 26+), WiFi MAC can only be changed
      // in the brief window after WiFi is powered on but before it connects to a network.
      // We must NOT use ifconfig down as it causes "Network is down" errors.
      try {
        cp.execSync(quote(["networksetup", "-setairportpower", device, "off"]));
        cp.execSync(quote(["networksetup", "-setairportpower", device, "on"]));
        // Change MAC immediately in the window before auto-join
        cp.execFileSync("ifconfig", [device, "ether", mac]);
      } catch (err) {
        macChangeError = err;
      }

      try {
        cp.execSync(quote(["networksetup", "-detectnewhardware"]));
      } catch (err) {
        // Ignore
      }
    } else {
      // Non-WiFi interfaces: standard down/change/up sequence
      try {
        cp.execFileSync("ifconfig", [device, "down"]);
      } catch (err) {
        macChangeError = new Error(
          "Unable to bring interface down: " + err.message
        );
      }

      if (!macChangeError) {
        try {
          cp.execFileSync("ifconfig", [device, "ether", mac]);
        } catch (err) {
          macChangeError = err;
        }
      }

      try {
        cp.execFileSync("ifconfig", [device, "up"]);
      } catch (err) {
        if (!macChangeError) {
          macChangeError = new Error(
            "Unable to bring interface up: " + err.message
          );
        }
      }
    }

    if (macChangeError) {
      // Verify if the change actually took effect
      const newMac = getInterfaceMAC(device);
      if (newMac && newMac.toLowerCase() === mac.toLowerCase()) {
        // Change succeeded despite error
        return;
      }
      
      throw new NetworkError(
        `Unable to change MAC address on ${device}: ${macChangeError.message}`,
        [
          "Ensure you have root privileges (use sudo)",
          "On macOS, you may need to disconnect from WiFi networks first",
          "Try disabling and re-enabling the interface manually",
          "Some network adapters may not support MAC address changes (hardware limitation)"
        ]
      );
    }
    
    // Verify the change took effect
    const newMac = getInterfaceMAC(device);
    if (newMac && newMac.toLowerCase() !== mac.toLowerCase()) {
      throw new NetworkError(
        `MAC address change verification failed. Expected ${mac}, but got ${newMac}`,
        [
          "The change may not have taken effect",
          "Try running the command again",
          "On macOS, you may need to reconnect to WiFi after the change"
        ]
      );
    }
  } else if (process.platform === "linux") {
    // Modern Linux support using ip link commands
    let macChangeError = null;
    
    try {
      // Bring interface down
      cp.execFileSync("ip", ["link", "set", device, "down"]);
    } catch (err) {
      macChangeError = new Error(
        "Unable to bring interface down: " + err.message
      );
    }

    if (!macChangeError) {
      try {
        // Set MAC address using ip link
        cp.execFileSync("ip", ["link", "set", device, "address", mac]);
      } catch (err) {
        macChangeError = err;
      }
    }

    try {
      // Bring interface back up
      cp.execFileSync("ip", ["link", "set", device, "up"]);
    } catch (err) {
      if (!macChangeError) {
        macChangeError = new Error(
          "Unable to bring interface up: " + err.message
        );
      }
    }

    if (macChangeError) {
      // Verify if the change actually took effect
      const newMac = getInterfaceMAC(device);
      if (newMac && newMac.toLowerCase() === mac.toLowerCase()) {
        // Change succeeded despite error
        return;
      }
      
      throw new NetworkError(
        `Unable to change MAC address on ${device}: ${macChangeError.message}`,
        [
          "Ensure you have root privileges (use sudo)",
          "Check if the interface is currently in use",
          "Some network adapters may not support MAC address changes"
        ]
      );
    }
    
    // Verify the change took effect
    const newMac = getInterfaceMAC(device);
    if (newMac && newMac.toLowerCase() !== mac.toLowerCase()) {
      throw new NetworkError(
        `MAC address change verification failed. Expected ${mac}, but got ${newMac}`,
        [
          "The change may not have taken effect",
          "Try running the command again",
          "Some adapters require a restart to apply MAC changes"
        ]
      );
    }
    
    // Handle NetworkManager reconnection if requested
    if (nmOptions && nmOptions.reconnect) {
      const nm = require("./lib/networkmanager");
      try {
        // Small delay to ensure MAC change is fully applied
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (nmOptions.force) {
          // Force reconnect by toggling networking (use with caution)
          await nm.toggleNMNetworking(false, 20000);
          await new Promise(resolve => setTimeout(resolve, 1000));
          await nm.toggleNMNetworking(true, 20000);
        } else {
          // Normal reconnect
          await nm.reconnectNMDevice(device, 20000);
        }
      } catch (err) {
        // Log but don't fail - MAC change succeeded
        console.warn(`Warning: NetworkManager reconnection failed: ${err.message}`);
        console.warn("  The MAC address change was successful, but NetworkManager may need manual reconnection.");
      }
    }
  } else if (process.platform === "win32") {
    // Windows support using PowerShell and registry
    let macChangeError = null;
    
    // Convert MAC address to Windows format (no colons, no dashes)
    const macNoSeparators = mac.replace(/[:-]/g, "");
    
    try {
      // Method 1: Try using PowerShell Set-NetAdapter (Windows 8+)
      const escapedDevice = escapePowerShell(device);
      const escapedMac = escapePowerShell(mac);
      const psCommand = `$ErrorActionPreference = 'Stop'; try { $adapter = Get-NetAdapter -Name '${escapedDevice}' -ErrorAction Stop; if ($adapter) { $adapter | Set-NetAdapter -MacAddress '${escapedMac}' -ErrorAction Stop; Write-Host 'Success' } else { throw 'Adapter not found: ${escapedDevice}' } } catch { Write-Error $_.Exception.Message; exit 1 }`;
      try {
        execWithTimeout(
          `powershell -Command "${psCommand}"`,
          { shell: true },
          30000
        );
      } catch (err) {
        const errorMsg = parsePowerShellError(err.stderr ? err.stderr.toString() : err.message);
        // Method 2: Fallback to registry method
        // Get adapter registry path
        const getGuidCommand = `$ErrorActionPreference = 'Stop'; try { Get-NetAdapter -Name '${escapedDevice}' -ErrorAction Stop | Select-Object -ExpandProperty InterfaceGuid } catch { Write-Error $_.Exception.Message; exit 1 }`;
        let guidOutput;
        try {
          guidOutput = execWithTimeout(
            `powershell -Command "${getGuidCommand}"`,
            { shell: true },
            30000
          ).toString().trim();
        } catch (err) {
          const errorMsg = parsePowerShellError(err.stderr ? err.stderr.toString() : err.message);
          throw new NetworkError(
            `Could not find adapter "${device}": ${errorMsg}`,
            [
              "List available adapters using: spoofy list",
              "Ensure the adapter name is correct (case-sensitive)",
              "Check if the adapter is enabled"
            ]
          );
        }

        if (!guidOutput || guidOutput.toLowerCase().includes("error")) {
          throw new NetworkError(
            `Could not find adapter GUID for "${device}"`,
            [
              "The adapter may not exist or may be disabled",
              "List available adapters using: spoofy list"
            ]
          );
        }

        // Disable adapter
        const disableCommand = `$ErrorActionPreference = 'Stop'; try { Disable-NetAdapter -Name '${escapedDevice}' -Confirm:$false -ErrorAction Stop } catch { Write-Error $_.Exception.Message; exit 1 }`;
        try {
          execWithTimeout(
            `powershell -Command "${disableCommand}"`,
            { shell: true },
            30000
          );
        } catch (err) {
          const errorMsg = parsePowerShellError(err.stderr ? err.stderr.toString() : err.message);
          throw new NetworkError(
            `Could not disable adapter "${device}": ${errorMsg}`,
            [
              "Ensure you have Administrator privileges",
              "The adapter may be in use by another application"
            ]
          );
        }

        // Set MAC address in registry
        const registryPath = `HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e972-e325-11ce-bfc1-08002be10318}`;
        const escapedGuid = escapePowerShell(guidOutput);
        const findGuidCommand = `$ErrorActionPreference = 'Stop'; try { $path = '${registryPath}'; Get-ChildItem -Path $path -ErrorAction Stop | Where-Object { (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).NetCfgInstanceId -eq '${escapedGuid}' } | Select-Object -ExpandProperty PSPath } catch { Write-Error $_.Exception.Message; exit 1 }`;
        let adapterPath;
        try {
          adapterPath = execWithTimeout(
            `powershell -Command "${findGuidCommand}"`,
            { shell: true },
            30000
          ).toString().trim();
        } catch (err) {
          // Re-enable adapter before throwing error
          try {
            execWithTimeout(
              `powershell -Command "Enable-NetAdapter -Name '${escapedDevice}' -Confirm:$false"`,
              { shell: true },
              10000
            );
          } catch (e) {
            // Ignore re-enable errors
          }
          const errorMsg = parsePowerShellError(err.stderr ? err.stderr.toString() : err.message);
          throw new NetworkError(
            `Could not find adapter registry path: ${errorMsg}`,
            [
              "The adapter may not support MAC address changes",
              "Try using the Set-NetAdapter method instead"
            ]
          );
        }

        if (!adapterPath || adapterPath.toLowerCase().includes("error")) {
          // Re-enable adapter before throwing error
          try {
            execWithTimeout(
              `powershell -Command "Enable-NetAdapter -Name '${escapedDevice}' -Confirm:$false"`,
              { shell: true },
              10000
            );
          } catch (e) {
            // Ignore re-enable errors
          }
          throw new NetworkError(
            `Could not find adapter registry path for "${device}"`,
            [
              "The adapter may not support MAC address changes via registry",
              "Try using a different method or adapter"
            ]
          );
        }

        // Set NetworkAddress registry value
        const escapedPath = escapePowerShell(adapterPath);
        const setMacCommand = `$ErrorActionPreference = 'Stop'; try { Set-ItemProperty -Path '${escapedPath}' -Name 'NetworkAddress' -Value '${macNoSeparators}' -ErrorAction Stop } catch { Write-Error $_.Exception.Message; exit 1 }`;
        try {
          execWithTimeout(
            `powershell -Command "${setMacCommand}"`,
            { shell: true },
            30000
          );
        } catch (err) {
          // Re-enable adapter before throwing error
          try {
            execWithTimeout(
              `powershell -Command "Enable-NetAdapter -Name '${escapedDevice}' -Confirm:$false"`,
              { shell: true },
              10000
            );
          } catch (e) {
            // Ignore re-enable errors
          }
          const errorMsg = parsePowerShellError(err.stderr ? err.stderr.toString() : err.message);
          throw new NetworkError(
            `Could not set MAC address in registry: ${errorMsg}`,
            [
              "Ensure you have Administrator privileges",
              "The adapter may not support MAC address changes"
            ]
          );
        }

        // Enable adapter
        const enableCommand = `$ErrorActionPreference = 'Stop'; try { Enable-NetAdapter -Name '${escapedDevice}' -Confirm:$false -ErrorAction Stop } catch { Write-Error $_.Exception.Message; exit 1 }`;
        try {
          execWithTimeout(
            `powershell -Command "${enableCommand}"`,
            { shell: true },
            30000
          );
        } catch (err) {
          const errorMsg = parsePowerShellError(err.stderr ? err.stderr.toString() : err.message);
          throw new NetworkError(
            `Could not re-enable adapter "${device}": ${errorMsg}. ` +
            "The adapter may need to be enabled manually.",
            [
              "Try enabling the adapter manually from Network Settings",
              "The MAC address may have been changed but adapter is disabled"
            ]
          );
        }
      }
    } catch (err) {
      macChangeError = err;
    }

    if (macChangeError) {
      // Verify if the change actually took effect
      const newMac = getInterfaceMAC(device);
      if (newMac && newMac.toLowerCase() === mac.toLowerCase()) {
        // Change succeeded despite error
        return;
      }
      
      const suggestions = [
        "Ensure you are running as Administrator",
        "Some network adapters may not support MAC address changes (hardware limitation)",
        "Try disabling and re-enabling the adapter manually",
        "Check if the adapter is in use by another application"
      ];
      
      if (macChangeError.message && macChangeError.message.includes("Permission")) {
        suggestions.unshift("Right-click PowerShell/CMD and select 'Run as Administrator'");
      }
      
      throw new NetworkError(
        `Unable to change MAC address on "${device}": ${macChangeError.message}`,
        suggestions
      );
    }
    
    // Verify the change took effect (with retry for Windows)
    let newMac;
    try {
      newMac = retry(() => getInterfaceMAC(device), 3, 1000);
    } catch (err) {
      // If we can't verify, assume it worked (better than failing)
      return;
    }
    
    if (newMac && newMac.toLowerCase() !== mac.toLowerCase()) {
      throw new NetworkError(
        `MAC address change verification failed. Expected ${mac}, but got ${newMac}`,
        [
          "The change may not have taken effect",
          "Try running the command again",
          "Some adapters require a restart to apply MAC changes",
          "The adapter may not support MAC address changes"
        ]
      );
    }
  }
}

/**
 * Generates and returns a random MAC address.
 * @param  {boolean} localAdmin  locally administered address
 * @return {string}
 */
function randomize(localAdmin) {
  // Randomly assign a VM vendor's MAC address prefix, which should
  // decrease chance of colliding with existing device's addresses.

  const vendors = [
    [0x00, 0x05, 0x69], // VMware
    [0x00, 0x50, 0x56], // VMware
    [0x00, 0x0c, 0x29], // VMware
    [0x00, 0x16, 0x3e], // Xen
    [0x00, 0x03, 0xff], // Microsoft Hyper-V, Virtual Server, Virtual PC
    [0x00, 0x1c, 0x42], // Parallels
    [0x00, 0x0f, 0x4b], // Virtual Iron 4
    [0x08, 0x00, 0x27], // Sun Virtual Box
  ];

  // Windows needs specific prefixes sometimes
  // http://www.wikihow.com/Change-a-Computer's-Mac-Address-in-Windows
  const windowsPrefixes = ["D2", "D6", "DA", "DE"];

  const vendor = vendors[random(0, vendors.length - 1)];

  if (process.platform === "win32") {
    // Parse hex string to number (fix for Windows randomize bug)
    vendor[0] = parseInt(windowsPrefixes[random(0, 3)], 16);
  }

  const mac = [
    vendor[0],
    vendor[1],
    vendor[2],
    random(0x00, 0x7f),
    random(0x00, 0xff),
    random(0x00, 0xff),
  ];

  if (localAdmin) {
    // Universally administered and locally administered addresses are
    // distinguished by setting the second least significant bit of the
    // most significant byte of the address. If the bit is 0, the address
    // is universally administered. If it is 1, the address is locally
    // administered. In the example address 02-00-00-00-00-01 the most
    // significant byte is 02h. The binary is 00000010 and the second
    // least significant bit is 1. Therefore, it is a locally administered
    // address.[3] The bit is 0 in all OUIs.
    mac[0] |= 2;
  }

  return mac
    .map((byte) => zeroFill(2, byte.toString(16)))
    .join(":")
    .toUpperCase();
}

/**
 * Takes a MAC address in various formats:
 *
 *      - 00:00:00:00:00:00,
 *      - 00-00-00-00-00-00,
 *      - 0000.0000.0000
 *
 *  ... and returns it in the format 00:00:00:00:00:00.
 *
 * @param  {string} mac
 * @return {string}
 */
function normalize(mac) {
  if (!mac || typeof mac !== "string") {
    return null;
  }
  
  // Remove whitespace
  mac = mac.trim();
  
  if (mac.length === 0) {
    return null;
  }
  
  // Try Cisco format first (e.g., 0123.4567.89ab)
  let m = CISCO_MAC_ADDRESS_RE.exec(mac);
  if (m) {
    const halfwords = m.slice(1);
    // Validate all halfwords are present
    if (halfwords.length === 3 && halfwords.every(hw => hw && hw.length > 0)) {
      mac = halfwords
        .map((halfword) => {
          return zeroFill(4, halfword);
        })
        .join("");
      if (mac.length === 12) {
        return chunk(mac, 2).join(":").toUpperCase();
      }
    }
  }

  // Try standard MAC format (e.g., 00:11:22:33:44:55 or 00-11-22-33-44-55)
  m = MAC_ADDRESS_RE.exec(mac);
  if (m) {
    const bytes = m.slice(1);
    // Validate we have exactly 6 bytes
    if (bytes.length === 6 && bytes.every(byte => byte && byte.length > 0)) {
      const normalized = bytes
        .map((byte) => zeroFill(2, byte))
        .join(":")
        .toUpperCase();
      
      // Final validation: should be exactly 17 characters (6 bytes + 5 colons)
      if (normalized.length === 17) {
        return normalized;
      }
    }
  }
  
  return null;
}

function chunk(str, n) {
  const arr = [];
  for (let i = 0; i < str.length; i += n) {
    arr.push(str.slice(i, i + n));
  }
  return arr;
}

/**
 * Return a random integer between min and max (inclusive).
 * @param  {number} min
 * @param  {number} max
 * @return {number}
 */
function random(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}
