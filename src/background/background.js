console.log("NINA background script loaded.");

browser.runtime.onInstalled.addListener((details) => {
  console.log(`NINA extension installed: ${details.reason}`);
});
