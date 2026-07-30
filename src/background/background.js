console.log("NINA background script loaded.");

const MESSAGE_TYPES = {
  CREATE_SEARCH_REQUEST: "CREATE_SEARCH_REQUEST",
  PREPARE_SEARCH: "PREPARE_SEARCH",
  EXTRACT_ITEM_SELLER: "EXTRACT_ITEM_SELLER",
};

const RESULT_TYPES = {
  CATALOG_LISTINGS: "CATALOG_LISTINGS",
  ITEM_SELLER: "ITEM_SELLER",
  FIRST_LISTING_ENRICHED: "FIRST_LISTING_ENRICHED",
};

const TEMPORARY_TAB_TIMEOUT_MS = 20_000;

let isEnrichingFirstListing = false;

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

const ITEM_SELLER_KEYS = [
  "itemId",
  "itemUrl",
  "sellerId",
  "sellerName",
  "sellerUrl",
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
    response.resultType === RESULT_TYPES.CATALOG_LISTINGS &&
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

function isValidIdentityUrl(urlValue, pathPrefix, expectedId) {
  if (typeof urlValue !== "string") {
    return false;
  }

  try {
    const url = new URL(urlValue);
    const pathMatch = url.pathname.match(
      new RegExp(`^/${pathPrefix}/(\\d+)(?:-|/|$)`),
    );

    return (
      url.protocol === "https:" &&
      url.hostname === "www.vinted.it" &&
      url.search === "" &&
      url.hash === "" &&
      pathMatch?.[1] === expectedId
    );
  } catch {
    return false;
  }
}

function isValidItemSeller(itemSeller) {
  return (
    itemSeller !== null &&
    typeof itemSeller === "object" &&
    !Array.isArray(itemSeller) &&
    Object.keys(itemSeller).length === ITEM_SELLER_KEYS.length &&
    ITEM_SELLER_KEYS.every((key) =>
      Object.prototype.hasOwnProperty.call(itemSeller, key),
    ) &&
    typeof itemSeller.itemId === "string" &&
    /^\d+$/.test(itemSeller.itemId) &&
    isValidIdentityUrl(itemSeller.itemUrl, "items", itemSeller.itemId) &&
    typeof itemSeller.sellerId === "string" &&
    /^\d+$/.test(itemSeller.sellerId) &&
    typeof itemSeller.sellerName === "string" &&
    itemSeller.sellerName.trim().length > 0 &&
    isValidIdentityUrl(itemSeller.sellerUrl, "member", itemSeller.sellerId)
  );
}

function validateItemSellerResponse(response, expectedItemCount) {
  return (
    response !== null &&
    typeof response === "object" &&
    response.ok === true &&
    response.resultType === RESULT_TYPES.ITEM_SELLER &&
    Number.isInteger(response.itemCount) &&
    response.itemCount === expectedItemCount &&
    isValidItemSeller(response.itemSeller)
  );
}

function validateDirectItemSellerResponse(response, expectedItemId) {
  return (
    response !== null &&
    typeof response === "object" &&
    response.ok === true &&
    response.resultType === RESULT_TYPES.ITEM_SELLER &&
    isValidItemSeller(response.itemSeller) &&
    response.itemSeller.itemId === expectedItemId
  );
}

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      browser.tabs.onUpdated.removeListener(handleUpdated);
      browser.tabs.onRemoved.removeListener(handleRemoved);
      clearTimeout(timeoutId);
    };

    const settle = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const handleUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        settle();
      }
    };

    const handleRemoved = (removedTabId) => {
      if (removedTabId === tabId) {
        settle(new Error("The temporary tab was closed before loading."));
      }
    };

    const timeoutId = setTimeout(() => {
      settle(new Error("The temporary tab did not finish loading in time."));
    }, TEMPORARY_TAB_TIMEOUT_MS);

    browser.tabs.onUpdated.addListener(handleUpdated);
    browser.tabs.onRemoved.addListener(handleRemoved);

    browser.tabs.get(tabId)
      .then((tab) => {
        if (tab.status === "complete") {
          settle();
        }
      })
      .catch((error) => settle(error));
  });
}

async function closeTemporaryTab(temporaryTabId) {
  if (!Number.isInteger(temporaryTabId)) {
    return;
  }

  try {
    await browser.tabs.remove(temporaryTabId);
  } catch (error) {
    console.error(
      "NINA could not close the temporary Vinted item tab.",
      error,
    );
  }
}

async function extractSellerFromTemporaryTab(firstListing, windowId) {
  let temporaryTabId = null;

  try {
    const createOptions = {
      url: firstListing.itemUrl,
      active: false,
    };

    if (Number.isInteger(windowId)) {
      createOptions.windowId = windowId;
    }

    const temporaryTab = await browser.tabs.create(createOptions);

    if (!Number.isInteger(temporaryTab.id)) {
      throw new Error("The temporary tab has no valid ID.");
    }

    temporaryTabId = temporaryTab.id;
    await waitForTabComplete(temporaryTabId);

    const sellerResponse = await browser.tabs.sendMessage(temporaryTabId, {
      type: MESSAGE_TYPES.EXTRACT_ITEM_SELLER,
    });

    if (
      !validateDirectItemSellerResponse(sellerResponse, firstListing.itemId)
    ) {
      console.error(
        "NINA received invalid seller data from the temporary item tab.",
        sellerResponse,
      );
      throw new Error("The temporary item tab returned invalid seller data.");
    }

    return sellerResponse.itemSeller;
  } finally {
    await closeTemporaryTab(temporaryTabId);
  }
}

async function enrichFirstCatalogListing(
  catalogResponse,
  requestedItemCount,
  windowId,
) {
  if (isEnrichingFirstListing) {
    return {
      ok: false,
      error: "NINA is already processing a catalog listing.",
    };
  }

  isEnrichingFirstListing = true;

  try {
    const firstListing = catalogResponse.listings[0];

    if (!isValidCatalogListing(firstListing)) {
      console.error(
        "NINA could not validate the first catalog listing.",
        firstListing,
      );
      throw new Error("The first catalog listing is invalid.");
    }

    const itemSeller = await extractSellerFromTemporaryTab(
      firstListing,
      windowId,
    );
    const enrichedListing = {
      ...firstListing,
      sellerId: itemSeller.sellerId,
      sellerName: itemSeller.sellerName,
      sellerUrl: itemSeller.sellerUrl,
    };

    console.log(
      "NINA enriched the first catalog listing:",
      enrichedListing,
    );

    return {
      ok: true,
      resultType: RESULT_TYPES.FIRST_LISTING_ENRICHED,
      itemCount: requestedItemCount,
      listingCount: catalogResponse.listings.length,
      itemId: enrichedListing.itemId,
      sellerName: enrichedListing.sellerName,
    };
  } catch (error) {
    console.error(
      "NINA could not enrich the first Vinted catalog listing.",
      error,
    );

    return {
      ok: false,
      error: "NINA could not read the seller for the first catalog listing.",
    };
  } finally {
    isEnrichingFirstListing = false;
  }
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

      return enrichFirstCatalogListing(
        response,
        validation.items.length,
        activeTab.windowId,
      );
    }

    if (validateItemSellerResponse(response, validation.items.length)) {
      console.log(
        "NINA background received Vinted item seller:",
        response.itemSeller,
      );

      return {
        ok: true,
        resultType: RESULT_TYPES.ITEM_SELLER,
        itemCount: validation.items.length,
        itemId: response.itemSeller.itemId,
        sellerName: response.itemSeller.sellerName,
      };
    }

    console.error(
      "NINA received invalid page data from the active tab content script.",
      response,
    );

    return {
      ok: false,
      error: "NINA received invalid page data from the Vinted page.",
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
