# Chrome Web Store: packaging and submitting

First submission 2026-09-11 (version 0.1.0). Listing copy of record: the vault's `runs/naming/api-for-any-site.md` neighbour, `/tmp/apiforanysite-store-listing.md` at the time; the fields below are what the store actually holds.

## Account

- Publisher account: sam@get2ofme.com, display name "2OfMe", declared **non-trader** (individual, free open-source publishing). Non-trader means no public address or phone on the listing. 2-step verification on the Google account is required before any upload.
- Extension id `mlknbfgdblbbdoomplebifjopkoflcdg` is fixed by the private key in `.keys/extension.pem` (gitignored). The site's install link and the host's allowed origin depend on it.
- New publisher accounts are capped at two extensions.

## Package

The store rejects a manifest that contains the `key` field, and without it the store would mint a different id. The fix is to strip the key from the manifest and ship the private key at the zip root as `key.pem`:

```bash
node scripts/build-catalog.js                      # bundle kits/ into extension/catalog/
rm -rf /tmp/pkg && mkdir /tmp/pkg && cp -R extension/. /tmp/pkg/
python3 -c "import json;p='/tmp/pkg/manifest.json';m=json.load(open(p));m.pop('key');json.dump(m,open(p,'w'),indent=2)"
cp .keys/extension.pem /tmp/pkg/key.pem
(cd /tmp/pkg && find . -name .DS_Store -delete && zip -qr ../apiforanysite-$(jq -r .version extension/manifest.json).zip .)
```

The manifest `description` is the store summary (132 chars max). Bump `version` for every upload.

## Listing fields

- Category Developer Tools, language English, homepage https://apiforanysite.com/, support https://github.com/apiforanysite/apiforanysite/issues.
- Icon: `extension/icons/icon-128.png`. Screenshots 1280x800 of the options page (home with a logged call, add-a-website-kit, a kit screen), captured from the extension loaded in Arc with `arc screenshot --width 1280 --height 800 --scale 1`.

## Privacy tab

- Single purpose: let an AI agent on the user's own computer call per-site tools (website kits) inside the user's own logged-in browser.
- Permission justifications: `userScripts` only for kits the user writes (loaded from their own machine, developer mode; runtime-fenced to the kit's site); `nativeMessaging` for the local host on 127.0.0.1; `tabs` for the kit's background tab; `storage` for kits, settings and the local audit log; `alarms` for keepalive and the rolling daily counters; `scripting` for bundled catalog kits; optional host permissions requested per kit at install.
- Remote code: **No** (catalog kits are in the package; personal kits are user-provided code through the User Scripts API).
- Data disclosures ticked: personally identifiable information, personal communications, website content. The store's FAQ counts local-only handling as collection. All three certifications ticked. Privacy policy https://apiforanysite.com/privacy/.

## Claims the listing must keep true

- Catalog kits are reviewed code shipped in the package; only kits the user writes run under a runtime fence (verified 2026-09-10: a no-cors request leaves a chrome.scripting isolated world). Never claim a universal fence.
- Kits are never installed from third-party URLs.
