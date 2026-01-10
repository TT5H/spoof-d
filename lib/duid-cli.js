#!/usr/bin/env node

const duid = require('./duid')
const os = require('os')
const chalk = require('chalk')
const history = require('./history')

// Get global flags from parent CLI (if available)
let VERBOSE = false
let JSON_OUTPUT = false

// Try to get verbose/json flags from environment or parent
if (typeof process.env.SPOOFY_VERBOSE !== 'undefined') {
  VERBOSE = process.env.SPOOFY_VERBOSE === 'true'
}
if (typeof process.env.SPOOFY_JSON !== 'undefined') {
  JSON_OUTPUT = process.env.SPOOFY_JSON === 'true'
}

function logVerbose (message) {
  if (VERBOSE && !JSON_OUTPUT) {
    console.error(chalk.gray(`[VERBOSE] ${message}`))
  }
}

function outputJSON (data) {
  if (JSON_OUTPUT) {
    console.log(JSON.stringify(data, null, 2))
  }
}

function printDUIDInfo (duidBuf) {
  if (!duidBuf) {
    if (JSON_OUTPUT) {
      outputJSON({ duid: null, message: 'No DUID currently set' })
    } else {
      console.log(chalk.blue('ℹ'), 'No DUID currently set (system will generate on next DHCPv6 request)')
    }
    return
  }

  const parsed = duid.parseDUID(duidBuf)

  if (JSON_OUTPUT) {
    outputJSON({
      duid: parsed.raw,
      type: parsed.type,
      typeName: parsed.typeName,
      hwType: parsed.hwType,
      lladdr: parsed.lladdr,
      time: parsed.time,
      timeDate: parsed.timeDate ? parsed.timeDate.toISOString() : null,
      uuid: parsed.uuid,
      enterpriseNumber: parsed.enterpriseNumber,
      identifier: parsed.identifier
    })
    return
  }

  console.log()
  console.log(chalk.bold.cyan('Current DUID:'))
  console.log(`  Raw:  ${chalk.cyan(parsed.raw)}`)
  console.log(`  Type: ${chalk.green(parsed.typeName)} (${parsed.type})`)

  if (parsed.lladdr) {
    console.log(`  Link-layer address: ${chalk.cyan(parsed.lladdr)}`)
  }
  if (parsed.hwType !== undefined) {
    console.log(`  Hardware type: ${parsed.hwType} (${parsed.hwType === 1 ? 'Ethernet' : 'Other'})`)
  }
  if (parsed.timeDate) {
    console.log(`  Timestamp: ${parsed.timeDate.toISOString()}`)
  }
  if (parsed.uuid) {
    console.log(`  UUID: ${parsed.uuid}`)
  }
  if (parsed.enterpriseNumber !== undefined) {
    console.log(`  Enterprise Number: ${parsed.enterpriseNumber}`)
    console.log(`  Identifier: ${parsed.identifier}`)
  }
  console.log()
}

function checkPrivileges () {
  if (os.platform() === 'win32') {
    try {
      require('child_process').execSync('net session', { stdio: 'pipe' })
      return true
    } catch (e) {
      return false
    }
  } else {
    return process.getuid && process.getuid() === 0
  }
}

const commands = {
  list () {
    try {
      const current = duid.getCurrentDUID()
      printDUIDInfo(current)

      // Show original DUID status
      if (duid.hasOriginalDUID()) {
        const original = duid.getOriginalDUID()
        const isSpoofed = current && original && !current.equals(original)

        if (!JSON_OUTPUT) {
          console.log(chalk.bold('Original DUID Status:'))
          console.log(`  Stored: ${chalk.green('Yes')}`)
          console.log(`  Location: ${duid.getOriginalDUIDPath()}`)

          if (isSpoofed) {
            console.log(`  Status: ${chalk.yellow('Currently spoofed')}`)
            console.log(`  Original: ${duid.formatDUID(original)}`)
          } else if (current && original && current.equals(original)) {
            console.log(`  Status: ${chalk.green('Using original DUID')}`)
          }
          console.log()
        } else {
          outputJSON({
            originalStored: true,
            originalPath: duid.getOriginalDUIDPath(),
            isSpoofed: isSpoofed,
            original: original ? duid.formatDUID(original) : null
          })
        }
      } else {
        if (!JSON_OUTPUT) {
          console.log(chalk.gray('No original DUID stored yet (will be saved on first spoof)'))
          console.log()
        } else {
          outputJSON({ originalStored: false })
        }
      }
    } catch (e) {
      if (JSON_OUTPUT) {
        outputJSON({ error: e.message, success: false })
      } else {
        console.error(chalk.red('✗'), `Failed to get DUID: ${e.message}`)
      }
      process.exit(1)
    }
  },

  /**
   * Show current DUID (alias)
   */
  show () {
    this.list()
  },

  /**
   * Show/manage original DUID
   */
  original (args) {
    const subcommand = args[0] || 'show'

    switch (subcommand) {
      case 'show': {
        if (duid.hasOriginalDUID()) {
          const original = duid.getOriginalDUID()
          if (JSON_OUTPUT) {
            outputJSON({
              original: duid.formatDUID(original),
              path: duid.getOriginalDUIDPath(),
              parsed: duid.parseDUID(original)
            })
          } else {
            console.log()
            console.log(chalk.bold('Original DUID (stored):'))
            printDUIDInfo(original)
            console.log(`Storage location: ${duid.getOriginalDUIDPath()}`)
          }
        } else {
          if (JSON_OUTPUT) {
            outputJSON({ original: null, message: 'No original DUID stored' })
          } else {
            console.log(chalk.blue('ℹ'), 'No original DUID stored yet.')
            console.log(chalk.blue('ℹ'), 'The original will be automatically saved when you first spoof the DUID.')
          }
        }
        break
      }

      case 'clear': {
        if (!checkPrivileges()) {
          if (JSON_OUTPUT) {
            outputJSON({ error: 'Requires root/administrator privileges', success: false })
          } else {
            console.error(chalk.red('✗'), 'This command requires root/administrator privileges')
          }
          process.exit(1)
        }

        if (duid.hasOriginalDUID()) {
          // Check for --force flag
          if (!args.includes('--force')) {
            if (JSON_OUTPUT) {
              outputJSON({ error: '--force flag required', success: false })
            } else {
              console.log()
              console.log(chalk.yellow('⚠'), 'WARNING: This will delete the stored original DUID.')
              console.log(chalk.yellow('⚠'), 'You will not be able to restore to the original after this.')
              console.log()
              console.log(chalk.blue('ℹ'), 'To confirm, run: spoofy duid original clear --force')
            }
            process.exit(1)
          }

          duid.clearOriginalDUID()
          if (JSON_OUTPUT) {
            outputJSON({ success: true, message: 'Original DUID storage cleared' })
          } else {
            console.log(chalk.green('✓'), 'Original DUID storage cleared.')
          }
        } else {
          if (JSON_OUTPUT) {
            outputJSON({ success: true, message: 'No original DUID stored' })
          } else {
            console.log(chalk.blue('ℹ'), 'No original DUID stored.')
          }
        }
        break
      }

      case 'path': {
        if (JSON_OUTPUT) {
          outputJSON({ path: duid.getOriginalDUIDPath() })
        } else {
          console.log(duid.getOriginalDUIDPath())
        }
        break
      }

      default:
        if (JSON_OUTPUT) {
          outputJSON({ error: `Unknown subcommand: ${subcommand}`, success: false })
        } else {
          console.error(chalk.red('✗'), `Unknown subcommand: ${subcommand}`)
          console.log(chalk.blue('ℹ'), 'Usage: spoofy duid original [show|clear|path]')
        }
        process.exit(1)
    }
  },

  /**
   * Randomize DUID
   */
  randomize (args) {
    if (!checkPrivileges()) {
      if (JSON_OUTPUT) {
        outputJSON({ error: 'Requires root/administrator privileges', success: false })
      } else {
        console.error(chalk.red('✗'), 'This command requires root/administrator privileges')
        console.log(chalk.blue('ℹ'), 'Try: sudo spoofy duid randomize [interface]')
      }
      process.exit(1)
    }

    const iface = args[0] || null
    const typeArg = args.find(a => a.startsWith('--type='))
    let duidType = duid.DUID_TYPES.DUID_LL // Default

    if (typeArg) {
      const typeStr = typeArg.split('=')[1].toUpperCase()
      if (typeStr === 'LLT' || typeStr === '1') duidType = duid.DUID_TYPES.DUID_LLT
      else if (typeStr === 'EN' || typeStr === '2') duidType = duid.DUID_TYPES.DUID_EN
      else if (typeStr === 'LL' || typeStr === '3') duidType = duid.DUID_TYPES.DUID_LL
      else if (typeStr === 'UUID' || typeStr === '4') duidType = duid.DUID_TYPES.DUID_UUID
    }

    try {
      logVerbose(`Generating random DUID (type: ${Object.keys(duid.DUID_TYPES).find(k => duid.DUID_TYPES[k] === duidType)})...`)

      // Get old DUID for history
      const oldDuid = duid.getCurrentDUID()
      const oldDuidStr = oldDuid ? duid.formatDUID(oldDuid) : null

      const newDuid = duid.randomizeDUID(duidType, iface, null, true) // Verify enabled
      const newDuidStr = duid.formatDUID(newDuid)

      // Log to history
      history.addDUIDHistoryEntry(iface || 'system', oldDuidStr, newDuidStr, 'randomize', iface)

      if (JSON_OUTPUT) {
        outputJSON({
          success: true,
          duid: duid.formatDUID(newDuid),
          type: duidType,
          interface: iface,
          parsed: duid.parseDUID(newDuid)
        })
      } else {
        console.log(chalk.green('✓'), 'DUID changed successfully!')
        printDUIDInfo(newDuid)

        if (iface) {
          console.log(chalk.blue('ℹ'), `Applied to interface: ${iface}`)
        }

        console.log(chalk.blue('ℹ'), 'Note: You may need to renew your DHCPv6 lease for changes to take effect.')
        console.log(chalk.blue('ℹ'), 'The original DUID has been backed up and can be restored with: spoofy duid restore')
      }
    } catch (e) {
      if (JSON_OUTPUT) {
        outputJSON({ error: e.message, success: false })
      } else {
        console.error(chalk.red('✗'), `Failed to set DUID: ${e.message}`)
      }
      process.exit(1)
    }
  },

  /**
   * Set specific DUID
   */
  set (args) {
    if (!checkPrivileges()) {
      if (JSON_OUTPUT) {
        outputJSON({ error: 'Requires root/administrator privileges', success: false })
      } else {
        console.error(chalk.red('✗'), 'This command requires root/administrator privileges')
        console.log(chalk.blue('ℹ'), 'Try: sudo spoofy duid set <duid-hex> [interface]')
      }
      process.exit(1)
    }

    if (args.length < 1) {
      if (JSON_OUTPUT) {
        outputJSON({ error: 'DUID hex string required', success: false })
      } else {
        console.error(chalk.red('✗'), 'Usage: spoofy duid set <duid-hex> [interface]')
        console.log(chalk.blue('ℹ'), 'Example: spoofy duid set 00:03:00:01:aa:bb:cc:dd:ee:ff en0')
      }
      process.exit(1)
    }

    const duidHex = args[0]
    const iface = args[1] || null

    try {
      const duidBuf = duid.hexToDuid(duidHex)

      logVerbose(`Setting DUID to: ${duid.formatDUID(duidBuf)}`)

      // Get old DUID for history
      const oldDuid = duid.getCurrentDUID()
      const oldDuidStr = oldDuid ? duid.formatDUID(oldDuid) : null

      duid.setDUID(duidBuf, iface, true) // Verify enabled
      const newDuidStr = duid.formatDUID(duidBuf)

      // Log to history
      history.addDUIDHistoryEntry(iface || 'system', oldDuidStr, newDuidStr, 'set', iface)

      if (JSON_OUTPUT) {
        outputJSON({
          success: true,
          duid: duid.formatDUID(duidBuf),
          interface: iface,
          parsed: duid.parseDUID(duidBuf)
        })
      } else {
        console.log(chalk.green('✓'), 'DUID changed successfully!')
        printDUIDInfo(duidBuf)

        console.log(chalk.blue('ℹ'), 'The original DUID has been backed up and can be restored with: spoofy duid restore')
      }
    } catch (e) {
      if (JSON_OUTPUT) {
        outputJSON({ error: e.message, success: false })
      } else {
        console.error(chalk.red('✗'), `Failed to set DUID: ${e.message}`)
      }
      process.exit(1)
    }
  },

  /**
   * Reset DUID to system default
   */
  reset (args) {
    if (!checkPrivileges()) {
      if (JSON_OUTPUT) {
        outputJSON({ error: 'Requires root/administrator privileges', success: false })
      } else {
        console.error(chalk.red('✗'), 'This command requires root/administrator privileges')
        console.log(chalk.blue('ℹ'), 'Try: sudo spoofy duid reset [interface]')
      }
      process.exit(1)
    }

    const iface = args[0] || null

    try {
      logVerbose('Resetting DUID to system default...')

      // Get old DUID for history
      const oldDuid = duid.getCurrentDUID()
      const oldDuidStr = oldDuid ? duid.formatDUID(oldDuid) : null

      duid.resetDUID(iface)

      // Log to history (new DUID will be generated by system, so we mark as null)
      history.addDUIDHistoryEntry(iface || 'system', oldDuidStr, null, 'reset', iface)

      if (JSON_OUTPUT) {
        outputJSON({
          success: true,
          message: 'DUID reset successfully',
          interface: iface
        })
      } else {
        console.log(chalk.green('✓'), 'DUID reset successfully!')
        console.log(chalk.blue('ℹ'), 'The system will generate a new DUID on the next DHCPv6 request.')
      }
    } catch (e) {
      if (JSON_OUTPUT) {
        outputJSON({ error: e.message, success: false })
      } else {
        console.error(chalk.red('✗'), `Failed to reset DUID: ${e.message}`)
      }
      process.exit(1)
    }
  },

  /**
   * Restore DUID to original (pre-spoofing) value
   */
  restore (args) {
    if (!checkPrivileges()) {
      if (JSON_OUTPUT) {
        outputJSON({ error: 'Requires root/administrator privileges', success: false })
      } else {
        console.error(chalk.red('✗'), 'This command requires root/administrator privileges')
        console.log(chalk.blue('ℹ'), 'Try: sudo spoofy duid restore [interface]')
      }
      process.exit(1)
    }

    const iface = args[0] || null

    // Check if original exists
    if (!duid.hasOriginalDUID()) {
      if (JSON_OUTPUT) {
        outputJSON({ error: 'No original DUID stored', success: false })
      } else {
        console.error(chalk.red('✗'), 'No original DUID stored.')
        console.log(chalk.blue('ℹ'), 'The original DUID is automatically saved when you first use randomize or set.')
        console.log(chalk.blue('ℹ'), 'If you have never spoofed the DUID, there is nothing to restore.')
      }
      process.exit(1)
    }

    try {
      // Get old DUID for history
      const oldDuid = duid.getCurrentDUID()
      const oldDuidStr = oldDuid ? duid.formatDUID(oldDuid) : null

      const result = duid.restoreDUID(iface, true) // Verify enabled

      if (result === 'not_spoofed') {
        if (JSON_OUTPUT) {
          outputJSON({ success: true, message: 'DUID is already set to the original value', duid: duid.formatDUID(duid.getCurrentDUID()) })
        } else {
          console.log(chalk.blue('ℹ'), 'DUID is already set to the original value.')
          printDUIDInfo(duid.getCurrentDUID())
        }
      } else if (result) {
        // Get restored DUID for history
        const restoredDuid = duid.getCurrentDUID()
        const restoredDuidStr = restoredDuid ? duid.formatDUID(restoredDuid) : null

        // Log to history
        history.addDUIDHistoryEntry(iface || 'system', oldDuidStr, restoredDuidStr, 'restore', iface)

        if (JSON_OUTPUT) {
          outputJSON({
            success: true,
            message: 'DUID restored to original',
            duid: restoredDuidStr,
            parsed: duid.parseDUID(restoredDuid)
          })
        } else {
          console.log(chalk.green('✓'), 'DUID restored to original!')
          printDUIDInfo(restoredDuid)
          console.log(chalk.blue('ℹ'), 'You may need to renew your DHCPv6 lease for changes to take effect.')
        }
      } else {
        if (JSON_OUTPUT) {
          outputJSON({ error: 'Failed to restore DUID', success: false })
        } else {
          console.error(chalk.red('✗'), 'Failed to restore DUID')
        }
      }
    } catch (e) {
      if (JSON_OUTPUT) {
        outputJSON({ error: e.message, success: false })
      } else {
        console.error(chalk.red('✗'), `Failed to restore DUID: ${e.message}`)
      }
      process.exit(1)
    }
  },

  /**
   * Generate a DUID without applying it
   */
  generate (args) {
    const typeArg = args.find(a => a.startsWith('--type='))
    const macArg = args.find(a => a.startsWith('--mac='))

    let duidType = duid.DUID_TYPES.DUID_LL
    let mac = null

    if (typeArg) {
      const typeStr = typeArg.split('=')[1].toUpperCase()
      if (typeStr === 'LLT' || typeStr === '1') duidType = duid.DUID_TYPES.DUID_LLT
      else if (typeStr === 'EN' || typeStr === '2') duidType = duid.DUID_TYPES.DUID_EN
      else if (typeStr === 'LL' || typeStr === '3') duidType = duid.DUID_TYPES.DUID_LL
      else if (typeStr === 'UUID' || typeStr === '4') duidType = duid.DUID_TYPES.DUID_UUID
    }

    if (macArg) {
      mac = macArg.split('=')[1]
    }

    const generated = duid.generateDUID(duidType, mac)

    if (JSON_OUTPUT) {
      outputJSON({
        duid: duid.formatDUID(generated),
        type: duidType,
        mac: mac,
        parsed: duid.parseDUID(generated)
      })
    } else {
      console.log()
      console.log(chalk.bold('Generated DUID:'))
      printDUIDInfo(generated)

      console.log(chalk.blue('ℹ'), 'To apply this DUID, use:')
      console.log(`  sudo spoofy duid set ${duid.formatDUID(generated)} [interface]`)
      console.log()
    }
  },

  sync (args) {
    if (!checkPrivileges()) {
      if (JSON_OUTPUT) {
        outputJSON({ error: 'Requires root/administrator privileges', success: false })
      } else {
        console.error(chalk.red('✗'), 'This command requires root/administrator privileges')
        console.log(chalk.blue('ℹ'), 'Try: sudo spoofy duid sync <interface>')
      }
      process.exit(1)
    }

    if (args.length < 1) {
      if (JSON_OUTPUT) {
        outputJSON({ error: 'Interface name required', success: false })
      } else {
        console.error(chalk.red('✗'), 'Usage: spoofy duid sync <interface> [--type=<type>]')
        console.log(chalk.blue('ℹ'), 'Example: sudo spoofy duid sync en0 --type=LLT')
      }
      process.exit(1)
    }

    const iface = args[0]
    const typeArg = args.find(a => a.startsWith('--type='))
    let duidType = duid.DUID_TYPES.DUID_LL

    if (typeArg) {
      const typeStr = typeArg.split('=')[1].toUpperCase()
      if (typeStr === 'LLT' || typeStr === '1') duidType = duid.DUID_TYPES.DUID_LLT
      else if (typeStr === 'EN' || typeStr === '2') duidType = duid.DUID_TYPES.DUID_EN
      else if (typeStr === 'LL' || typeStr === '3') duidType = duid.DUID_TYPES.DUID_LL
      else if (typeStr === 'UUID' || typeStr === '4') duidType = duid.DUID_TYPES.DUID_UUID
    }

    try {
      logVerbose(`Syncing DUID to current MAC address of ${iface}...`)

      const currentMac = duid.getCurrentMACAddress(iface)
      if (!currentMac) {
        throw new Error(`Could not get MAC address for interface: ${iface}`)
      }

      if (!JSON_OUTPUT) {
        console.log(`  Current MAC: ${chalk.cyan(currentMac)}`)
      }

      // Get old DUID for history
      const oldDuid = duid.getCurrentDUID()
      const oldDuidStr = oldDuid ? duid.formatDUID(oldDuid) : null

      const newDuid = duid.syncDUID(iface, duidType, true) // Verify enabled
      const newDuidStr = duid.formatDUID(newDuid)

      // Log to history
      history.addDUIDHistoryEntry(iface, oldDuidStr, newDuidStr, 'sync', iface)

      if (JSON_OUTPUT) {
        outputJSON({
          success: true,
          duid: duid.formatDUID(newDuid),
          mac: currentMac,
          interface: iface,
          parsed: duid.parseDUID(newDuid)
        })
      } else {
        console.log(chalk.green('✓'), 'DUID synced to current MAC address!')
        printDUIDInfo(newDuid)

        console.log(chalk.blue('ℹ'), 'The DUID now matches the current MAC address.')
        console.log(chalk.blue('ℹ'), 'The original DUID has been backed up and can be restored with: spoofy duid restore')
      }
    } catch (e) {
      if (JSON_OUTPUT) {
        outputJSON({ error: e.message, success: false })
      } else {
        console.error(chalk.red('✗'), `Failed to sync DUID: ${e.message}`)
        console.log(chalk.blue('ℹ'), 'Make sure the interface name is correct and the interface is up')
      }
      process.exit(1)
    }
  },

  history (args) {
    const device = args[0] // Optional device filter
    logVerbose(device ? `Getting DUID history for device: ${device}` : 'Getting all DUID history')

    const allHistory = history.getDUIDHistory()
    const deviceHistory = device ? history.getDUIDHistoryForDevice(device) : allHistory

    if (deviceHistory.length === 0) {
      if (JSON_OUTPUT) {
        outputJSON({ history: [], count: 0, type: 'duid' })
      } else {
        console.log(chalk.yellow('No DUID history found' + (device ? ` for device "${device}"` : '')))
      }
      return
    }

    if (JSON_OUTPUT) {
      outputJSON({
        history: deviceHistory,
        count: deviceHistory.length,
        device: device || 'all',
        type: 'duid'
      })
      return
    }

    console.log(chalk.bold.cyan('\nDUID Change History'))
    console.log(chalk.gray('─'.repeat(80)))

    deviceHistory.forEach((entry, index) => {
      const date = new Date(entry.timestamp).toLocaleString()
      console.log(chalk.bold(`\n${index + 1}. ${date}`))
      console.log(`   Device: ${chalk.green(entry.device)}`)
      console.log(`   Operation: ${chalk.cyan(entry.operation)}`)
      console.log(`   ${chalk.gray(entry.oldDuid || 'N/A')} → ${chalk.cyan(entry.newDuid || 'System Generated')}`)
      console.log(`   Platform: ${entry.platform}`)
    })

    console.log()
  },

  help () {
    if (JSON_OUTPUT) {
      outputJSON({
        commands: ['list', 'show', 'randomize', 'set', 'sync', 'restore', 'reset', 'generate', 'original', 'help'],
        description: 'DHCPv6 DUID spoofing utility'
      })
    } else {
      console.log(`
${chalk.bold('spoofy duid')} - DHCPv6 DUID spoofing utility

${chalk.bold('COMMANDS:')}
  list, show              Show current DUID and original status
  randomize [iface]       Generate and set a random DUID
  set <duid> [iface]      Set a specific DUID
  sync <iface>            ${chalk.cyan('Sync DUID to current MAC address')}
  restore [iface]         ${chalk.green('Restore to the original (pre-spoofing) DUID')}
  reset [iface]           Reset DUID (system generates NEW one, not original)
  generate                Generate a DUID (without applying)
  history [device]        View DUID change history
  original [subcommand]   Manage stored original DUID
  help                    Show this help message

${chalk.bold('ORIGINAL SUBCOMMANDS:')}
  original show           Show the stored original DUID
  original path           Show storage path for original DUID
  original clear --force  Delete the stored original (use with caution!)

${chalk.bold('OPTIONS:')}
  --type=<type>           DUID type: LLT (1), EN (2), LL (3), UUID (4)
                          Default: LL
  --mac=<address>         MAC address to use for DUID generation

${chalk.bold('EXAMPLES:')}
  spoofy duid list
  sudo spoofy duid randomize en0
  sudo spoofy duid randomize eth0 --type=LLT
  sudo spoofy duid set 00:03:00:01:aa:bb:cc:dd:ee:ff
  sudo spoofy duid sync en0                   # Sync DUID to current MAC
  sudo spoofy duid restore                    # Restore original DUID
  sudo spoofy duid reset                      # Generate new system DUID
  spoofy duid history                         # View all DUID changes
  spoofy duid history en0                     # View DUID changes for en0
  spoofy duid generate --type=UUID
  spoofy duid original show

${chalk.bold('DUID TYPES:')}
  LLT (1)   Link-layer address + timestamp (most common)
  EN  (2)   Enterprise number + identifier
  LL  (3)   Link-layer address only
  UUID (4)  UUID-based identifier

${chalk.bold('RESTORE vs RESET:')}
  ${chalk.green('restore')}  - Returns to your ORIGINAL DUID (saved on first spoof)
  ${chalk.yellow('reset')}    - Deletes DUID, system generates a NEW random one

${chalk.bold('TYPICAL WORKFLOW:')}
  ${chalk.cyan('sudo spoofy randomize en0')}      # Spoof MAC first
  ${chalk.cyan('sudo spoofy duid sync en0')}      # Sync DUID to match spoofed MAC

  This ensures both layers show the same spoofed identity.

${chalk.bold('ORIGINAL DUID STORAGE:')}
  The first time you spoof, your original DUID is automatically saved.
  This allows you to restore it later with 'spoofy duid restore'.
  
  Storage locations:
    macOS:   /var/db/dhcpclient/DUID.original
    Linux:   /var/lib/spoofy/duid.original
    Windows: %PROGRAMDATA%\\spoofy\\duid.original

${chalk.bold('NOTES:')}
  - Requires root/administrator privileges for set/randomize/reset/restore
  - Changes persist until reboot (macOS) or service restart
  - On macOS, active DUID is stored in /var/db/dhcpclient/DUID
  - On Linux, location depends on DHCP client (systemd/dhclient/NetworkManager)
  - On Windows, DUID is stored in the registry
`)
    }
  }
}

/**
 * Integration function to add DUID commands to existing spoofy CLI
 */
function run (args, verbose = false, json = false) {
  VERBOSE = verbose
  JSON_OUTPUT = json
  
  const command = args[0] || 'help'
  const commandArgs = args.slice(1)

  if (commands[command]) {
    commands[command](commandArgs)
  } else {
    if (JSON_OUTPUT) {
      outputJSON({ error: `Unknown command: ${command}`, success: false })
    } else {
      console.error(chalk.red('✗'), `Unknown command: ${command}`)
      commands.help()
    }
    process.exit(1)
  }
}

// Export for integration
module.exports = { run, commands }

// Run standalone if executed directly
if (require.main === module) {
  run(process.argv.slice(2))
}
