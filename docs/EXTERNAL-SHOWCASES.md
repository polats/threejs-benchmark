# External showcases

External showcases are browser-recorded copies of public Three.js sites. They run from `public/external-showcases` and do not require the source site or its CDNs at runtime.

## Capture a showcase

```sh
npm install
npx playwright install chromium
npm run showcase:scrape -- little-landscapes
```

Set `HEADED=1` to observe a capture. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use a system Chrome/Chromium binary instead of Playwright's browser.

The harness waits for network idle and the configured `readySelector`, records successful GET responses, mirrors each origin, rewrites references between captured resources, and writes `capture.json` and `preview.png` beside the mirror.

## Add another site

1. Add its URL and a stable rendered selector to `showcases.config.mjs`.
2. Add its sidebar metadata to the local `public/external-showcases.config.json` array.
3. Run the capture command with the new ID.
4. Test the result with the network disabled. A capture includes resources exercised during initial page load; lazy assets require adding deterministic interactions to the harness before the browser closes.

Only capture sites you have permission to reproduce. The original source URL remains visible in the benchmark sidebar.
