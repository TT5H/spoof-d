#!/usr/bin/env node

/**
 * Tests for the IEEE OUI registry parser and the on-disk vendor cache.
 *
 * Nothing here touches the network. The registry download is one HTTPS GET
 * whose failure path is already explicit; what is worth testing is the CSV
 * parsing, which has to survive quoted fields, embedded commas and doubled
 * quotes, and the precedence between the curated table and the cache.
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const registry = require('../lib/oui-registry')

let passed = 0
let failed = 0

function test (name, fn) {
  try {
    fn()
    console.log('  ✓ ' + name)
    passed++
  } catch (err) {
    console.log('  ✗ ' + name)
    console.log('    ' + String(err.message).split('\n').join('\n    '))
    failed++
  }
}

// A faithful sample of the IEEE oui.csv shape, including the cases that break
// a naive split(',') -- quoted names containing commas, and doubled quotes.
const FIXTURE = [
  'Registry,Assignment,Organization Name,Organization Address',
  'MA-L,00000C,"Cisco Systems, Inc","170 West Tasman Dr. San Jose CA US 95134"',
  'MA-L,001B63,Apple Inc.,"1 Infinite Loop Cupertino CA US 95014"',
  'MA-L,AABBCC,"He said ""hi"" Corp","somewhere"',
  'MA-L,001C42,"Parallels, Inc.","Sluzevska 22 Prague CZ"',
  '',
  'MA-L,BADROW',
  'MA-L,,"No assignment","x"',
  'MA-L,DDEEFF,   ,"blank name"',
  'MA-L,112233,"  Spaced   Out   Ltd  ","y"'
].join('\r\n')

console.log('\nTesting CSV field splitting...\n')

test('plain fields split on commas', () => {
  assert.deepStrictEqual(registry.splitCsvLine('a,b,c'), ['a', 'b', 'c'])
})

test('quoted fields keep their commas', () => {
  assert.deepStrictEqual(registry.splitCsvLine('a,"b,c",d'), ['a', 'b,c', 'd'])
})

test('doubled quotes collapse to one', () => {
  assert.deepStrictEqual(registry.splitCsvLine('a,"say ""hi""",b'), ['a', 'say "hi"', 'b'])
})

test('empty fields survive', () => {
  assert.deepStrictEqual(registry.splitCsvLine('a,,b'), ['a', '', 'b'])
})

console.log('\nTesting registry parsing...\n')

const parsed = registry.parseRegistry(FIXTURE)

test('an assignment becomes a colon-separated prefix', () => {
  assert.strictEqual(parsed['00:00:0C'], 'Cisco Systems, Inc')
  assert.strictEqual(parsed['00:1B:63'], 'Apple Inc.')
})

test('doubled quotes are decoded in the organisation name', () => {
  assert.strictEqual(parsed['AA:BB:CC'], 'He said "hi" Corp')
})

test('runs of whitespace in a name collapse', () => {
  assert.strictEqual(parsed['11:22:33'], 'Spaced Out Ltd')
})

test('the header row is not treated as data', () => {
  assert.ok(!Object.prototype.hasOwnProperty.call(parsed, 'AS:SI:GN'), 'header parsed as a record')
  for (const name of Object.values(parsed)) {
    assert.notStrictEqual(name, 'Organization Name', 'header row leaked into the table')
  }
})

test('blank, truncated and empty-name rows are skipped', () => {
  assert.ok(!Object.prototype.hasOwnProperty.call(parsed, 'DD:EE:FF'), 'a blank name was stored')
  assert.strictEqual(Object.keys(parsed).length, 5,
    'expected 5 usable records, got ' + Object.keys(parsed).length + ': ' + Object.keys(parsed).join(', '))
})

test('parsing junk yields an empty table rather than throwing', () => {
  assert.deepStrictEqual(registry.parseRegistry(''), {})
  assert.deepStrictEqual(registry.parseRegistry('not a csv at all'), {})
})

console.log('\nTesting lookup precedence...\n')

/**
 * Run a snippet with HOME pointed at a scratch directory, so the real cache
 * path logic is exercised without touching the developer's home.
 */
function withFakeHome (cacheContent, snippet) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'spoofd-oui-'))
  try {
    if (cacheContent !== null) {
      fs.mkdirSync(path.join(home, '.spoofd'), { recursive: true })
      fs.writeFileSync(path.join(home, '.spoofd', 'oui.json'), cacheContent)
    }
    return execFileSync(process.execPath, ['-e', snippet], {
      encoding: 'utf8',
      env: Object.assign({}, process.env, { HOME: home, USERPROFILE: home }),
      cwd: path.join(__dirname, '..')
    }).trim()
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
}

const CACHE = JSON.stringify({
  updated: '2026-01-01T00:00:00.000Z',
  source: 'test',
  count: 2,
  prefixes: { 'AA:BB:CC': 'Registry Only Corp', '00:50:56': 'VMware, Inc.' }
})

test('the cache answers prefixes the curated table does not know', () => {
  const out = withFakeHome(CACHE,
    "const o = require('./lib/oui'); const r = o.lookupWithSource('AA:BB:CC:01:02:03'); console.log(r.vendor + '|' + r.source)")
  assert.strictEqual(out, 'Registry Only Corp|ieee')
})

test('the curated table wins where both know a prefix', () => {
  const out = withFakeHome(CACHE,
    "const o = require('./lib/oui'); const r = o.lookupWithSource('00:50:56:01:02:03'); console.log(r.vendor + '|' + r.source)")
  assert.strictEqual(out, 'VMware|bundled')
})

test('with no cache, a miss stays a miss', () => {
  const out = withFakeHome(null,
    "const o = require('./lib/oui'); console.log(JSON.stringify(o.getVendorInfo('AA:BB:CC:01:02:03')))")
  const info = JSON.parse(out)
  assert.strictEqual(info.vendor, 'Unknown')
  assert.strictEqual(info.source, null)
})

test('a corrupt cache is ignored rather than fatal', () => {
  const out = withFakeHome('{ this is not json',
    "const o = require('./lib/oui'); console.log(o.getVendorInfo('00:50:56:01:02:03').vendor + '|' + JSON.stringify(o.registryStatus().available))")
  assert.strictEqual(out, 'VMware|false')
})

test('registryStatus reports what the cache holds', () => {
  const out = withFakeHome(CACHE,
    "const o = require('./lib/oui'); const s = o.registryStatus(); console.log(s.available + '|' + s.count + '|' + s.updated)")
  assert.strictEqual(out, 'true|2|2026-01-01T00:00:00.000Z')
})

console.log('\n' + '='.repeat(60))
console.log('Results: ' + passed + ' passed, ' + failed + ' failed')
console.log('='.repeat(60) + '\n')

process.exit(failed > 0 ? 1 : 0)
