# spoof-d

[![npm version](https://img.shields.io/npm/v/spoof-d)](https://www.npmjs.com/package/spoof-d)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub forks](https://img.shields.io/github/forks/TT5H/spoof-d)](https://github.com/TT5H/spoof-d/network)
[![GitHub stars](https://img.shields.io/github/stars/TT5H/spoof-d)](https://github.com/TT5H/spoof-d/stargazers)

> **✅ Cross-Platform Support**: This is a modernized fork of the original `spoof` project, updated for compatibility with modern macOS (Sequoia 15.4+, Tahoe 26+), Windows 10/11, and Linux. All platforms are now fully supported!

### Easily spoof your MAC address and DUID on macOS, Windows, and Linux!

A Node.js utility for changing MAC addresses and DHCPv6 DUIDs across all major platforms. Features reliable macOS support, modern Windows PowerShell integration, and Linux `ip link` commands. This fork includes enhanced error handling, automatic verification, retry logic, and improved cross-platform compatibility.

## About This Fork

This repository ([TT5H/spoof-d](https://github.com/TT5H/spoof-d)) is a fork of [basedbytes/spoofy](https://github.com/basedbytes/spoofy), which itself is a fork of the original `spoof` project. This fork extends the functionality with full cross-platform support and enhanced features.

### What's Changed

- **✅ Full Cross-Platform Support**: Complete Windows 10/11 and Linux support (not just macOS)
- **Modern macOS Support**: Fixed MAC spoofing for macOS Sequoia 15.4+ and Tahoe 26+
- **Windows Support**: Full Windows 10/11 support using PowerShell and registry methods with automatic fallback
- **Linux Support**: Modern Linux support using `ip link` commands (replaces deprecated `ifconfig`)
- **DUID Spoofing**: DHCPv6 DUID spoofing with automatic original preservation and cross-platform support
- **Enhanced Error Handling**: Custom error classes with actionable suggestions and better error messages
- **Automatic Verification**: Verifies MAC address changes after setting them
- **Retry Logic**: Automatic retry with exponential backoff for transient failures
- **Timeout Handling**: Prevents hanging operations with configurable timeouts
- **Better Validation**: Comprehensive input validation with helpful error messages
- **Removed `airport` dependency**: The deprecated `airport -z` command has been replaced with modern `networksetup` commands
- **Timing-sensitive MAC changes**: WiFi MAC addresses are now changed in the brief window after power-on but before network connection
- **Improved interface detection**: Better cross-platform interface detection using modern system commands
- **Cleaner codebase**: Removed deprecated code paths and unnecessary constants

## Key Features

### Enhanced Error Handling
- **Custom error classes** with specific error types (ValidationError, PermissionError, NetworkError, etc.)
- **Actionable suggestions** provided with every error message
- **Better error context** to help diagnose issues quickly

### Reliability Features
- **Automatic verification** of MAC address changes after setting them
- **Retry logic** with exponential backoff for transient failures
- **Timeout handling** to prevent hanging operations
- **Comprehensive validation** of inputs before attempting changes

### Cross-Platform Excellence
- **Windows**: PowerShell integration with registry fallback
- **macOS**: Modern networksetup commands with WiFi timing handling
- **Linux**: Modern ip link commands with ifconfig fallback
- **Unified API** across all platforms

### User Experience Features
- **Progress indicators** with animated spinners for long-running operations
- **Verbose mode** (`--verbose`) for detailed debugging output
- **JSON output** (`--json`) for scripting and automation
- **Configuration file** support (`.spoofyrc` in home directory)
- **MAC address vendor lookup** using OUI database
- **Change history tracking** for both MAC and DUID changes with ability to view history
- **Batch operations** for changing multiple interfaces at once
- **DUID (DHCPv6) spoofing** for complete IPv6 network identity management
- **Automatic verification** of DUID changes with retry logic

## Installation

### From npm (recommended)

```bash
npm install -g spoof-d
```

After installation, use the `spoofy` command (the package name is `spoof-d`, but the command is still `spoofy`).

After installation, you can use the `spoofy` command from anywhere.

### From source

```bash
git clone https://github.com/TT5H/spoof-d.git
cd spoof-d
npm install
npm install -g .
```

This gives you the latest development version with all the latest features.

## Shell Completions

`spoof-d` includes shell completion support for bash, zsh, fish, and PowerShell, making it easier to use the CLI with tab completion.

### Automatic Installation

The easiest way to install completions is using the built-in command:

```bash
spoofy completion
```

This will automatically detect your shell and install the appropriate completion file. You can also specify a shell explicitly:

```bash
spoofy completion --shell=bash
spoofy completion --shell=zsh
spoofy completion --shell=fish
spoofy completion --shell=powershell
```

### Manual Installation

#### Bash

```bash
# Copy completion file
mkdir -p ~/.bash_completion.d
cp completions/spoofy.bash ~/.bash_completion.d/spoofy

# Add to ~/.bashrc
echo "source ~/.bash_completion.d/spoofy" >> ~/.bashrc
source ~/.bashrc
```

Or install globally (requires root):

```bash
sudo cp completions/spoofy.bash /etc/bash_completion.d/spoofy
```

#### Zsh

```bash
# Copy completion file
mkdir -p ~/.zshrc.d
cp completions/spoofy.zsh ~/.zshrc.d/_spoofy

# Add to ~/.zshrc
echo "fpath=(~/.zshrc.d \$fpath)" >> ~/.zshrc
echo "autoload -U compinit && compinit" >> ~/.zshrc
source ~/.zshrc
```

Or install globally (requires root):

```bash
sudo cp completions/spoofy.zsh /usr/local/share/zsh/site-functions/_spoofy
```

#### Fish

```bash
# Copy completion file
mkdir -p ~/.config/fish/completions
cp completions/spoofy.fish ~/.config/fish/completions/spoofy.fish
```

Fish will automatically load completions from `~/.config/fish/completions/`. Just restart your fish shell.

Or install globally (requires root):

```bash
sudo cp completions/spoofy.fish /usr/share/fish/completions/spoofy.fish
```

#### PowerShell

```powershell
# Copy completion file
New-Item -ItemType Directory -Force -Path (Split-Path $PROFILE)
Copy-Item completions/spoofy.ps1 $PROFILE

# Add to PowerShell profile
Add-Content $PROFILE ". $PROFILE"

# Reload profile
. $PROFILE
```

Or add manually to your profile:

```powershell
. C:\path\to\completions\spoofy.ps1
```

### Features

- **Command completion**: Tab-complete all available commands (`list`, `set`, `randomize`, `duid`, etc.)
- **Interface name completion**: Automatically suggests available network interfaces
- **Option completion**: Tab-complete all flags and options (`--wifi`, `--verbose`, etc.)
- **DUID subcommand completion**: Full completion support for DUID commands
- **Context-aware**: Completions adapt based on the current command and position

## Quick Start

### List network interfaces

**macOS/Linux:**
```bash
spoofy list
```

**Windows (run PowerShell as Administrator):**
```powershell
spoofy list
```

### Randomize MAC address

**macOS (WiFi is typically `en0`):**
```bash
sudo spoofy randomize en0
```

**Windows:**
```powershell
# Run PowerShell as Administrator
spoofy randomize "Ethernet"
```

**Linux:**
```bash
sudo spoofy randomize eth0
```

**Note:** WiFi will disconnect briefly and may need to reconnect to networks. On Windows, ensure you're running as Administrator.

## Usage

You can always see up-to-date usage instructions by running `spoofy --help`.

### List available devices

```bash
spoofy list
```

Output:

```
- "Ethernet" on device "en4" with MAC address 70:56:51:BE:B3:00
- "Wi-Fi" on device "en0" with MAC address 70:56:51:BE:B3:01 currently set to 70:56:51:BE:B3:02
- "Bluetooth PAN" on device "en1"
```

### List only Wi-Fi devices

```bash
spoofy list --wifi
```

### Randomize MAC address _(requires root)_

Using hardware port name:

```bash
sudo spoofy randomize wi-fi
```

Or using device name:

```bash
sudo spoofy randomize en0
```

### Set specific MAC address _(requires root)_

```bash
sudo spoofy set 00:11:22:33:44:55 en0
```

### Reset to original MAC address _(requires root)_

```bash
sudo spoofy reset wi-fi
```

**Note**: On macOS, restarting your computer will also reset your MAC address to the original hardware address.

## DUID Spoofing (DHCPv6)

`spoof-d` also supports DHCPv6 DUID (DHCP Unique Identifier) spoofing for complete IPv6 network identity management.

### What is a DUID?

A DUID (DHCP Unique Identifier) is used in DHCPv6 to uniquely identify a client on IPv6 networks. Unlike MAC addresses which identify network interfaces, DUIDs identify DHCP clients across all interfaces and persist across reboots.

### Key Feature: Original DUID Preservation

The first time you spoof your DUID, your **original DUID is automatically saved** to:
- macOS: `/var/db/dhcpclient/DUID.original`
- Linux: `/var/lib/spoofy/duid.original`
- Windows: `%PROGRAMDATA%\spoofy\duid.original`

This allows you to **restore to your pre-spoofing state** at any time using `spoofy duid restore`.

### Show current DUID

```bash
spoofy duid list
```

### Randomize DUID _(requires root)_

Generate and set a random DUID (automatically saves your original on first use):

```bash
sudo spoofy duid randomize en0
```

You can specify the DUID type:

```bash
sudo spoofy duid randomize en0 --type=LLT
```

### Set specific DUID _(requires root)_

```bash
sudo spoofy duid set 00:03:00:01:aa:bb:cc:dd:ee:ff en0
```

### Sync DUID to current MAC _(requires root)_

Match DUID to the current MAC address of an interface (useful after MAC spoofing):

```bash
sudo spoofy duid sync en0
```

With specific type:

```bash
sudo spoofy duid sync en0 --type=LLT
```

**Typical workflow for complete identity spoofing:**

```bash
sudo spoofy randomize en0      # Spoof MAC first
sudo spoofy duid sync en0      # Then sync DUID to match
```

This ensures both layers show the same spoofed identity on IPv6 networks.

### Restore to original DUID _(requires root)_

Return to your original (pre-spoofing) DUID:

```bash
sudo spoofy duid restore en0
```

### Reset DUID _(requires root)_

Delete current DUID and let the system generate a NEW random one:

```bash
sudo spoofy duid reset en0
```

**Important**: `reset` generates a NEW DUID, while `restore` returns to your ORIGINAL.

### DUID Types

| Type | Name | Description |
|------|------|-------------|
| 1 | DUID-LLT | Link-layer address + timestamp (most common) |
| 2 | DUID-EN | Enterprise number + identifier |
| 3 | DUID-LL | Link-layer address only (default) |
| 4 | DUID-UUID | UUID-based identifier |

<<<<<<< HEAD
### Show detailed interface information

```bash
spoofy info en0
```

Shows detailed information about an interface including hardware MAC, current MAC, vendor information, and change history.

### Validate MAC address format

```bash
spoofy validate 00:11:22:33:44:55
```

Validates and normalizes a MAC address, showing vendor information if available.

### Look up vendor from MAC address

```bash
spoofy vendor 00:11:22:33:44:55
```

Looks up the vendor/manufacturer of a MAC address using the OUI database.

### Batch operations

Create a batch file (e.g., `batch.json`):

```json
[
  {
    "type": "randomize",
    "device": "en0",
    "local": true
  },
  {
    "type": "set",
    "device": "eth0",
    "mac": "00:11:22:33:44:55"
  },
  {
    "type": "reset",
    "device": "wlan0"
  }
]
```

Then run:

```bash
sudo spoofy batch batch.json
```

### View change history

```bash
spoofy history
```

View all MAC address changes, or filter by device:

```bash
spoofy history en0
```

### View DUID change history

```bash
spoofy duid history
```

View all DUID changes, or filter by device:

```bash
spoofy duid history en0
```

## Advanced Usage

### Verbose Mode

Get detailed debugging information:

```bash
spoofy list --verbose
spoofy randomize en0 --verbose
```

### JSON Output

Output results in JSON format for scripting:

```bash
spoofy list --json
spoofy randomize en0 --json
```

Example JSON output:
```json
{
  "success": true,
  "device": "en0",
  "mac": "00:11:22:33:44:55",
  "message": "MAC address changed successfully"
}
```

### Configuration File

Create a configuration file at `~/.spoofyrc` (or `%USERPROFILE%\.spoofyrc` on Windows):

```json
{
  "randomize": {
    "local": true
  },
  "defaults": {
    "verbose": false,
    "json": false
  }
}
```

The configuration file allows you to set default options that will be used automatically.

### Change History

All MAC address and DUID changes are automatically logged to `~/.spoofy_history.json`. You can:

- View MAC history: `spoofy history`
- View MAC history for specific device: `spoofy history en0`
- View DUID history: `spoofy duid history`
- View DUID history for specific device: `spoofy duid history en0`
- History includes timestamp, device, old/new values, and operation type
- Both MAC and DUID changes are tracked in the same history file

### Vendor Lookup

The tool includes an OUI (Organizationally Unique Identifier) database to identify device vendors:

- Automatically shown in `spoofy list` output
- Available via `spoofy vendor <mac>` command
- Helps identify device types and manufacturers

### Progress Indicators

Long-running operations show progress indicators:

```bash
⏳ Changing MAC address... ✓ Successfully set MAC address
```

### Programmatic Usage

```javascript
const spoofy = require('spoofy');

// Get current DUID
const current = spoofy.duid.getCurrentDUID();
console.log('Current DUID:', spoofy.duid.formatDUID(current));

// Parse DUID info
const info = spoofy.duid.parseDUID(current);
console.log('Type:', info.typeName);
console.log('MAC:', info.lladdr);

// Check if original is stored
if (spoofy.duid.hasOriginalDUID()) {
  const original = spoofy.duid.getOriginalDUID();
  console.log('Original DUID:', spoofy.duid.formatDUID(original));
}

// Generate a random DUID
const newDuid = spoofy.duid.generateDUID(spoofy.duid.DUID_TYPES.DUID_LL);
console.log('Generated:', spoofy.duid.formatDUID(newDuid));

// Set DUID (requires root) - automatically saves original on first call
spoofy.duid.setDUID(newDuid, 'en0');

// Randomize DUID
spoofy.duid.randomizeDUID(spoofy.duid.DUID_TYPES.DUID_LLT, 'en0');

// Sync DUID to current MAC address
spoofy.duid.syncDUID('en0', spoofy.duid.DUID_TYPES.DUID_LL);

// Restore to original DUID
spoofy.duid.restoreDUID('en0');
```

### Combined MAC + DUID Spoofing

For complete identity change on IPv6 networks, you should change both MAC and DUID.

**Recommended workflow using sync:**

```bash
sudo spoofy randomize en0      # Spoof MAC first
sudo spoofy duid sync en0      # Sync DUID to match spoofed MAC
```

The `sync` command automatically matches the DUID to your current (spoofed) MAC address.

**Alternative - randomize both separately:**

```bash
sudo spoofy randomize en0
sudo spoofy duid randomize en0
```

**Manual sync for advanced use:**

When using DUID-LL or DUID-LLT types, the DUID includes the MAC address. For consistent spoofing, ensure the MAC in your DUID matches your spoofed MAC:

```javascript
const spoofy = require('spoofy');

// Spoof MAC
const newMac = '00:11:22:33:44:55';
spoofy.setInterfaceMAC('en0', newMac, 'Wi-Fi');

// Create matching DUID
const duid = spoofy.duid.generateDUID(spoofy.duid.DUID_TYPES.DUID_LL, newMac);
spoofy.duid.setDUID(duid, 'en0');
```

## Platform Support

### macOS ✅

- ✅ **Fully supported** and tested on macOS Tahoe 26.2
- ✅ Works on macOS Sequoia 15.4+
- ⚠️ Older versions may work but are untested
- Uses `networksetup` and `ifconfig` commands
- Special handling for WiFi interfaces on modern macOS

### Windows ✅

- ✅ **Fully supported** on Windows 10 and Windows 11
- ✅ Uses PowerShell `Get-NetAdapter` and `Set-NetAdapter` commands
- ✅ Falls back to registry method for compatibility
- ⚠️ Requires Administrator privileges (run PowerShell/CMD as Administrator)
- Some network adapters may not support MAC address changes (hardware limitation)

**Windows Usage:**
```powershell
# Run PowerShell or CMD as Administrator
spoofy list
spoofy randomize "Ethernet"
spoofy set 00:11:22:33:44:55 "Wi-Fi"
```

### Linux ✅

- ✅ **Fully supported** using modern `ip link` commands
- ✅ Falls back to `ifconfig` if `ip` command is not available
- ⚠️ Requires root privileges (use `sudo`)
- Works with most modern Linux distributions

**Linux Usage:**
```bash
sudo spoofy list
sudo spoofy randomize eth0
sudo spoofy set 00:11:22:33:44:55 wlan0
```

## Known Issues

- WiFi will briefly disconnect when changing MAC address
- Some network restrictions or hardware may prevent MAC spoofing
- Requires sudo/root privileges for all MAC address and DUID changes
- DUID changes may require DHCPv6 lease renewal to take effect

## NetworkManager Integration (Linux)

On Linux systems using NetworkManager, MAC address changes may be immediately overwritten by NetworkManager if the interface is managed. `spoof-d` includes NetworkManager detection and integration to help prevent this issue.

### Automatic Detection

When changing MAC addresses on Linux, `spoof-d` automatically:
- Detects if NetworkManager is present and running
- Checks if the target interface is managed by NetworkManager
- Warns you if the interface is managed (MAC changes may be overwritten)

### Using `--nm-reconnect`

To automatically reconnect the NetworkManager device after a MAC change:

```bash
sudo spoofy randomize eth0 --nm-reconnect
```

This will:
1. Change the MAC address
2. Disconnect the device from NetworkManager
3. Reconnect the device to apply the new MAC address

### Force NetworkManager Restart

If normal reconnection doesn't work, you can force NetworkManager to restart networking (use with caution):

```bash
sudo spoofy randomize eth0 --nm-reconnect --force
```

**Warning:** The `--force` flag will temporarily disable all NetworkManager networking, which may disconnect all network interfaces briefly.

### Manual NetworkManager Management

If you prefer to manage NetworkManager manually:

1. **Temporarily disconnect the device:**
   ```bash
   nmcli dev disconnect eth0
   sudo spoofy randomize eth0
   nmcli dev connect eth0
   ```

2. **Mark device as unmanaged** (persistent):
   Edit `/etc/NetworkManager/NetworkManager.conf`:
   ```ini
   [keyfile]
   unmanaged-devices=interface-name:eth0
   ```
   Then restart NetworkManager:
   ```bash
   sudo systemctl restart NetworkManager
   ```

3. **Disable NetworkManager for specific interface** (temporary):
   ```bash
   nmcli device set eth0 managed no
   sudo spoofy randomize eth0
   nmcli device set eth0 managed yes
   ```

### Verbose Output

Use `--verbose` to see detailed NetworkManager status:

```bash
sudo spoofy randomize eth0 --verbose
```

This will show:
- NetworkManager detection method (nmcli, systemctl, etc.)
- Device management status
- Raw nmcli output for debugging

## Testing

The project includes test suites for core functionality:

### DUID Tests

Test DUID generation, parsing, and conversion:

```bash
# Run all DUID tests
npm run test:duid
# or
node test/test-duid.js

# Run specific test
node test/test-duid.js --test=generation
node test/test-duid.js --test=parsing
```

### NetworkManager Tests (Linux only)

Test NetworkManager detection and device status parsing:

```bash
# Run all NetworkManager tests
npm run test:nm
# or
node test/test-networkmanager.js

# Run specific test (parsing tests work on any platform)
node test/test-networkmanager.js --test=parsing
```

### Run All Tests

```bash
npm run test:all
```

**Note:** NetworkManager tests require a Linux system with NetworkManager installed. Parsing tests work on any platform.

## Troubleshooting

### macOS
1. Make sure you're running with `sudo` (required for network changes)
2. Ensure WiFi is turned on before attempting to change MAC
3. On modern macOS, you may need to reconnect to WiFi after the change
4. Try running `networksetup -detectnewhardware` if changes don't take effect
5. For DUID changes, you may need to disable/re-enable IPv6 or renew DHCPv6 lease

### Windows
1. **Run as Administrator**: Right-click PowerShell or Command Prompt and select "Run as Administrator"
2. Some network adapters don't support MAC address changes (hardware limitation)
3. If `Set-NetAdapter` fails, the tool will automatically try the registry method
4. You may need to disable and re-enable the adapter manually if changes don't take effect
5. Check adapter compatibility: Some virtual adapters and certain hardware may not support MAC spoofing

### Linux
1. Make sure you're running with `sudo` (required for network changes)
2. Ensure the `ip` command is available (usually in `iproute2` package)
3. **NetworkManager conflicts**: If NetworkManager is managing your interface, MAC changes may be overwritten
   - Use `--nm-reconnect` to automatically reconnect after MAC change
   - Or manually disconnect/reconnect: `nmcli dev disconnect <iface>` then `nmcli dev connect <iface>`
   - Or mark interface as unmanaged in NetworkManager config (see NetworkManager Integration section)
4. Virtual interfaces and certain hardware may not support MAC address changes
5. If MAC changes don't persist, check NetworkManager status: `nmcli device status`

## Contributing

This is an active fork. Contributions, bug reports, and feature requests are welcome!

To contribute:
1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License (inherited from original project)

## Credits

- **This fork**: [TT5H/spoof-d](https://github.com/TT5H/spoof-d) - Enhanced cross-platform support with improved error handling
- **Parent fork**: [basedbytes/spoofy](https://github.com/basedbytes/spoofy) - Modernized macOS support
- **Original project**: `spoof` by Feross Aboukhadijeh

This fork maintains compatibility with modern operating systems and extends support to Windows and Linux.
