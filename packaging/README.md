# Distribution manifests

`npm install -g spoof-d` is the primary channel. These manifests cover the
package managers people actually reach for on each platform: Homebrew on
macOS, Scoop on Windows, the AUR on Arch.

Nothing here is committed in generated form. Every one of these formats pins a
checksum of the exact artifact it installs, and that artifact does not exist
until the version is published to npm — so a checked-in manifest is either
stale or carries a placeholder somebody forgets to replace.

## Generating

Publish to npm first, then:

```bash
npm run packaging              # uses the version in package.json
npm run packaging -- 0.6.1     # or a specific published version
```

Output lands in `packaging/dist/`, which is gitignored:

| File | Goes to |
|---|---|
| `spoof-d.rb` | a Homebrew tap |
| `spoofd.json` | a Scoop bucket |
| `PKGBUILD` | the AUR |

The generator downloads the published tarball and computes its SHA-256, so the
hash always describes the bytes users will receive. It refuses to write
anything if the download fails.

## Publishing each one

### Homebrew

A formula outside `homebrew-core` needs a tap, which is a repository named
`homebrew-<something>`:

```bash
# once
gh repo create TT5H/homebrew-spoof-d --public

# per release
cp packaging/dist/spoof-d.rb /path/to/homebrew-spoof-d/Formula/
cd /path/to/homebrew-spoof-d && git commit -am "spoof-d 0.6.0" && git push
```

Users then run:

```bash
brew install TT5H/spoof-d/spoof-d
```

Getting into `homebrew-core` proper requires meeting their notability bar
(roughly: a real user base and a stable release history). A tap works from day
one and needs nobody's approval.

### Scoop

Same shape — a bucket is any repository holding manifest JSON:

```bash
# once
gh repo create TT5H/scoop-bucket --public

# per release
cp packaging/dist/spoofd.json /path/to/scoop-bucket/bucket/
```

```powershell
scoop bucket add spoof-d https://github.com/TT5H/scoop-bucket
scoop install spoofd
```

The manifest carries `checkver` and `autoupdate` pointing at the npm registry,
so Scoop's own tooling can bump it without this generator.

### AUR

Needs an AUR account with an SSH key registered.

```bash
git clone ssh://aur@aur.archlinux.org/nodejs-spoof-d.git
cp packaging/dist/PKGBUILD nodejs-spoof-d/
cd nodejs-spoof-d
makepkg --printsrcinfo > .SRCINFO   # required, and easy to forget
git commit -am "0.6.0" && git push
```

## Keeping them honest

`makepkg`, `brew audit --strict` and `scoop checkver` each validate their own
format. None of them runs in this repository's CI, because all three need the
release to exist first. Run them from the tap, bucket or AUR checkout after
copying a manifest across.
