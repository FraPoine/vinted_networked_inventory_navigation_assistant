browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "PING") {
    return Promise.resolve({
      status: "ready",
      page: "vinted",
    });
  }

  return undefined;
});
