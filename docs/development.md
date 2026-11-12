# Development

The distribution is a single unminified IIFE. It contains the extracted original weather engine, its embedded image assets and our adapter. There are no runtime imports and no npm dependencies.

```sh
node scripts/build.mjs
node tests/verify.cjs
python3 scripts/vendor_origami.py
node scripts/verify-package.mjs
```

The upstream copy is pinned in `vendor/origami_weather/UPSTREAM.json`. Its `src/`, package metadata, lockfile, license and exact bundle are preserved. Do not replace the vendor snapshot without reviewing its license and changes. The extraction verifier intentionally fails if the snapshot or extracted engine drifts.

For browser smoke tests, launch Chromium using a disposable profile:

```sh
chromium --headless --remote-debugging-port=9223 --allow-file-access-from-files \
  --user-data-dir=/tmp/live-weather-browser about:blank
node tests/verify_browser.cjs
```

Depending on the environment, headless Chromium may require additional sandbox/GPU flags. Keep those environment-specific. Tests use the built distribution through `tests/preview.html` and do not authenticate to Home Assistant or mutate a real home.

The fixture uses a shadow-root `hui-view` contract and a Bubble-style global backdrop. Its negative control adds the stacking context that previously blocked popups, proves the failure, restores the style, and proves recovery. This is a browser contract test, not a claim that every Home Assistant frontend release/layout is supported.

Before publishing:

1. Rebuild and run package/provenance/unit tests.
2. Run the browser smoke test and manually compare day, twilight, night and precipitation.
3. Review release files and examples for private entities/data.
4. Ensure the GitHub validation workflow succeeds.
5. Tag a release and attach `dist/live-weather-background.js` and `SHA256SUMS`.

Inclusion in the default HACS Marketplace catalog is a separate maintainer review. The workflow prepares validation; it does not submit an inclusion request.
