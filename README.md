# spoof-d

[![CI](https://github.com/TT5H/spoof-d/actions/workflows/ci.yml/badge.svg)](https://github.com/TT5H/spoof-d/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/spoof-d)](https://www.npmjs.com/package/spoof-d)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Change your MAC address **and** your DHCPv6 DUID, from one command, on Windows, macOS and Linux.

```bash
npm install -g spoof-d

sudo spoofd randomize en0      # new MAC
sudo spoofd duid sync en0      # DUID follows it
```

## Why this one

Most MAC spoofers stop at layer 2. On an IPv6 network that leaves you half-disguised: your
DHCPv6 client keeps announcing the same DUID it always has, and a DUID typically embeds your
original MAC. Change the MAC alone and the two disagree — which is arguably more identifying
than not changing anything.

`spoof-d` changes both, and keeps a copy of your original DUID so you can put it back.

|  | spoof-d | macchanger | spoof |
|---|---|---|---|
| MAC spoofing | yes | yes | yes |
| DHCPv6 DUID | **yes** | no | no |
| Windows | **yes** | no | no |
| macOS | yes | no | yes |
| Linux | yes | yes | yes |
| Restore original | yes | yes | yes |

## Install

```bash
npm install -g spoof-d
```

The package is `spoof-d`; the command it installs is **`spoofd`**. Node 18 or newer is
supported and tested; the package declares Node 12 as its floor and nothing in it needs more.

Homebrew, Scoop and AUR manifests are generated per release — see [packaging/](packaging/).

> **Upgrading from 0.5.x?** The command was called `spoofy` and is now `spoofd`. The old name
> collided with an unrelated npm package that claimed the same global binary. Your `.spoofyrc`,
> saved history and stored original DUID are all still read from their old locations, so
> nothing is lost. Update any scripts that call `spoofy`.

## Quick start

```bash
spoofd list                          # what interfaces do I have?
sudo spoofd randomize en0            # give en0 a random MAC
sudo spoofd reset en0                # put the hardware MAC back
```

Every change needs root: `sudo` on macOS and Linux, an Administrator PowerShell on Windows.

Wi-Fi drops briefly when its MAC changes and may need to rejoin the network.

## MAC addresses

```bash
spoofd list                                  # all interfaces
spoofd list --wifi                           # wireless only
spoofd info en0                              # hardware MAC, current MAC, vendor, history

sudo spoofd randomize en0                    # random MAC
sudo spoofd randomize en0 --local            # set the locally-administered bit
sudo spoofd set 00:11:22:33:44:55 en0        # a specific MAC
sudo spoofd reset en0                        # back to hardware default
```

On macOS you can name the hardware port instead of the device: `sudo spoofd randomize wi-fi`.

`spoofd list` prints one line per interface:

```
- "Ethernet" on device "en4" with MAC address 70:56:51:BE:B3:00
- "Wi-Fi" on device "en0" with MAC address 70:56:51:BE:B3:01 currently set to 70:56:51:BE:B3:02
- "Bluetooth PAN" on device "en1"
```

Rebooting a Mac also restores the hardware MAC.

## DUID spoofing (DHCPv6)

A DUID identifies a DHCP client on IPv6 networks. Unlike a MAC address it is not per-interface
— it identifies the whole machine, and it survives reboots. The common DUID types embed a
link-layer address, which is usually the MAC you just went to the trouble of changing.

```bash
spoofd duid list                             # current DUID, and whether it is spoofed
spoofd duid show                             # decoded: type, embedded MAC, timestamp

sudo spoofd duid sync en0                    # match the DUID to en0's current MAC
sudo spoofd duid randomize en0               # random DUID
sudo spoofd duid randomize en0 --type=LLT    # ...of a specific type
sudo spoofd duid set 00:03:00:01:aa:bb:cc:dd:ee:ff en0

sudo spoofd duid restore en0                 # back to your ORIGINAL DUID
sudo spoofd duid reset en0                   # drop it; the system generates a NEW one
```

`restore` and `reset` are different on purpose. `restore` returns the DUID you had before you
ever used this tool. `reset` throws the current one away and lets the OS mint a fresh random
one.

### Your original is saved automatically

The first time you change your DUID, the original is written to:

| Platform | Path |
|---|---|
| macOS | `/var/db/dhcpclient/DUID.original` |
| Linux | `/var/lib/spoofd/duid.original` |
| Windows | `%PROGRAMDATA%\spoofd\duid.original` |

It is written once and never overwritten, so `spoofd duid restore` keeps working no matter how
many times you re-spoof.

### DUID types

| Type | Name | Contents |
|---|---|---|
| 1 | DUID-LLT | Link-layer address plus a timestamp (most common in the wild) |
| 2 | DUID-EN | Vendor enterprise number plus an identifier |
| 3 | DUID-LL | Link-layer address only (this tool's default) |
| 4 | DUID-UUID | A UUID |

### Changing both together

```bash
sudo spoofd randomize en0      # MAC first
sudo spoofd duid sync en0      # then point the DUID at the new MAC
```

Order matters: `sync` reads the interface's *current* MAC, so run it after the MAC change.

## Scripting

Every command takes `--json`, and exit codes mean what you'd expect — 0 on success, non-zero on
failure — so this is safe to write:

```bash
if spoofd validate "$MAC" --json > /dev/null; then
  sudo spoofd set "$MAC" en0 --json
fi
```

```bash
spoofd list --json
spoofd info en0 --json
spoofd vendor 00:50:56:11:22:33 --json
```

```json
{
  "mac": "00:50:56:11:22:33",
  "vendor": "VMware",
  "prefix": "00:50:56",
  "found": true,
  "source": "bundled"
}
```

`source` is `bundled` for the table that ships with the package and `ieee` for the downloaded
registry, so you can tell how much confidence to place in a name.

Batch several changes from a file:

```json
[
  { "type": "randomize", "device": "en0", "local": true },
  { "type": "set", "device": "eth0", "mac": "00:11:22:33:44:55" },
  { "type": "reset", "device": "wlan0" }
]
```

```bash
sudo spoofd batch batch.json
```

## Vendor lookup

```bash
spoofd vendor 00:1B:63:11:22:33
spoofd vendor --update            # download the full IEEE registry
```

A small table of common prefixes ships with the package, so lookups work offline and out of the
box — but it only covers a few hundred of the roughly 35,000 IEEE assignments. `--update`
fetches the full registry once and caches it at `~/.spoofd/oui.json`. Nothing here touches the
network unless you ask it to.

`spoofd randomize` does not generate a uniformly random address. It picks one of eight
virtual-machine vendor prefixes — VMware, VirtualBox, Hyper-V, Xen, Parallels — and randomises
the rest, so the result looks like an ordinary VM NIC rather than something impossible, and is
very unlikely to collide with real hardware on the network. That is why `spoofd vendor` names a
vendor for a randomised address.

Pass `--local` if you would rather set the locally-administered bit, which marks the address as
explicitly not manufacturer-assigned.

## History and configuration

Every MAC and DUID change is logged to `~/.spoofd_history.json` (the last 100).

```bash
spoofd history                 # all MAC changes
spoofd history en0             # just this device
spoofd duid history            # DUID changes
```

Defaults can live in `~/.spoofdrc`:

```json
{
  "randomize": { "local": true },
  "defaults": { "verbose": false, "json": false }
}
```

## Shell completions

```bash
spoofd completion                    # detects your shell and installs
spoofd completion --shell=zsh        # or name it
```

bash, zsh, fish and PowerShell are supported. Completions know the command list, the flags, and
your actual interface names.

## Platform notes

| | Status | How it works | Needs |
|---|---|---|---|
| **macOS** | Tested on Sequoia 15.4+ and Tahoe 26 | `networksetup`, with timing handling for Wi-Fi | `sudo` |
| **Windows** | Windows 10 and 11 | PowerShell `Set-NetAdapter`, falling back to the registry | Administrator |
| **Linux** | Modern distributions | `ip link`, falling back to `ifconfig` | `sudo`, `iproute2` |

Some adapters — plenty of virtual ones, and a few physical — simply refuse MAC changes. That is
a hardware and driver limitation, not something a tool can work around.

### NetworkManager (Linux)

If NetworkManager manages an interface, it will often overwrite a MAC change moments after you
make it. `spoofd` detects this and warns you.

```bash
sudo spoofd randomize eth0 --nm-reconnect          # change, disconnect, reconnect
sudo spoofd randomize eth0 --nm-reconnect --force  # last resort: restart NM networking
```

`--force` briefly takes down *all* NetworkManager networking, so keep it for when reconnecting
the single device isn't enough.

To handle it yourself instead:

```bash
nmcli dev disconnect eth0 && sudo spoofd randomize eth0 && nmcli dev connect eth0
```

Or mark the interface unmanaged in `/etc/NetworkManager/NetworkManager.conf`:

```ini
[keyfile]
unmanaged-devices=interface-name:eth0
```

`--verbose` shows how NetworkManager was detected and what it reported.

## Library

```javascript
const spoofd = require('spoof-d')

spoofd.normalize('00-11-22-33-44-55')        // '00:11:22:33:44:55'
spoofd.randomize()                            // '00:16:3E:09:49:10'  (a VM vendor prefix)
spoofd.randomize(true)                        // '02:03:FF:45:52:6B'  (locally administered)
spoofd.findInterfaces()                       // [{ device, port, address, currentAddress }]
await spoofd.setInterfaceMAC('en0', '00:11:22:33:44:55', 'Wi-Fi')
```

DUID operations live under `spoofd.duid`:

```javascript
const current = spoofd.duid.getCurrentDUID()
console.log(spoofd.duid.formatDUID(current))

const info = spoofd.duid.parseDUID(current)
console.log(info.typeName, info.lladdr)

const fresh = spoofd.duid.generateDUID(spoofd.duid.DUID_TYPES.DUID_LL)
spoofd.duid.setDUID(fresh, 'en0')            // saves your original on first call
spoofd.duid.restoreDUID('en0')
```

Failures throw typed errors carrying a `code` and actionable `suggestions`, so you can tell a
bad argument from a missing privilege:

```javascript
try {
  await spoofd.setInterfaceMAC('en0', mac, 'Wi-Fi')
} catch (err) {
  if (err instanceof spoofd.PermissionError) console.error('needs root:', err.suggestions)
  else if (err instanceof spoofd.ValidationError) console.error('bad input:', err.message)
}
```

`SpoofdError` is the base class; `ValidationError`, `PermissionError`, `NetworkError` and
`PlatformError` extend it.

## Troubleshooting

**The change didn't stick.** On Linux this is almost always NetworkManager — see above. On
macOS try `networksetup -detectnewhardware`. On Windows, disable and re-enable the adapter.

**Windows says access denied.** PowerShell has to be started as Administrator; elevating
afterwards doesn't apply to an already-running shell.

**`spoofd list` shows nothing on Linux.** Install `iproute2` so `ip` exists.

**The DUID change had no effect.** DHCPv6 clients cache their lease. Renew it, or toggle IPv6
on the interface.

**`vendor` says Unknown.** Either the address is locally administered (no vendor exists) or the
prefix isn't in the bundled table — run `spoofd vendor --update`.

## Development

```bash
npm install
npm test           # lint (standard)
npm run test:all   # CLI, OUI, DUID and NetworkManager suites
```

CI runs the lint, all four suites across Ubuntu, macOS and Windows on Node 18, 20 and 22, and
installs the packed tarball to check the published artifact actually runs.

Individual suites: `npm run test:cli`, `test:oui`, `test:duid`, `test:nm`. The NetworkManager
suite skips itself off Linux.

## Contributing

Bug reports and pull requests are welcome. Please make sure `npm test` and `npm run test:all`
pass before opening one.

## Credits

A fork of [basedbytes/spoofy](https://github.com/basedbytes/spoofy), which forked
[`spoof`](https://github.com/feross/spoof) by Feross Aboukhadijeh.

This fork adds DHCPv6 DUID spoofing, Windows support, NetworkManager integration, typed errors,
verification with retries, shell completions, batch operations and change history, and replaces
the deprecated macOS `airport` path with `networksetup`.

## License

MIT
