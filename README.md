# NINA

NINA (Networked Inventory Navigation Assistant) is a Firefox extension intended
to help people find Vinted sellers who offer several requested items at once.

## Status

Version 0.1.0 is an initial, functional WebExtension shell. It stores item
requests locally but does not search Vinted or collect listing data.

## Repository structure

```text
.
├── manifest.json
├── src/
│   ├── background/background.js
│   ├── content/catalog-reader.js
│   ├── popup/
│   └── results/
├── assets/icons/
└── docs/architecture.md
```

## Requirements

- Firefox with Manifest V3 support
- Node.js and npm for development checks
- The `zip` command for archive creation

Install development dependencies:

```sh
npm install
```

## Load temporarily in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on**.
3. Choose this repository's `manifest.json`.
4. Open NINA from the Firefox toolbar.

Temporary extensions are removed when Firefox restarts. The manifest uses
`nina-dev@example.invalid` as a development-only Firefox extension ID; replace
it with a permanent, controlled ID before distribution.

## Commands

- `npm run lint` checks JavaScript with ESLint.
- `npm run format` formats project files with Prettier.
- `npm run format:check` checks formatting without changing files.
- `npm run zip` creates `nina-0.1.0.zip` using the system `zip` command.

## Version 0.1.0 limitations

NINA does not yet inspect Vinted pages, call Vinted APIs, find sellers, or
populate the results page. Searches remain only in Firefox local extension
storage. The current content script only confirms that it is ready when sent a
`PING` message.

Development and use of NINA must respect Vinted's terms of service, privacy
requirements, rate limits, and other technical restrictions.
