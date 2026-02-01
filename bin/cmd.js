#!/usr/bin/env node

const chalk = require("chalk");
const minimist = require("minimist");
const spoof = require("../");
const { stripIndent } = require("common-tags");
const cp = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const ora = require("ora");
const history = require("../lib/history");
const oui = require("../lib/oui");
const duidCli = require("../lib/duid-cli");
const nm = process.platform === "linux" ? require("../lib/networkmanager") : null;

const argv = minimist(process.argv.slice(2), {
  alias: {
    v: "version",
    V: "verbose",
    j: "json",
    h: "help",
  },
  boolean: ["version", "verbose", "json", "nm-reconnect", "force", "help"],
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

let currentSpinner = null;

function showProgress(message) {
  if (JSON_OUTPUT) return;
  if (currentSpinner) {
    currentSpinner.text = message;
  } else {
    currentSpinner = ora(message).start();
  }
}

function hideProgress() {
  if (JSON_OUTPUT) return;
  if (currentSpinner) {
    currentSpinner.stop();
    currentSpinner = null;
  }
}

function successProgress(message) {
  if (JSON_OUTPUT) return;
  if (currentSpinner) {
    currentSpinner.succeed(message);
    currentSpinner = null;
  }
}

function failProgress(message) {
  if (JSON_OUTPUT) return;
  if (currentSpinner) {
    currentSpinner.fail(message);
    currentSpinner = null;
  }
}

function progressStep(step, total, message) {
  if (JSON_OUTPUT) return;
  const percentage = Math.round((step / total) * 100);
  if (currentSpinner) {
    currentSpinner.text = `[${step}/${total}] ${percentage}% - ${message}`;
  } else {
    currentSpinner = ora(`[${step}/${total}] ${percentage}% - ${message}`).start();
  }
  if (step === total) {
    currentSpinner = null;
  }
}

function warnIfNotElevated() {
  if (JSON_OUTPUT) return;
  if (process.platform === "win32") return;
  if (typeof process.getuid !== "function") return;
  if (process.getuid() === 0) return;
  console.error(chalk.yellow("⚠"), chalk.gray("MAC changes usually require root. If this fails, try: sudo spoofy <command>"));
}

function installCompletions() {
  const shell = argv.shell || process.env.SHELL || "";
  const platform = process.platform;
  const completionsDir = path.join(__dirname, "..", "completions");
  
  let targetShell = "";
  let completionFile = "";
  let installPath = "";

  // Detect shell
  if (shell.includes("fish")) {
    targetShell = "fish";
    completionFile = path.join(completionsDir, "spoofy.fish");
    if (platform === "win32") {
      installPath = path.join(os.homedir(), ".config", "fish", "completions", "spoofy.fish");
    } else {
      installPath = path.join(os.homedir(), ".config", "fish", "completions", "spoofy.fish");
    }
  } else if (shell.includes("zsh")) {
    targetShell = "zsh";
    completionFile = path.join(completionsDir, "spoofy.zsh");
    if (platform === "win32") {
      installPath = path.join(os.homedir(), ".zshrc.d", "_spoofy");
    } else {
      installPath = path.join(os.homedir(), ".zshrc.d", "_spoofy");
    }
  } else if (shell.includes("bash") || shell.includes("sh")) {
    targetShell = "bash";
    completionFile = path.join(completionsDir, "spoofy.bash");
    if (platform === "win32") {
      installPath = path.join(os.homedir(), ".bash_completion.d", "spoofy");
    } else {
      installPath = path.join(os.homedir(), ".bash_completion.d", "spoofy");
    }
  } else if (platform === "win32") {
    targetShell = "powershell";
    completionFile = path.join(completionsDir, "spoofy.ps1");
    installPath = path.join(os.homedir(), "Documents", "PowerShell", "spoofy.ps1");
  }

  if (!targetShell) {
    console.error(chalk.red("✗"), "Could not detect shell. Please specify with --shell=<bash|zsh|fish|powershell>");
    console.log(chalk.yellow("\nManual installation:"));
    console.log(chalk.gray("  Bash:  source " + path.join(completionsDir, "spoofy.bash")));
    console.log(chalk.gray("  Zsh:   Add to .zshrc: fpath=(" + completionsDir + " $fpath)"));
    console.log(chalk.gray("  Fish:  Copy to ~/.config/fish/completions/spoofy.fish"));
    console.log(chalk.gray("  PS:    Add to $PROFILE: . " + path.join(completionsDir, "spoofy.ps1")));
    process.exit(1);
  }

  if (!fs.existsSync(completionFile)) {
    console.error(chalk.red("✗"), `Completion file not found: ${completionFile}`);
    process.exit(1);
  }

  try {
    // Create target directory if it doesn't exist
    const targetDir = path.dirname(installPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      logVerbose(`Created directory: ${targetDir}`);
    }

    // Copy completion file
    fs.copyFileSync(completionFile, installPath);
    logVerbose(`Copied ${completionFile} to ${installPath}`);

    // Generate installation instructions
    console.log(chalk.green("✓"), `Completion file installed for ${targetShell}`);
    console.log(chalk.gray(`  Location: ${installPath}`));
    console.log();

    if (targetShell === "bash") {
      console.log(chalk.yellow("To enable completions, add to your ~/.bashrc:"));
      console.log(chalk.cyan(`  source ${installPath}`));
      console.log();
      console.log(chalk.gray("Or reload your shell:"));
      console.log(chalk.cyan("  source ~/.bashrc"));
    } else if (targetShell === "zsh") {
      console.log(chalk.yellow("To enable completions, add to your ~/.zshrc:"));
      console.log(chalk.cyan(`  fpath=(${path.dirname(installPath)} $fpath)`));
      console.log(chalk.cyan("  autoload -U compinit && compinit"));
      console.log();
      console.log(chalk.gray("Or reload your shell:"));
      console.log(chalk.cyan("  source ~/.zshrc"));
    } else if (targetShell === "fish") {
      console.log(chalk.green("✓"), "Fish completions are automatically loaded!");
      console.log(chalk.gray("  Restart your fish shell to use completions."));
    } else if (targetShell === "powershell") {
      console.log(chalk.yellow("To enable completions, add to your PowerShell profile:"));
      console.log(chalk.cyan(`  . ${installPath}`));
      console.log();
      console.log(chalk.gray("Or run:"));
      console.log(chalk.cyan(`  Add-Content $PROFILE ". ${installPath.replace(/\\/g, '/')}"`));
      console.log();
      console.log(chalk.gray("Then reload your profile:"));
      console.log(chalk.cyan("  . $PROFILE"));
    }

    if (JSON_OUTPUT) {
      outputJSON({
        success: true,
        shell: targetShell,
        completionFile: completionFile,
        installPath: installPath,
      });
    }
  } catch (err) {
    console.error(chalk.red("✗"), `Failed to install completions: ${err.message}`);
    if (VERBOSE) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

(async () => {
  try {
    await init();
  } catch (err) {
    handleError(err);
    process.exitCode = -1;
  }
})();

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

async function init() {
  if (cmd === "version" || argv.version) {
    version();
  } else if (argv.help || argv.h) {
    help();
  } else if (cmd === "list" || cmd === "ls") {
    list();
  } else if (cmd === "set") {
    const mac = argv._[1];
    const devices = argv._.slice(2);
    await set(mac, devices);
  } else if (cmd === "randomize") {
    const devices = argv._.slice(1);
    await randomize(devices);
  } else if (cmd === "reset") {
    const devices = argv._.slice(1);
    await reset(devices);
  } else if (cmd === "normalize") {
    const mac = argv._[1];
    normalize(mac);
  } else if (cmd === "info") {
    const device = argv._[1];
    info(device);
  } else if (cmd === "validate") {
    const mac = argv._[1];
    validate(mac);
  } else if (cmd === "vendor") {
    const mac = argv._[1];
    vendor(mac);
  } else if (cmd === "batch") {
    const file = argv._[1];
    await batch(file);
  } else if (cmd === "history") {
    historyCmd();
  } else if (cmd === "completion" || cmd === "completions") {
    installCompletions();
  } else if (cmd === "duid") {
    duidCli.run(argv._.slice(1), VERBOSE, JSON_OUTPUT);
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

    Commands:
      list [--wifi]                     List available devices.
      set <mac> <devices>...            Set device MAC address.
      randomize [--local] <devices>...  Set device MAC address randomly.
      reset <devices>...                Reset device MAC address to default.
      normalize <mac>                   Normalize a MAC address format.
      info <device>                     Show detailed interface information.
      validate <mac>                    Validate MAC address format.
      vendor <mac>                      Look up vendor from MAC address.
      batch <file>                      Change multiple interfaces from config file.
      history                            View MAC address change history.
      completion                         Install shell completions (bash/zsh/fish/PowerShell).
      duid <command>                    DHCPv6 DUID spoofing commands (see: spoofy duid help).

    Options:
      --help, -h      Show this help message.
      --wifi          Try to only show wireless interfaces.
      --local         Set the locally administered flag on randomized MACs.
      --verbose, -V   Show verbose output for debugging.
      --json, -j     Output results in JSON format.
      --nm-reconnect  (Linux only) Automatically reconnect NetworkManager device after MAC change.
      --force         (Linux only) Use with --nm-reconnect to force NetworkManager networking restart.

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

async function set(mac, devices) {
  if (!mac) {
    throw new Error("MAC address is required. Usage: spoofy set <mac> <device>");
  }
  
  if (!devices || devices.length === 0) {
    throw new Error("Device name is required. Usage: spoofy set <mac> <device>");
  }

  warnIfNotElevated();
  logVerbose(`Setting MAC address ${mac} on ${devices.length} device(s)`);
  
  for (let index = 0; index < devices.length; index++) {
    const device = devices[index];
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
    await setMACAddress(it.device, mac, it.port);
  }
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

async function randomize(devices) {
  if (!devices || devices.length === 0) {
    throw new Error("Device name is required. Usage: spoofy randomize <device>");
  }

  warnIfNotElevated();
  const useLocal = argv.local || (config && config.randomize && config.randomize.local);
  logVerbose(`Randomizing MAC address (local: ${useLocal})`);
  
  for (let index = 0; index < devices.length; index++) {
    const device = devices[index];
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
    
    await setMACAddress(it.device, mac, it.port, "randomize");
  }
}

async function reset(devices) {
  if (!devices || devices.length === 0) {
    throw new Error("Device name is required. Usage: spoofy reset <device>");
  }

  warnIfNotElevated();
  logVerbose(`Resetting MAC address on ${devices.length} device(s)`);
  
  for (let index = 0; index < devices.length; index++) {
    const device = devices[index];
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
    
    await setMACAddress(it.device, it.address, it.port, "reset");
  }
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
      const vendor = oui.lookupVendor(it.address);
      if (vendor && vendor !== "Unknown") {
        line.push(chalk.gray(`[${vendor}]`));
      }
    }
    if (it.currentAddress && it.currentAddress !== it.address) {
      line.push("currently set to", chalk.bold.red(it.currentAddress));
      const currentVendor = oui.lookupVendor(it.currentAddress);
      if (currentVendor && currentVendor !== "Unknown") {
        line.push(chalk.gray(`[${currentVendor}]`));
      }
    }
    console.log(line.join(" "));
  });
}

async function setMACAddress(device, mac, port, operation = "set") {
  logVerbose(`Setting MAC address ${mac} on device ${device}`);
  
  // Get current MAC for history
  const oldMac = spoof.getInterfaceMAC(device);
  
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

  // Check NetworkManager status on Linux
  let nmReconnect = false;
  if (process.platform === "linux" && nm) {
    try {
      const nmStatus = await nm.isNetworkManagerPresent();
      if (nmStatus.present && nmStatus.running) {
        const deviceStatus = await nm.getNMDeviceStatus(device);
        
        if (deviceStatus.managed) {
          // Interface is managed by NetworkManager
          if (argv["nm-reconnect"]) {
            nmReconnect = true;
            if (!JSON_OUTPUT) {
              console.log(chalk.blue("ℹ"), `NetworkManager is managing ${device}. Will reconnect after MAC change.`);
            }
            logVerbose(`NetworkManager managing ${device}, will reconnect after change`);
          } else {
            // Show warning
            if (!JSON_OUTPUT) {
              console.warn(chalk.yellow("⚠"), `NetworkManager is managing ${device}. MAC changes may be overwritten.`);
              console.log(chalk.gray("  Suggestions:"));
              console.log(chalk.gray("    1. Use --nm-reconnect to automatically reconnect the device"));
              console.log(chalk.gray("    2. Temporarily disconnect: nmcli dev disconnect " + device));
              console.log(chalk.gray("    3. Mark device unmanaged in /etc/NetworkManager/NetworkManager.conf:"));
              console.log(chalk.gray("       [keyfile]"));
              console.log(chalk.gray("       unmanaged-devices=interface-name:" + device));
              console.log(chalk.gray("       Then restart: sudo systemctl restart NetworkManager"));
            }
            
            if (VERBOSE) {
              logVerbose(`NetworkManager status: present=${nmStatus.present}, running=${nmStatus.running}, method=${nmStatus.method}`);
              logVerbose(`Device status: managed=${deviceStatus.managed}, state=${deviceStatus.state}`);
              if (deviceStatus.raw) {
                logVerbose(`nmcli output: ${deviceStatus.raw}`);
              }
            }
          }
        } else if (VERBOSE) {
          logVerbose(`Interface ${device} is not managed by NetworkManager (or NM not managing it)`);
        }
      }
    } catch (err) {
      // NetworkManager check failed, log but continue
      logVerbose(`NetworkManager check failed: ${err.message}`);
    }
  }

  try {
    showProgress("Changing MAC address");
    logVerbose(`Calling setInterfaceMAC(${device}, ${mac}, ${port})`);
    
    // Pass NetworkManager reconnect option
    const nmOptions = nmReconnect ? { reconnect: true, force: argv.force || false } : null;
    await spoof.setInterfaceMAC(device, mac, port, nmOptions);
    
    // Log to history
    history.addHistoryEntry(device, oldMac, mac, operation);
    
    successProgress("MAC address changed successfully");
    
    if (JSON_OUTPUT) {
      outputJSON({
        success: true,
        device: device,
        mac: mac,
        oldMac: oldMac,
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
    failProgress("Failed to change MAC address");
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

function info(device) {
  if (!device) {
    throw new Error("Device name is required. Usage: spoofy info <device>");
  }
  
  logVerbose(`Getting info for device: ${device}`);
  showProgress("Fetching interface information");
  
  const it = spoof.findInterface(device);
  hideProgress();
  
  if (!it) {
    throw new Error(
      `Could not find device "${device}". ` +
      "List available devices using: spoofy list"
    );
  }
  
  const currentMac = spoof.getInterfaceMAC(device);
  const vendorInfo = it.address ? oui.getVendorInfo(it.address) : null;
  const currentVendorInfo = currentMac ? oui.getVendorInfo(currentMac) : null;
  const deviceHistory = history.getHistoryForDevice(device);
  
  if (JSON_OUTPUT) {
    outputJSON({
      device: it.device,
      port: it.port || it.device,
      description: it.description,
      hardwareMac: it.address,
      currentMac: currentMac,
      hardwareVendor: vendorInfo ? vendorInfo.vendor : null,
      currentVendor: currentVendorInfo ? currentVendorInfo.vendor : null,
      status: it.status,
      platform: process.platform,
      historyCount: deviceHistory.length,
      lastChange: deviceHistory[0] || null,
    });
    return;
  }
  
  console.log(chalk.bold.cyan("\nInterface Information"));
  console.log(chalk.gray("─".repeat(50)));
  console.log(chalk.bold("Device:"), it.device);
  console.log(chalk.bold("Port:"), it.port || it.device);
  if (it.description) {
    console.log(chalk.bold("Description:"), it.description);
  }
  if (it.status) {
    console.log(chalk.bold("Status:"), it.status);
  }
  console.log(chalk.bold("Platform:"), process.platform);
  
  if (it.address) {
    console.log(chalk.bold("\nHardware MAC Address:"), chalk.cyan(it.address));
    if (vendorInfo && vendorInfo.vendor !== "Unknown") {
      console.log(chalk.bold("Hardware Vendor:"), chalk.green(vendorInfo.vendor));
    }
  }
  
  if (currentMac) {
    console.log(chalk.bold("Current MAC Address:"), chalk.cyan(currentMac));
    if (currentVendorInfo && currentVendorInfo.vendor !== "Unknown") {
      console.log(chalk.bold("Current Vendor:"), chalk.green(currentVendorInfo.vendor));
    }
    if (currentMac !== it.address) {
      console.log(chalk.yellow("⚠ MAC address has been changed from hardware address"));
    }
  }
  
  if (deviceHistory.length > 0) {
    console.log(chalk.bold("\nChange History:"), `(${deviceHistory.length} entries)`);
    deviceHistory.slice(0, 5).forEach((entry, index) => {
      const date = new Date(entry.timestamp).toLocaleString();
      console.log(`  ${index + 1}. ${date} - ${entry.operation}: ${entry.oldMac || "N/A"} → ${entry.newMac}`);
    });
    if (deviceHistory.length > 5) {
      console.log(chalk.gray(`  ... and ${deviceHistory.length - 5} more entries`));
    }
  }
  console.log();
}

function validate(mac) {
  if (!mac) {
    throw new Error("MAC address is required. Usage: spoofy validate <mac>");
  }
  
  logVerbose(`Validating MAC address: ${mac}`);
  
  const normalized = spoof.normalize(mac);
  const isValid = !!normalized;
  const vendorInfo = normalized ? oui.getVendorInfo(normalized) : null;
  
  if (JSON_OUTPUT) {
    outputJSON({
      original: mac,
      normalized: normalized,
      valid: isValid,
      vendor: vendorInfo ? vendorInfo.vendor : null,
      prefix: vendorInfo ? vendorInfo.prefix : null,
    });
    return;
  }
  
  if (isValid) {
    console.log(chalk.green("✓ Valid MAC address"));
    console.log(chalk.bold("Normalized:"), normalized);
    if (vendorInfo && vendorInfo.vendor !== "Unknown") {
      console.log(chalk.bold("Vendor:"), chalk.green(vendorInfo.vendor));
    }
  } else {
    console.log(chalk.red("✗ Invalid MAC address"));
    console.log(chalk.yellow("Expected format: XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX"));
  }
}

function vendor(mac) {
  if (!mac) {
    throw new Error("MAC address is required. Usage: spoofy vendor <mac>");
  }
  
  logVerbose(`Looking up vendor for MAC: ${mac}`);
  
  const normalized = spoof.normalize(mac);
  if (!normalized) {
    throw new Error(`"${mac}" is not a valid MAC address`);
  }
  
  const vendorInfo = oui.getVendorInfo(normalized);
  
  if (JSON_OUTPUT) {
    outputJSON({
      mac: normalized,
      vendor: vendorInfo.vendor,
      prefix: vendorInfo.prefix,
      found: vendorInfo.vendor !== "Unknown",
    });
    return;
  }
  
  console.log(chalk.bold("MAC Address:"), normalized);
  console.log(chalk.bold("Vendor:"), vendorInfo.vendor !== "Unknown" ? chalk.green(vendorInfo.vendor) : chalk.yellow("Unknown"));
  console.log(chalk.bold("Prefix:"), vendorInfo.prefix);
  
  if (vendorInfo.vendor === "Unknown") {
    console.log(chalk.gray("\nNote: Vendor not found in database. This may be a locally administered address."));
  }
}

async function batch(file) {
  if (!file) {
    throw new Error("Batch file is required. Usage: spoofy batch <file>");
  }
  
  if (!fs.existsSync(file)) {
    throw new Error(`Batch file not found: ${file}`);
  }
  
  logVerbose(`Loading batch file: ${file}`);
  showProgress("Loading batch configuration");
  
  let batchConfig;
  try {
    const content = fs.readFileSync(file, "utf8");
    batchConfig = JSON.parse(content);
  } catch (err) {
    hideProgress();
    throw new Error(`Failed to parse batch file: ${err.message}`);
  }
  
  hideProgress();
  
  if (!Array.isArray(batchConfig)) {
    throw new Error("Batch file must contain an array of operations");
  }
  
  logVerbose(`Found ${batchConfig.length} operation(s) in batch file`);
  
  const results = [];
  let successCount = 0;
  let failCount = 0;
  
  for (let index = 0; index < batchConfig.length; index++) {
    const operation = batchConfig[index];
    const step = index + 1;
    const total = batchConfig.length;
    progressStep(step, total, `Processing operation ${step}`);
    
    try {
      if (operation.type === "set" && operation.device && operation.mac) {
        const it = spoof.findInterface(operation.device);
        if (!it) {
          throw new Error(`Device not found: ${operation.device}`);
        }
        await setMACAddress(it.device, operation.mac, it.port, "batch-set");
        results.push({ success: true, operation: operation, index: index });
        successCount++;
      } else if (operation.type === "randomize" && operation.device) {
        const it = spoof.findInterface(operation.device);
        if (!it) {
          throw new Error(`Device not found: ${operation.device}`);
        }
        const mac = spoof.randomize(operation.local || false);
        await setMACAddress(it.device, mac, it.port, "batch-randomize");
        results.push({ success: true, operation: operation, mac: mac, index: index });
        successCount++;
      } else if (operation.type === "reset" && operation.device) {
        const it = spoof.findInterface(operation.device);
        if (!it) {
          throw new Error(`Device not found: ${operation.device}`);
        }
        if (!it.address) {
          throw new Error(`No hardware MAC address for: ${operation.device}`);
        }
        await setMACAddress(it.device, it.address, it.port, "batch-reset");
        results.push({ success: true, operation: operation, index: index });
        successCount++;
      } else {
        throw new Error(`Invalid operation type or missing parameters: ${JSON.stringify(operation)}`);
      }
    } catch (err) {
      results.push({ success: false, operation: operation, error: err.message, index: index });
      failCount++;
    }
  }
  
  progressStep(batchConfig.length, batchConfig.length, "Completed");
  
  if (JSON_OUTPUT) {
    outputJSON({
      total: batchConfig.length,
      success: successCount,
      failed: failCount,
      results: results,
    });
  } else {
    console.log(chalk.bold("\nBatch Operation Summary:"));
    console.log(chalk.green(`  ✓ Successful: ${successCount}`));
    if (failCount > 0) {
      console.log(chalk.red(`  ✗ Failed: ${failCount}`));
    }
    console.log(chalk.bold(`  Total: ${batchConfig.length}`));
  }
}

function historyCmd() {
  const device = argv._[1]; // Optional device filter
  logVerbose(device ? `Getting history for device: ${device}` : "Getting all history");
  
  const allHistory = history.getHistory();
  const deviceHistory = device ? history.getHistoryForDevice(device) : allHistory;
  
  if (deviceHistory.length === 0) {
    if (JSON_OUTPUT) {
      outputJSON({ history: [], count: 0 });
    } else {
      console.log(chalk.yellow("No history found" + (device ? ` for device "${device}"` : "")));
    }
    return;
  }
  
  if (JSON_OUTPUT) {
    outputJSON({
      history: deviceHistory,
      count: deviceHistory.length,
      device: device || "all",
    });
    return;
  }
  
  console.log(chalk.bold.cyan("\nMAC Address Change History"));
  console.log(chalk.gray("─".repeat(80)));
  
  deviceHistory.forEach((entry, index) => {
    const date = new Date(entry.timestamp).toLocaleString();
    console.log(chalk.bold(`\n${index + 1}. ${date}`));
    console.log(`   Device: ${chalk.green(entry.device)}`);
    console.log(`   Operation: ${chalk.cyan(entry.operation)}`);
    console.log(`   ${chalk.gray(entry.oldMac || "N/A")} → ${chalk.cyan(entry.newMac)}`);
    console.log(`   Platform: ${entry.platform}`);
  });
  
  console.log();
}
