#!/usr/bin/env node

const chalk = require("chalk");
const minimist = require("minimist");
const spoof = require("../");
const { stripIndent } = require("common-tags");
const cp = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const argv = minimist(process.argv.slice(2), {
  alias: {
    v: "version",
    V: "verbose",
    j: "json",
  },
  boolean: ["version", "verbose", "json"],
});
const cmd = argv._[0];

// Global flags
const VERBOSE = argv.verbose || false;
const JSON_OUTPUT = argv.json || false;

// Configuration file support
let config = null;
const configPath = path.join(os.homedir(), ".spoofyrc");
if (fs.existsSync(configPath)) {
  try {
    const configContent = fs.readFileSync(configPath, "utf8");
    config = JSON.parse(configContent);
    if (VERBOSE) {
      logVerbose(`Loaded configuration from ${configPath}`);
    }
  } catch (err) {
    if (VERBOSE) {
      logVerbose(`Failed to load config: ${err.message}`);
    }
  }
}

// Helper functions
function logVerbose(message) {
  if (VERBOSE && !JSON_OUTPUT) {
    console.error(chalk.gray(`[VERBOSE] ${message}`));
  }
}

function outputJSON(data) {
  if (JSON_OUTPUT) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function showProgress(message) {
  if (JSON_OUTPUT) return;
  process.stdout.write(chalk.blue("⏳ ") + message + "... ");
}

function hideProgress() {
  if (JSON_OUTPUT) return;
  process.stdout.write("\r" + " ".repeat(80) + "\r");
}

function progressStep(step, total, message) {
  if (JSON_OUTPUT) return;
  const percentage = Math.round((step / total) * 100);
  process.stdout.write(`\r${chalk.blue("⏳")} [${step}/${total}] ${percentage}% - ${message}...`);
  if (step === total) {
    process.stdout.write("\r" + " ".repeat(80) + "\r");
  }
}

try {
  init();
} catch (err) {
  handleError(err);
  process.exitCode = -1;
}

function handleError(err) {
  if (err.code) {
    // Custom error with code and suggestions
    console.error(chalk.red(`✗ ${err.name || "Error"}:`), err.message);
    
    if (err.suggestions && err.suggestions.length > 0) {
      console.error(chalk.yellow("\nSuggestions:"));
      err.suggestions.forEach((suggestion, index) => {
        console.error(chalk.gray(`  ${index + 1}. ${suggestion}`));
      });
    }
  } else {
    // Standard error
    console.error(chalk.red("✗ Error:"), err.message);
    
    // Provide helpful suggestions for common errors
    if (err.message.includes("ENOENT") || err.message.includes("spawn")) {
      console.error(chalk.yellow("\nThis might be a system command issue. Suggestions:"));
      if (process.platform === "linux") {
        console.error(chalk.gray("  • Install iproute2: sudo apt-get install iproute2"));
      } else if (process.platform === "win32") {
        console.error(chalk.gray("  • Ensure PowerShell is installed and in PATH"));
      }
    } else if (err.message.includes("permission") || err.message.includes("Permission")) {
      console.error(chalk.yellow("\nPermission issue. Suggestions:"));
      if (process.platform === "win32") {
        console.error(chalk.gray("  • Run PowerShell/CMD as Administrator"));
      } else {
        console.error(chalk.gray("  • Use sudo: sudo spoofy <command>"));
      }
    }
  }
  
  if (process.env.DEBUG) {
    console.error(chalk.gray("\nStack trace:"));
    console.error(err.stack);
  }
}

function init() {
  if (cmd === "version" || argv.version) {
    version();
  } else if (cmd === "list" || cmd === "ls") {
    list();
  } else if (cmd === "set") {
    const mac = argv._[1];
    const devices = argv._.slice(2);
    set(mac, devices);
  } else if (cmd === "randomize") {
    const devices = argv._.slice(1);
    randomize(devices);
  } else if (cmd === "reset") {
    const devices = argv._.slice(1);
    reset(devices);
  } else if (cmd === "normalize") {
    const mac = argv._[1];
    normalize(mac);
  } else {
    help();
  }
}

function help() {
  const platform = process.platform;
  let example = "";
  let note = "";

  if (platform === "win32") {
    example = `      spoofy randomize "Ethernet"`;
    note = "\n    Note: On Windows, run PowerShell or CMD as Administrator.";
  } else if (platform === "darwin") {
    example = `      spoofy randomize en0`;
    note = "\n    Note: On macOS/Linux, use sudo for MAC address changes.";
  } else {
    example = `      sudo spoofy randomize eth0`;
    note = "\n    Note: On Linux, use sudo for MAC address changes.";
  }

  const message = stripIndent`
    spoofy - Cross-platform MAC address spoofing utility

    Example (randomize MAC address):
${example}${note}

    Usage:
      spoofy list [--wifi]                     List available devices.
      spoofy set <mac> <devices>...            Set device MAC address.
      spoofy randomize [--local] <devices>...  Set device MAC address randomly.
      spoofy reset <devices>...                Reset device MAC address to default.
      spoofy normalize <mac>                   Given a MAC address, normalize it.
      spoofy help                              Shows this help message.
      spoofy version | --version | -v          Show package version.

    Options:
      --wifi          Try to only show wireless interfaces.
      --local         Set the locally administered flag on randomized MACs.
      --verbose, -V   Show verbose output for debugging.
      --json, -j     Output results in JSON format.

    Platform Support:
      ✅ macOS (Sequoia 15.4+, Tahoe 26+)
      ✅ Windows 10/11
      ✅ Linux (modern distributions)
  `;
  console.log(message);
}

function version() {
  const pkg = require("../package.json");
  if (JSON_OUTPUT) {
    outputJSON({
      version: pkg.version,
      name: pkg.name,
      description: pkg.description,
    });
  } else {
    console.log(pkg.version);
  }
}

function set(mac, devices) {
  if (!mac) {
    throw new Error("MAC address is required. Usage: spoofy set <mac> <device>");
  }
  
  if (!devices || devices.length === 0) {
    throw new Error("Device name is required. Usage: spoofy set <mac> <device>");
  }
  
  logVerbose(`Setting MAC address ${mac} on ${devices.length} device(s)`);
  
  devices.forEach((device, index) => {
    logVerbose(`Processing device ${index + 1}/${devices.length}: ${device}`);
    showProgress(`Finding interface ${device}`);
    
    const it = spoof.findInterface(device);
    hideProgress();

    if (!it) {
      throw new Error(
        `Could not find device "${device}". ` +
        "List available devices using: spoofy list"
      );
    }

    logVerbose(`Found interface: ${it.device} (port: ${it.port})`);
    setMACAddress(it.device, mac, it.port);
  });
}

function normalize(mac) {
  if (!mac) {
    throw new Error("MAC address is required. Usage: spoofy normalize <mac>");
  }
  
  logVerbose(`Normalizing MAC address: ${mac}`);
  
  try {
    const normalized = spoof.normalize(mac);
    if (!normalized) {
      throw new Error(`"${mac}" is not a valid MAC address`);
    }
    
    if (JSON_OUTPUT) {
      outputJSON({
        original: mac,
        normalized: normalized,
        valid: true,
      });
    } else {
      console.log(normalized);
    }
    
    logVerbose(`Normalized: ${mac} -> ${normalized}`);
  } catch (err) {
    if (JSON_OUTPUT) {
      outputJSON({
        original: mac,
        normalized: null,
        valid: false,
        error: err.message,
      });
    }
    throw new Error(
      `Could not normalize MAC address "${mac}": ${err.message}`
    );
  }
}

function randomize(devices) {
  if (!devices || devices.length === 0) {
    throw new Error("Device name is required. Usage: spoofy randomize <device>");
  }
  
  const useLocal = argv.local || (config && config.randomize && config.randomize.local);
  logVerbose(`Randomizing MAC address (local: ${useLocal})`);
  
  devices.forEach((device, index) => {
    logVerbose(`Processing device ${index + 1}/${devices.length}: ${device}`);
    showProgress(`Finding interface ${device}`);
    
    const it = spoof.findInterface(device);
    hideProgress();

    if (!it) {
      throw new Error(
        `Could not find device "${device}". ` +
        "List available devices using: spoofy list"
      );
    }

    logVerbose(`Found interface: ${it.device} (port: ${it.port})`);
    const mac = spoof.randomize(useLocal);
    
    if (JSON_OUTPUT) {
      // Will be output in setMACAddress
    } else {
      console.log(chalk.blue("ℹ"), `Generated random MAC address: ${chalk.bold.cyan(mac)}`);
    }
    
    setMACAddress(it.device, mac, it.port);
  });
}

function reset(devices) {
  if (!devices || devices.length === 0) {
    throw new Error("Device name is required. Usage: spoofy reset <device>");
  }
  
  logVerbose(`Resetting MAC address on ${devices.length} device(s)`);
  
  devices.forEach((device, index) => {
    logVerbose(`Processing device ${index + 1}/${devices.length}: ${device}`);
    showProgress(`Finding interface ${device}`);
    
    const it = spoof.findInterface(device);
    hideProgress();

    if (!it) {
      throw new Error(
        `Could not find device "${device}". ` +
        "List available devices using: spoofy list"
      );
    }

    if (!it.address) {
      throw new Error(
        `Could not read hardware MAC address for "${device}". ` +
        "The device may not have a MAC address or may be a virtual interface."
      );
    }

    logVerbose(`Hardware MAC address: ${it.address}`);
    
    if (JSON_OUTPUT) {
      // Will be output in setMACAddress
    } else {
      console.log(chalk.blue("ℹ"), `Resetting to hardware MAC address: ${chalk.bold.cyan(it.address)}`);
    }
    
    setMACAddress(it.device, it.address, it.port);
  });
}

function list() {
  logVerbose("Starting interface discovery...");
  showProgress("Discovering network interfaces");
  
  const targets = [];
  if (argv.wifi) {
    if (process.platform === "win32") {
      targets.push("wi-fi", "wireless", "wlan");
    } else {
      targets.push("wi-fi");
    }
  }

  const interfaces = spoof.findInterfaces(targets);
  hideProgress();
  logVerbose(`Found ${interfaces.length} interface(s)`);

  if (JSON_OUTPUT) {
    outputJSON({
      interfaces: interfaces.map((it) => ({
        port: it.port || it.device,
        device: it.device,
        address: it.address,
        currentAddress: it.currentAddress,
        status: it.status,
        description: it.description,
      })),
      count: interfaces.length,
    });
    return;
  }

  if (interfaces.length === 0) {
    console.log(chalk.yellow("No network interfaces found."));
    return;
  }

  interfaces.forEach((it) => {
    const line = [];
    line.push(
      "-",
      chalk.bold.green(it.port || it.device),
      "on device",
      chalk.bold.green(it.device)
    );
    
    if (it.status && process.platform === "win32") {
      line.push(chalk.gray(`(${it.status})`));
    }
    
    if (it.address) {
      line.push("with MAC address", chalk.bold.cyan(it.address));
    }
    if (it.currentAddress && it.currentAddress !== it.address) {
      line.push("currently set to", chalk.bold.red(it.currentAddress));
    }
    console.log(line.join(" "));
  });
}

function setMACAddress(device, mac, port) {
  logVerbose(`Setting MAC address ${mac} on device ${device}`);
  
  // Check for admin/root privileges
  if (process.platform === "win32") {
    logVerbose("Checking for Administrator privileges...");
    // On Windows, check if running as administrator
    try {
      const output = cp
        .execSync(
          'powershell -Command "[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent() | Select-Object -ExpandProperty IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"',
          { stdio: "pipe", shell: true }
        )
        .toString()
        .trim()
        .toLowerCase();
      
      if (output !== "true") {
        throw new Error(
          "Must run as Administrator to change network settings. " +
          "Right-click Command Prompt or PowerShell and select 'Run as Administrator'"
        );
      }
      logVerbose("Administrator privileges confirmed");
    } catch (err) {
      if (err.message.includes("Must run as Administrator")) {
        throw err;
      }
      // If check fails, warn but continue (might work anyway)
      if (!JSON_OUTPUT) {
        console.warn(chalk.yellow("Warning: Could not verify administrator privileges. Operation may fail."));
      }
      logVerbose("Could not verify privileges, continuing anyway");
    }
  } else if (process.platform !== "win32") {
    logVerbose("Checking for root privileges...");
    // Unix-like systems (macOS, Linux)
    if (process.getuid && process.getuid() !== 0) {
      throw new Error(
        "Must run as root (or using sudo) to change network settings"
      );
    }
    logVerbose("Root privileges confirmed");
  }

  try {
    showProgress("Changing MAC address");
    logVerbose(`Calling setInterfaceMAC(${device}, ${mac}, ${port})`);
    
    spoof.setInterfaceMAC(device, mac, port);
    
    hideProgress();
    
    if (JSON_OUTPUT) {
      outputJSON({
        success: true,
        device: device,
        mac: mac,
        message: "MAC address changed successfully",
      });
    } else {
      console.log(
        chalk.green("✓") +
        " Successfully set MAC address to " +
        chalk.bold.cyan(mac) +
        " on " +
        chalk.bold.green(device)
      );
    }
    
    logVerbose("MAC address change completed successfully");
    // Note: Verification is already done in setInterfaceMAC, so we don't need to do it again here
  } catch (err) {
    hideProgress();
    if (JSON_OUTPUT) {
      outputJSON({
        success: false,
        device: device,
        mac: mac,
        error: err.message,
        code: err.code,
      });
    }
    // Error is already formatted by handleError in the catch block above
    throw err;
  }
}
