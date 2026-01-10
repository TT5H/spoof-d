# spoof-d

[![npm version](https://img.shields.io/npm/v/spoof-d)](https://www.npmjs.com/package/spoof-d)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub forks](https://img.shields.io/github/forks/TT5H/spoof-d)](https://github.com/TT5H/spoof-d/network)
[![GitHub stars](https://img.shields.io/github/stars/TT5H/spoof-d)](https://github.com/TT5H/spoof-d/stargazers)

> **✅ Cross-Platform Support**: This is a modernized fork of the original `spoof` project, updated for compatibility with modern macOS (Sequoia 15.4+, Tahoe 26+), Windows 10/11, and Linux. All platforms are now fully supported!

### Easily spoof your MAC address on macOS, Windows, and Linux!

A Node.js utility for changing MAC addresses across all major platforms. Features reliable macOS support, modern Windows PowerShell integration, and Linux `ip link` commands. This fork includes enhanced error handling, automatic verification, retry logic, and improved cross-platform compatibility.

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
- **Change history tracking** with ability to view and revert changes
- **Batch operations** for changing multiple interfaces at once
- **DUID (DHCPv6) spoofing** for complete IPv6 network identity management

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

All MAC address changes are automatically logged to `~/.spoofy_history.json`. You can:

- View history: `spoofy history`
- View history for specific device: `spoofy history en0`
- History includes timestamp, device, old MAC, new MAC, and operation type

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
- Requires sudo/root privileges for all MAC address changes

## Troubleshooting

### macOS
1. Make sure you're running with `sudo` (required for network changes)
2. Ensure WiFi is turned on before attempting to change MAC
3. On modern macOS, you may need to reconnect to WiFi after the change
4. Try running `networksetup -detectnewhardware` if changes don't take effect

### Windows
1. **Run as Administrator**: Right-click PowerShell or Command Prompt and select "Run as Administrator"
2. Some network adapters don't support MAC address changes (hardware limitation)
3. If `Set-NetAdapter` fails, the tool will automatically try the registry method
4. You may need to disable and re-enable the adapter manually if changes don't take effect
5. Check adapter compatibility: Some virtual adapters and certain hardware may not support MAC spoofing

### Linux
1. Make sure you're running with `sudo` (required for network changes)
2. Ensure the `ip` command is available (usually in `iproute2` package)
3. Some network interfaces may be managed by NetworkManager - you may need to disable it temporarily
4. Virtual interfaces and certain hardware may not support MAC address changes

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
