/**
 * Full IEEE OUI registry: download, parse, cache.
 *
 * lib/oui.js carries a small curated table so a fresh install can name the
 * vendors people actually meet (VMware, Apple, Intel, the usual virtual NICs)
 * with no network and no install weight. It cannot name the other ~35,000
 * assignments, which is why most real addresses come back "Unknown".
 *
 * Bundling the whole registry would add megabytes to every install for a
 * feature most runs never touch, so it is fetched on request instead and
 * cached on disk. Nothing here reaches the network unless the user asks it to.
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const https = require('https')
const { resolveStatePath } = require('./utils')

const REGISTRY_URL = 'https://standards-oui.ieee.org/oui/oui.csv'

// The registry is a few megabytes. This is a sanity bound, not a target.
const MAX_BYTES = 32 * 1024 * 1024
const TIMEOUT_MS = 60000
const MAX_REDIRECTS = 5

function cachePath () {
  return resolveStatePath(
    path.join(os.homedir(), '.spoofd', 'oui.json'),
    path.join(os.homedir(), '.spoofy', 'oui.json')
  )
}

/**
 * Split one CSV record, honouring double-quoted fields that contain commas
 * and doubled quotes. The IEEE file quotes organisation names and addresses.
 * @param {string} line
 * @returns {Array<string>}
 */
function splitCsvLine (line) {
  const fields = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++ } else { quoted = false }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      fields.push(field)
      field = ''
    } else {
      field += ch
    }
  }
  fields.push(field)
  return fields
}

/**
 * Parse the IEEE registry CSV into { 'AA:BB:CC': 'Organization' }.
 *
 * Columns are Registry, Assignment, Organization Name, Organization Address.
 * Rows without a usable assignment or name are skipped rather than stored as
 * empty strings, so a lookup miss stays a miss.
 *
 * @param {string} text
 * @returns {Object<string, string>}
 */
function parseRegistry (text) {
  const prefixes = {}
  const lines = String(text).split(/\r?\n/)
  for (const line of lines) {
    if (!line || /^registry\s*,/i.test(line)) continue
    const fields = splitCsvLine(line)
    if (fields.length < 3) continue
    const assignment = (fields[1] || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase()
    const name = (fields[2] || '').trim().replace(/\s+/g, ' ')
    if (assignment.length < 6 || !name) continue
    const hex = assignment.substring(0, 6)
    prefixes[`${hex.substring(0, 2)}:${hex.substring(2, 4)}:${hex.substring(4, 6)}`] = name
  }
  return prefixes
}

/**
 * GET a URL, following redirects, with a timeout and a size ceiling.
 * @param {string} url
 * @param {number} [redirectsLeft]
 * @returns {Promise<string>}
 */
function download (url, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'user-agent': 'spoof-d' } }, (res) => {
      const status = res.statusCode
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        if (redirectsLeft <= 0) return reject(new Error('too many redirects fetching ' + url))
        return resolve(download(new URL(res.headers.location, url).toString(), redirectsLeft - 1))
      }
      if (status !== 200) {
        res.resume()
        return reject(new Error(`the IEEE registry returned HTTP ${status}`))
      }
      let size = 0
      const chunks = []
      res.on('data', (chunk) => {
        size += chunk.length
        if (size > MAX_BYTES) {
          request.destroy()
          return reject(new Error('the IEEE registry response exceeded ' + MAX_BYTES + ' bytes'))
        }
        chunks.push(chunk)
      })
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      res.on('error', reject)
    })
    request.setTimeout(TIMEOUT_MS, () => {
      request.destroy(new Error(`no response from the IEEE registry within ${TIMEOUT_MS / 1000}s`))
    })
    request.on('error', reject)
  })
}

let cached = null

/**
 * The cached registry, or null when nothing has been downloaded yet. Read
 * once per process; a corrupt or unreadable cache is treated as absent.
 * @returns {Object|null} {updated, source, count, prefixes}
 */
function loadCache () {
  if (cached !== null) return cached || null
  const file = cachePath()
  try {
    if (!fs.existsSync(file)) { cached = false; return null }
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!parsed || typeof parsed.prefixes !== 'object' || parsed.prefixes === null) {
      cached = false
      return null
    }
    cached = parsed
    return cached
  } catch (e) {
    cached = false
    return null
  }
}

/**
 * Download the registry and replace the cache. Written to a temporary file
 * and renamed, so an interrupted update cannot leave a half-written cache.
 * @returns {Promise<Object>} {count, path, updated}
 */
async function update () {
  const text = await download(REGISTRY_URL)
  const prefixes = parseRegistry(text)
  const count = Object.keys(prefixes).length
  if (count === 0) {
    throw new Error('the IEEE registry parsed to zero entries; the format may have changed')
  }

  const file = path.join(os.homedir(), '.spoofd', 'oui.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const payload = {
    updated: new Date().toISOString(),
    source: REGISTRY_URL,
    count,
    prefixes
  }
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(payload))
  fs.renameSync(tmp, file)
  cached = payload
  return { count, path: file, updated: payload.updated }
}

/** Forget the memoized cache. Used by the tests. */
function resetCache () {
  cached = null
}

module.exports = {
  REGISTRY_URL,
  cachePath,
  parseRegistry,
  splitCsvLine,
  loadCache,
  update,
  resetCache
}
