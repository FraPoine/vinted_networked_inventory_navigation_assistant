console.log("NINA content script loaded on Vinted.");

const MESSAGE_TYPES = {
  PREPARE_SEARCH: "PREPARE_SEARCH",
};

function normalizeItems(items) {
  return items.map((item) => item.trim()).filter(Boolean);
}

function hasDuplicateItems(items) {
  const normalizedItems = items.map((item) => item.toLocaleLowerCase());
  return new Set(normalizedItems).size !== normalizedItems.length;
}

function validatePrepareSearch(message) {
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
    message.type !== MESSAGE_TYPES.PREPARE_SEARCH
  ) {
    return undefined;
  }

  const validation = validatePrepareSearch(message);

  if (!validation.ok) {
    return Promise.resolve(validation);
  }

  console.log("NINA content script received items:", validation.items);

  return Promise.resolve({
    ok: true,
    itemCount: validation.items.length,
  });
}

browser.runtime.onMessage.addListener(handleMessage);
