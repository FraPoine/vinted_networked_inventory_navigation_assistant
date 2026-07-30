console.log("NINA background script loaded.");

const MESSAGE_TYPES = {
  CREATE_SEARCH_REQUEST: "CREATE_SEARCH_REQUEST",
  PREPARE_SEARCH: "PREPARE_SEARCH",
  EXTRACT_CATALOG_LISTINGS: "EXTRACT_CATALOG_LISTINGS",
  EXTRACT_ITEM_SELLER: "EXTRACT_ITEM_SELLER",
};

const RESULT_TYPES = {
  CATALOG_READY: "CATALOG_READY",
  CATALOG_LISTINGS: "CATALOG_LISTINGS",
  ITEM_SELLER: "ITEM_SELLER",
  SELLER_INTERSECTION_COMPLETE: "SELLER_INTERSECTION_COMPLETE",
};

const TEMPORARY_TAB_TIMEOUT_MS = 20_000;
const MAX_LISTINGS_PER_RUN = 5;

let isSearchingRequestedItems = false;

class TemporaryTabCleanupError extends Error {}

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

  if (items.length !== 2) {
    return {
      ok: false,
      error: "Exactly two items are required.",
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

function validateCatalogReadyResponse(response) {
  return (
    response !== null &&
    typeof response === "object" &&
    response.ok === true &&
    response.resultType === RESULT_TYPES.CATALOG_READY &&
    Number.isInteger(response.itemCount) &&
    response.itemCount === 2
  );
}

function validateDirectCatalogResponse(response) {
  return (
    response !== null &&
    typeof response === "object" &&
    response.ok === true &&
    response.resultType === RESULT_TYPES.CATALOG_LISTINGS &&
    Number.isInteger(response.listingCount) &&
    response.listingCount > 0 &&
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
      "NINA could not close the temporary Vinted tab.",
      error,
    );

    try {
      await browser.tabs.get(temporaryTabId);
    } catch {
      return;
    }

    throw new TemporaryTabCleanupError(
      "The temporary Vinted tab is still open.",
    );
  }
}

function buildCatalogSearchUrl(requestedItem) {
  const url = new URL("https://www.vinted.it/catalog");
  url.searchParams.set("search_text", requestedItem);
  return url.href;
}

async function extractCatalogFromTemporaryTab(requestedItem, windowId) {
  let temporaryTabId = null;

  try {
    const createOptions = {
      url: buildCatalogSearchUrl(requestedItem),
      active: false,
    };

    if (Number.isInteger(windowId)) {
      createOptions.windowId = windowId;
    }

    const temporaryTab = await browser.tabs.create(createOptions);

    if (!Number.isInteger(temporaryTab.id)) {
      throw new Error("The temporary catalog tab has no valid ID.");
    }

    temporaryTabId = temporaryTab.id;
    await waitForTabComplete(temporaryTabId);

    const catalogResponse = await browser.tabs.sendMessage(temporaryTabId, {
      type: MESSAGE_TYPES.EXTRACT_CATALOG_LISTINGS,
    });

    if (!validateDirectCatalogResponse(catalogResponse)) {
      console.error(
        "NINA received invalid data from the temporary catalog tab.",
        catalogResponse,
      );
      throw new Error("The temporary catalog tab returned invalid data.");
    }

    return catalogResponse;
  } finally {
    await closeTemporaryTab(temporaryTabId);
  }
}

async function extractSellerFromTemporaryTab(listing, windowId) {
  let temporaryTabId = null;

  try {
    const createOptions = {
      url: listing.itemUrl,
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

    if (!validateDirectItemSellerResponse(sellerResponse, listing.itemId)) {
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

function addListingToSellerGroups(sellerGroups, enrichedListing) {
  const {
    sellerId,
    sellerName,
    sellerUrl,
    ...catalogListing
  } = enrichedListing;
  const existingGroup = sellerGroups.get(sellerId);

  if (existingGroup) {
    existingGroup.listings.push(catalogListing);
    return;
  }

  sellerGroups.set(sellerId, {
    sellerId,
    sellerName,
    sellerUrl,
    listings: [catalogListing],
  });
}

function buildCatalogSearchResult(
  requestedItem,
  catalogResponse,
  listingsToProcess,
  enrichedListings,
  failures,
) {
  const sellerGroups = new Map();

  for (const enrichedListing of enrichedListings) {
    addListingToSellerGroups(sellerGroups, enrichedListing);
  }

  const sellers = Array.from(sellerGroups.values());

  return {
    requestedItem,
    catalogListingCount: catalogResponse.listings.length,
    processedCount: listingsToProcess.length,
    successCount: enrichedListings.length,
    failureCount: failures.length,
    sellerCount: sellers.length,
    sellers,
    failures,
  };
}

async function processCatalogSearch(
  requestedItem,
  catalogResponse,
  windowId,
) {
  const listingsToProcess = catalogResponse.listings.slice(
    0,
    MAX_LISTINGS_PER_RUN,
  );
  const enrichedListings = [];
  const failures = [];

  for (const listing of listingsToProcess) {
    try {
      if (!isValidCatalogListing(listing)) {
        throw new Error("The catalog listing is invalid.");
      }

      const itemSeller = await extractSellerFromTemporaryTab(
        listing,
        windowId,
      );
      const enrichedListing = {
        ...listing,
        sellerId: itemSeller.sellerId,
        sellerName: itemSeller.sellerName,
        sellerUrl: itemSeller.sellerUrl,
      };

      enrichedListings.push(enrichedListing);
    } catch (error) {
      if (error instanceof TemporaryTabCleanupError) {
        throw error;
      }

      console.error(
        `NINA could not enrich catalog listing ${listing.itemId}.`,
        error,
      );
      failures.push({
        itemId: listing.itemId,
        itemUrl: listing.itemUrl,
      });
    }
  }

  return buildCatalogSearchResult(
    requestedItem,
    catalogResponse,
    listingsToProcess,
    enrichedListings,
    failures,
  );
}

function intersectSearchSellers(searchResults) {
  const [firstSearch, secondSearch] = searchResults;
  const secondSellersById = new Map(
    secondSearch.sellers.map((seller) => [seller.sellerId, seller]),
  );
  const matchingSellers = [];

  for (const firstSeller of firstSearch.sellers) {
    const secondSeller = secondSellersById.get(firstSeller.sellerId);

    if (!secondSeller) {
      continue;
    }

    matchingSellers.push({
      sellerId: firstSeller.sellerId,
      sellerName: firstSeller.sellerName,
      sellerUrl: firstSeller.sellerUrl,
      matches: [
        {
          requestedItem: firstSearch.requestedItem,
          listings: firstSeller.listings.map((listing) => ({ ...listing })),
        },
        {
          requestedItem: secondSearch.requestedItem,
          listings: secondSeller.listings.map((listing) => ({ ...listing })),
        },
      ],
    });
  }

  return matchingSellers;
}

function createSearchSummary(searchResult) {
  return {
    requestedItem: searchResult.requestedItem,
    processedCount: searchResult.processedCount,
    successCount: searchResult.successCount,
    failureCount: searchResult.failureCount,
    sellerCount: searchResult.sellerCount,
  };
}

async function searchRequestedItems(requestedItems, windowId) {
  if (isSearchingRequestedItems) {
    return {
      ok: false,
      error: "NINA is already searching the requested items.",
    };
  }

  isSearchingRequestedItems = true;

  try {
    const searchResults = [];

    for (const requestedItem of requestedItems) {
      let catalogResponse;

      try {
        catalogResponse = await extractCatalogFromTemporaryTab(
          requestedItem,
          windowId,
        );
      } catch (error) {
        console.error(
          `NINA could not process catalog search for "${requestedItem}".`,
          error,
        );
        return {
          ok: false,
          error: "NINA could not process one of the requested searches.",
        };
      }

      const searchResult = await processCatalogSearch(
        requestedItem,
        catalogResponse,
        windowId,
      );

      if (searchResult.successCount === 0) {
        return {
          ok: false,
          error:
            "NINA could not read sellers for one of the requested searches.",
        };
      }

      searchResults.push(searchResult);
    }

    const matchingSellers = intersectSearchSellers(searchResults);
    const intersectionResult = {
      requestedItems: [...requestedItems],
      searches: searchResults,
      matchingSellerCount: matchingSellers.length,
      matchingSellers,
    };

    console.log(
      "NINA completed requested-item seller intersection:",
      intersectionResult,
    );

    return {
      ok: true,
      resultType: RESULT_TYPES.SELLER_INTERSECTION_COMPLETE,
      itemCount: requestedItems.length,
      searchCount: searchResults.length,
      searches: searchResults.map(createSearchSummary),
      matchingSellerCount: matchingSellers.length,
    };
  } catch (error) {
    console.error("NINA could not complete the requested-item searches.", error);
    return {
      ok: false,
      error: "NINA could not process one of the requested searches.",
    };
  } finally {
    isSearchingRequestedItems = false;
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

    if (validateCatalogReadyResponse(response)) {
      return searchRequestedItems(validation.items, activeTab.windowId);
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
