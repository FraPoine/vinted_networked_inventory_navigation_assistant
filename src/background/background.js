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

const CATALOG_LISTING_KEYS = [
  "itemId",
  "itemUrl",
  "imageUrl",
  "imageAlt",
  "descriptionTitle",
  "descriptionSubtitle",
  "priceText",
  "totalPriceText",
];

const OPTIONAL_LISTING_FIELDS = [
  "imageUrl",
  "imageAlt",
  "descriptionTitle",
  "descriptionSubtitle",
  "priceText",
  "totalPriceText",
];

function isNullableNonEmptyString(value) {
  return (
    value === null ||
    (typeof value === "string" && value.trim().length > 0)
  );
}

function isValidCatalogListing(listing) {
  if (
    listing === null ||
    typeof listing !== "object" ||
    Array.isArray(listing) ||
    Object.keys(listing).length !== CATALOG_LISTING_KEYS.length ||
    !CATALOG_LISTING_KEYS.every((key) =>
      Object.prototype.hasOwnProperty.call(listing, key),
    ) ||
    typeof listing.itemId !== "string" ||
    !/^\d+$/.test(listing.itemId) ||
    typeof listing.itemUrl !== "string" ||
    !OPTIONAL_LISTING_FIELDS.every((field) =>
      isNullableNonEmptyString(listing[field]),
    )
  ) {
    return false;
  }

  try {
    const itemUrl = new URL(listing.itemUrl);
    const itemPathMatch = itemUrl.pathname.match(/^\/items\/(\d+)(?:-|\/|$)/);

    return (
      itemUrl.protocol === "https:" &&
      itemUrl.hostname === "www.vinted.it" &&
      itemPathMatch?.[1] === listing.itemId
    );
  } catch {
    return false;
  }
}

function hasUniqueListingIds(listings) {
  return (
    new Set(listings.map((listing) => listing.itemId)).size === listings.length
  );
}

function validateCatalogResponse(response, expectedItemCount) {
  return (
    response !== null &&
    typeof response === "object" &&
    response.ok === true &&
    Number.isInteger(response.itemCount) &&
    response.itemCount === expectedItemCount &&
    Number.isInteger(response.listingCount) &&
    response.listingCount >= 0 &&
    Array.isArray(response.listings) &&
    response.listingCount === response.listings.length &&
    response.listings.length > 0 &&
    response.listings.every(isValidCatalogListing) &&
    hasUniqueListingIds(response.listings)
  );
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
      response.ok === false &&
      typeof response.error === "string" &&
      response.error.trim()
    ) {
      return {
        ok: false,
        error: response.error,
      };
    }

    if (validateCatalogResponse(response, validation.items.length)) {
      console.log(
        "NINA background received Vinted catalog listings:",
        response.listings,
      );

      return {
        ok: true,
        itemCount: validation.items.length,
        listingCount: response.listings.length,
      };
    }

    console.error(
      "NINA received invalid catalog data from the active tab content script.",
      response,
    );

    return {
      ok: false,
      error: "NINA received invalid catalog data from the Vinted page.",
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
