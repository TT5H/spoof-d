#!/usr/bin/env node

/**
 * CLI smoke tests.
 *
 * These spawn the real binary and assert it starts and exits cleanly. They
 * exist to catch packaging regressions -- an ESM-only dependency, a bad
 * require, a syntax error -- which unit tests on the parsers cannot see. The
 * 0.5.4/0.5.5 releases shipped an ESM-only `ora`, so every command that draws
 * a spinner died with "ora is not a function"; a single run of `spoofd list`
 * would have caught it.
 *
 * Everything here must pass on any machine: no root, no network, and no
 * assumptions about which interfaces exist.
 */

const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const assert = require('assert')

const CLI = path.join(__dirname, '..', 'bin', 'cmd.js')
const ROOT = path.join(__dirname, '..')

let passed = 0
let failed = 0

// Signatures of a process that died rather than reporting a problem it
// understood. A real error path prints "✗ Error: ..." and these stay absent.
const CRASH_PATTERNS = [
  /is not a function/,
  /ERR_REQUIRE_ESM/,
  /Cannot find module/,
  /ReferenceError/,
  /SyntaxError/,
  /TypeError/,
  /UnhandledPromiseRejection/
]

function run (args) {
  return spawnSync(process.execPath, [CLI].concat(args), {
    encoding: 'utf8',
    timeout: 30000
  })
}

function output (result) {
  return (result.stdout || '') + (result.stderr || '')
}

function assertStarted (result, args) {
  assert.ok(!result.error, 'spoofd ' + args.join(' ') + ' failed to start: ' + result.error)
  assert.ok(!result.signal, 'spoofd ' + args.join(' ') + ' was killed by ' + result.signal)
}

function assertNoCrash (result, args) {
  const text = output(result)
  for (const pattern of CRASH_PATTERNS) {
    assert.ok(!pattern.test(text), 'spoofd ' + args.join(' ') + ' crashed (matched ' + pattern + '):\n' + text)
  }
}

function test (name, fn) {
  try {
    fn()
    console.log('  ✓ ' + name)
    passed++
  } catch (err) {
    console.log('  ✗ ' + name)
    console.log('    ' + err.message.split('\n').join('\n    '))
    failed++
  }
}

/**
 * Assert a command runs to a clean exit 0. Only use for commands whose
 * success does not depend on the host's interfaces, privileges or network.
 */
function testExitsZero (args, name, check) {
  test(name, () => {
    const result = run(args)
    assertStarted(result, args)
    assertNoCrash(result, args)
    assert.strictEqual(result.status, 0,
      'spoofd ' + args.join(' ') + ' exited ' + result.status + ':\n' + output(result))
    if (check) check(output(result), result)
  })
}

/**
 * Assert a command reports failure through its exit code rather than only
 * printing a verdict, so `spoofd <cmd> && next_step` is safe to write.
 */
function testExitsNonZero (args, name, check) {
  test(name, () => {
    const result = run(args)
    assertStarted(result, args)
    assertNoCrash(result, args)
    assert.notStrictEqual(result.status, 0,
      'spoofd ' + args.join(' ') + ' exited 0 but should have failed:\n' + output(result))
    if (check) check(output(result), result)
  })
}

console.log('\nTesting dependency loading...\n')

test('ora is require-able as a function', () => {
  const ora = require('ora')
  assert.strictEqual(typeof ora, 'function',
    'ora resolved to ' + typeof ora + '; an ESM-only ora breaks every spinner command')
})

test('every runtime dependency is CommonJS', () => {
  const deps = Object.keys(require('../package.json').dependencies || {})
  assert.ok(deps.length > 0, 'no dependencies found to check')
  for (const dep of deps) {
    const manifest = path.join(ROOT, 'node_modules', dep, 'package.json')
    if (!fs.existsSync(manifest)) continue
    const meta = JSON.parse(fs.readFileSync(manifest, 'utf8'))
    assert.notStrictEqual(meta.type, 'module',
      dep + '@' + meta.version + ' is ESM-only; this package is CommonJS and cannot require it')
  }
})

test('every runtime dependency satisfies our declared engines', () => {
  const pkg = require('../package.json')
  const ourFloor = parseInt(String(pkg.engines.node).replace(/[^\d]*(\d+).*/, '$1'), 10)
  assert.ok(!isNaN(ourFloor), 'could not parse engines.node: ' + pkg.engines.node)
  for (const dep of Object.keys(pkg.dependencies || {})) {
    const manifest = path.join(ROOT, 'node_modules', dep, 'package.json')
    if (!fs.existsSync(manifest)) continue
    const meta = JSON.parse(fs.readFileSync(manifest, 'utf8'))
    const range = meta.engines && meta.engines.node
    if (!range) continue
    const depFloor = parseInt(String(range).replace(/[^\d]*(\d+).*/, '$1'), 10)
    if (isNaN(depFloor)) continue
    assert.ok(depFloor <= ourFloor,
      dep + '@' + meta.version + ' needs node ' + range + ' but we advertise ' + pkg.engines.node)
  }
})

test('every advertised command is handled by the dispatcher', () => {
  // `help` used to work only by falling through to the unknown-command
  // branch. Once that branch started failing, `spoofd help` began exiting 1.
  // The shell completions are the advertised list, so check against them.
  const completion = fs.readFileSync(path.join(ROOT, 'completions', 'spoofd.bash'), 'utf8')
  const advertised = /commands="([^"]+)"/.exec(completion)
  assert.ok(advertised, 'could not find the command list in completions/spoofd.bash')

  const source = fs.readFileSync(CLI, 'utf8')
  const dispatched = new Set()
  const pattern = /cmd === ['"]([a-z]+)['"]/g
  let match
  while ((match = pattern.exec(source)) !== null) dispatched.add(match[1])
  assert.ok(dispatched.size > 5, 'found only ' + dispatched.size + ' dispatched commands')

  for (const command of advertised[1].trim().split(/\s+/)) {
    assert.ok(dispatched.has(command),
      '`' + command + '` is offered by tab completion but never dispatched in bin/cmd.js')
  }
})

console.log('\nTesting packaging and the rename...\n')

test('package.json ships a spoofd binary that exists', () => {
  const pkg = require('../package.json')
  assert.deepStrictEqual(Object.keys(pkg.bin), ['spoofd'],
    'the CLI must be published as `spoofd` only -- a `spoofy` bin collides with the unrelated spoofy package')
  assert.ok(fs.existsSync(path.join(ROOT, pkg.bin.spoofd)),
    'bin points at a file that does not exist: ' + pkg.bin.spoofd)
})

test('completions ship for every shell and invoke spoofd', () => {
  for (const shell of ['bash', 'zsh', 'fish', 'ps1']) {
    const file = path.join(ROOT, 'completions', 'spoofd.' + shell)
    assert.ok(fs.existsSync(file), 'missing completion for ' + shell)
    const body = fs.readFileSync(file, 'utf8')
    assert.ok(!/spoofy/.test(body), 'completions/spoofd.' + shell + ' still refers to spoofy')
  }
})

test('no source file still refers to the old command name', () => {
  // `spoofy` is allowed to survive in exactly two shapes: a comment, and a
  // legacy path or environment variable we deliberately still read. Anything
  // else is a user-facing string that would tell someone to run a command
  // that no longer exists.
  const ALLOWED = /^\s*(\/\/|\*|\/\*)|\.spoofy|\/spoofy|'spoofy'|SPOOFY_/
  const pkg = require('../package.json')
  const sources = ['index.js', pkg.bin.spoofd, 'lib/duid.js', 'lib/duid-cli.js',
    'lib/oui.js', 'lib/utils.js', 'lib/history.js', 'lib/networkmanager.js']
  for (const rel of sources) {
    const body = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    const stray = body.split('\n').filter((line) => /spoofy/i.test(line) && !ALLOWED.test(line))
    assert.strictEqual(stray.length, 0, rel + ' still mentions spoofy:\n' + stray.join('\n'))
  }
})

test('state paths fall back to the pre-rename location', () => {
  const { resolveStatePath } = require('../lib/utils')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spoofd-test-'))
  const current = path.join(dir, '.spoofdrc')
  const legacy = path.join(dir, '.spoofyrc')
  try {
    assert.strictEqual(resolveStatePath(current, legacy), current, 'with neither present, use the current path')
    fs.writeFileSync(legacy, '{}')
    assert.strictEqual(resolveStatePath(current, legacy), legacy, 'with only a legacy file, keep reading it')
    fs.writeFileSync(current, '{}')
    assert.strictEqual(resolveStatePath(current, legacy), current, 'once the current file exists, prefer it')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

console.log('\nTesting the library API...\n')

test('index.js exports its documented surface', () => {
  const spoof = require('..')
  const expected = [
    'findInterface', 'findInterfaces', 'normalize', 'randomize',
    'setInterfaceMAC', 'getInterfaceMAC', 'validateMAC', 'duid',
    'SpoofdError', 'ValidationError', 'PermissionError', 'NetworkError',
    'PlatformError'
  ]
  for (const name of expected) {
    assert.notStrictEqual(typeof spoof[name], 'undefined', 'index.js no longer exports ' + name)
  }
})

test('error classes carry a code and suggestions', () => {
  const spoof = require('..')
  const err = new spoof.PermissionError('denied', ['use sudo'])
  assert.ok(err instanceof spoof.SpoofdError, 'PermissionError must extend SpoofdError')
  assert.ok(err instanceof Error, 'PermissionError must extend Error')
  assert.strictEqual(err.code, 'PERMISSION_ERROR')
  assert.deepStrictEqual(err.suggestions, ['use sudo'])
})

test('permission failures are classified apart from hardware refusals', () => {
  const { isPermissionFailure } = require('../lib/utils')
  const denied = [
    Object.assign(new Error('nope'), { code: 'EPERM' }),
    Object.assign(new Error('nope'), { code: 'EACCES' }),
    new Error('RTNETLINK answers: Operation not permitted'),
    new Error('Access is denied.'),
    new Error('ioctl: Permission denied'),
    new Error('Set-NetAdapter : Requires elevation')
  ]
  const refused = [
    new Error('Device or resource busy'),
    new Error('adapter does not support this operation'),
    null,
    undefined
  ]
  for (const err of denied) {
    assert.strictEqual(isPermissionFailure(err), true,
      'should read as a permission failure: ' + (err.code || err.message))
  }
  for (const err of refused) {
    assert.strictEqual(isPermissionFailure(err), false,
      'should not read as a permission failure: ' + (err && err.message))
  }
})

test('randomize produces a well-formed MAC', () => {
  const spoof = require('..')
  for (let i = 0; i < 50; i++) {
    assert.ok(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(spoof.randomize()),
      'randomize() produced a malformed address')
  }
})

console.log('\nTesting CLI startup...\n')

testExitsZero(['--version'], 'spoofd --version prints a version', (text) => {
  assert.ok(/\d+\.\d+\.\d+/.test(text), 'no version in output:\n' + text)
})

testExitsZero(['--version'], 'reported version matches package.json', (text) => {
  assert.ok(text.indexOf(require('../package.json').version) !== -1,
    'version mismatch:\n' + text)
})

testExitsZero(['help'], 'spoofd help prints usage', (text) => {
  assert.ok(text.indexOf('spoofd') !== -1, 'no usage text:\n' + text)
})

testExitsZero(['version'], 'spoofd version prints a version', (text) => {
  assert.ok(/\d+\.\d+\.\d+/.test(text), 'no version in output:\n' + text)
})

testExitsZero([], 'bare spoofd prints help and succeeds', (text) => {
  assert.ok(text.indexOf('spoofd') !== -1, 'no usage text:\n' + text)
})

console.log('\nTesting commands that draw spinners...\n')

// The canary for ESM/packaging breakage: `list` is the first command a new
// user runs and the first that touches the spinner.
testExitsZero(['list'], 'spoofd list runs to completion')
testExitsZero(['ls'], 'spoofd ls runs to completion')
testExitsZero(['list', '--verbose'], 'spoofd list --verbose runs to completion')

testExitsZero(['list', '--json'], 'spoofd list --json emits parseable JSON', (text) => {
  const parsed = JSON.parse(text)
  assert.ok(Array.isArray(parsed.interfaces), 'expected an interfaces array:\n' + text)
  assert.strictEqual(typeof parsed.count, 'number', 'expected a numeric count:\n' + text)
})

console.log('\nTesting read-only commands...\n')

testExitsZero(['validate', '00:11:22:33:44:55'], 'spoofd validate accepts a valid MAC', (text) => {
  assert.ok(/Valid MAC address/.test(text), 'expected a valid verdict:\n' + text)
})

testExitsZero(['vendor', '00:1A:2B:3C:4D:5E'], 'spoofd vendor looks up a prefix', (text) => {
  assert.ok(/Vendor:/.test(text), 'expected a vendor line:\n' + text)
})

testExitsZero(['history'], 'spoofd history runs to completion')
testExitsZero(['duid', 'list'], 'spoofd duid list runs to completion')
testExitsZero(['duid', 'show'], 'spoofd duid show runs to completion')

console.log('\nTesting bad input...\n')

testExitsNonZero(['validate', 'not-a-mac'], 'spoofd validate fails on a bad MAC', (text) => {
  assert.ok(/Invalid MAC address/.test(text), 'expected an invalid verdict:\n' + text)
})

testExitsNonZero(['validate', 'not-a-mac', '--json'], 'spoofd validate --json fails on a bad MAC', (text) => {
  assert.strictEqual(JSON.parse(text).valid, false, 'expected valid:false:\n' + text)
})

testExitsNonZero(['normalize', 'not-a-mac'], 'spoofd normalize fails on a bad MAC')
testExitsNonZero(['vendor', 'not-a-mac'], 'spoofd vendor fails on a bad MAC')
testExitsNonZero(['batch', 'no-such-file.json'], 'spoofd batch fails on a missing file')

testExitsNonZero(['definitely-not-a-command'], 'spoofd fails on an unknown command', (text) => {
  assert.ok(/Unknown command/.test(text), 'expected an unknown-command message:\n' + text)
})

console.log('\n' + '='.repeat(60))
console.log('Results: ' + passed + ' passed, ' + failed + ' failed')
console.log('='.repeat(60) + '\n')

process.exit(failed > 0 ? 1 : 0)
