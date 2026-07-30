const DEFAULT_STORAGE = {
  searches: [],
};

browser.runtime.onInstalled.addListener(async () => {
  try {
    const stored = await browser.storage.local.get("searches");

    if (!Array.isArray(stored.searches)) {
      await browser.storage.local.set(DEFAULT_STORAGE);
    }
  } catch (error) {
    console.error("NINA could not initialize local storage.", error);
  }
});
