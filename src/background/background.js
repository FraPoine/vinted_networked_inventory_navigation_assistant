console.log("NINA background script loaded.");

const MESSAGE_TYPES = {
  CREATE_SEARCH_REQUEST: "CREATE_SEARCH_REQUEST",
  PREPARE_SEARCH: "PREPARE_SEARCH",
};

browser.runtime.onInstalled.addListener((details) => {
  console.log(`NINA extension installed: ${details.reason}`);
});

function normalizeItems(items) {
  return items.map((item) => item.trim()).filter(Boolean);
}

function hasDuplicateItems(items) {
  const normalizedItems = items.map((item) => item.toLocaleLowerCase());
  return new Set(normalizedItems).size !== normalizedItems.length;
}

function validateSearchRequest(message) {
  if (
    !Array.isArray(message.items) ||
    !message.items.every((item) => typeof item === "string")
  ) {
    return {
      ok: false,
      error: "Items must be an array of strings.",
    };
  }

  const items = normalizeItems(message.items);

  if (items.length < 2) {
    return {
      ok: false,
      error: "At least two items are required.",
    };
  }

  if (hasDuplicateItems(items)) {
    return {
      ok: false,
      error: "Each item must be different.",
    };
  }

  return {
    ok: true,
    items,
  };
}

async function handleCreateSearchRequest(message) {
  const validation = validateSearchRequest(message);

  if (!validation.ok) {
    return validation;
  }

  try {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!Number.isInteger(activeTab?.id)) {
      return {
        ok: false,
        error: "Open a Vinted page before continuing.",
      };
    }

    const response = await browser.tabs.sendMessage(activeTab.id, {
      type: MESSAGE_TYPES.PREPARE_SEARCH,
      items: validation.items,
    });

    if (
      response !== null &&
      typeof response === "object" &&
      response.ok === true &&
      Number.isInteger(response.itemCount) &&
      response.itemCount === validation.items.length
    ) {
      console.log(
        "NINA Vinted content script confirmed items:",
        validation.items,
      );

      return {
        ok: true,
        itemCount: validation.items.length,
      };
    }

    if (
      response !== null &&
      typeof response === "object" &&
      response.ok === false &&
      typeof response.error === "string" &&
      response.error.trim()
    ) {
      return {
        ok: false,
        error: response.error,
      };
    }

    console.error(
      "NINA received an invalid response from the active tab content script.",
      response,
    );

    return {
      ok: false,
      error: "NINA received an invalid response from the Vinted page.",
    };
  } catch (error) {
    console.error(
      "NINA could not contact the active tab content script.",
      error,
    );

    return {
      ok: false,
      error: "Open a Vinted page before continuing.",
    };
  }
}

function handleMessage(message) {
  if (
    message === null ||
    typeof message !== "object" ||
    message.type !== MESSAGE_TYPES.CREATE_SEARCH_REQUEST
  ) {
    return undefined;
  }

  return handleCreateSearchRequest(message);
}

browser.runtime.onMessage.addListener(handleMessage);
