# NINA

NINA stands for **Networked Inventory Navigation Assistant**.

## Status

Version 0.1.0 implements Step 1: a minimal Firefox extension shell. It includes
a toolbar popup, a background script, and a static content script for
`https://www.vinted.it/*`.

## Repository structure

```text
.
├── manifest.json
├── README.md
├── .gitignore
├── src/
│   ├── background/
│   │   └── background.js
│   ├── content/
│   │   └── content.js
│   └── popup/
│       ├── popup.html
│       ├── popup.css
│       └── popup.js
└── assets/
    └── icons/
        └── nina.svg
```

## Load temporarily in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on**.
3. Choose this repository's `manifest.json`.
4. Select the NINA icon in the Firefox toolbar to open the popup.
5. On the extension entry in `about:debugging`, select **Inspect** to open the
   background console. Verify that it contains
   `NINA background script loaded.` The installation message also includes the
   installation reason when the extension is installed.
6. Open a page under `https://www.vinted.it/`, open that page's Developer Tools,
   and verify that its console contains
   `NINA content script loaded on Vinted.`

Temporary extensions are removed when Firefox restarts. The manifest uses
`nina-dev@example.invalid` as a development-only Firefox extension ID; replace
it with a permanent, controlled ID before distribution.

## Not implemented

This step does not implement listing reading, DOM scraping, seller matching,
Vinted API use, or storage.
