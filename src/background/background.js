console.log("NINA background script loaded.");

const MESSAGE_TYPES = {
  CREATE_SEARCH_REQUEST: "CREATE_SEARCH_REQUEST",
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

function handleMessage(message) {
  if (
    message === null ||
    typeof message !== "object" ||
    message.type !== MESSAGE_TYPES.CREATE_SEARCH_REQUEST
  ) {
    return undefined;
  }

  const validation = validateSearchRequest(message);

  if (!validation.ok) {
    return validation;
  }

  console.log("NINA background accepted items:", validation.items);

  return {
    ok: true,
    itemCount: validation.items.length,
  };
}

browser.runtime.onMessage.addListener(handleMessage);
