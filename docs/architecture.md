# Architecture

## Popup

The popup is NINA's current user interface. It collects at least two item names,
allows additional fields to be added, and records valid requests in local
extension storage.

## Background script

The Manifest V3 background script runs when Firefox installs or updates the
extension. It initializes the stored search list only when that structure is
missing or invalid.

## Content script

The content script loads on `https://www.vinted.it/*`. It does not read the page
or collect data. Its only current behavior is replying to a `PING` message with
a readiness response.

## Local storage

`browser.storage.local` holds a `searches` array. Each entry contains the
trimmed item names and an ISO timestamp. The data remains inside the user's
Firefox profile.

## Results page

The results page is currently disconnected and displays an empty state. Its
seller-results container is reserved for future UI that presents sellers and
the listings matched to each request.

## Future matching flow

A future version may take a saved item request, obtain permitted listing data,
group listings by seller, and retain sellers with a match for every requested
item. The extension could then pass those matches to the results page. Any
implementation must first account for user consent, Vinted's terms and
technical restrictions, pagination, rate limits, and incomplete or changing
listing data.
