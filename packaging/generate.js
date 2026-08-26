#!/usr/bin/env node

/**
 * Generate distribution manifests for a published release.
 *
 * Homebrew, Scoop and the AUR all pin a checksum of the exact artifact they
 * install, which only exists once the version is on npm. So these are built
 * after publishing, not committed ahead of it -- a checked-in hash is either
 * stale or a placeholder someone forgets to replace.
 *
 * Usage:
 *   npm run packaging              # current version from package.json
 *   npm run packaging -- 0.6.1     # a specific published version
 *
 * Output lands in packaging/dist/, which is not tracked.
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const crypto = require('crypto')

const ROOT = path.join(__dirname, '..')
const pkg = require(path.join(ROOT, 'package.json'))
const version = process.argv[2] || pkg.version
const tarballUrl = `https://registry.npmjs.org/${pkg.name}/-/${pkg.name}-${version}.tgz`
const outDir = path.join(__dirname, 'dist')

function get (url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'spoof-d-packaging' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        if (redirectsLeft <= 0) return reject(new Error('too many redirects'))
        return resolve(get(new URL(res.headers.location, url).toString(), redirectsLeft - 1))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`${url} returned HTTP ${res.statusCode}`))
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function render (templateName, values) {
  const template = fs.readFileSync(path.join(__dirname, 'templates', templateName), 'utf8')
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in values)) throw new Error(`${templateName} references unknown placeholder ${key}`)
    return values[key]
  })
}

async function main () {
  if (version !== pkg.version) {
    console.warn(`! Generating for ${version} using metadata from ${pkg.version}.`)
    console.warn('  Description, homepage and binary name come from the working tree,')
    console.warn('  so check they match what that release actually shipped.\n')
  }
  console.log(`Fetching ${tarballUrl}`)
  const tarball = await get(tarballUrl)
  const values = {
    name: pkg.name,
    bin: Object.keys(pkg.bin)[0],
    version,
    description: pkg.description,
    homepage: pkg.homepage,
    license: pkg.license,
    url: tarballUrl,
    sha256: crypto.createHash('sha256').update(tarball).digest('hex'),
    sha512: crypto.createHash('sha512').update(tarball).digest('hex')
  }

  fs.mkdirSync(outDir, { recursive: true })
  const outputs = [
    ['homebrew.rb', `${pkg.name}.rb`],
    ['scoop.json', `${Object.keys(pkg.bin)[0]}.json`],
    ['PKGBUILD', 'PKGBUILD']
  ]
  for (const [template, filename] of outputs) {
    const target = path.join(outDir, filename)
    fs.writeFileSync(target, render(template, values))
    console.log('  wrote ' + path.relative(ROOT, target))
  }

  console.log(`\n${pkg.name}@${version}`)
  console.log('  sha256 ' + values.sha256)
  console.log('\nNext steps are in packaging/README.md')
}

main().catch((err) => {
  console.error('✗ ' + err.message)
  process.exit(1)
})
