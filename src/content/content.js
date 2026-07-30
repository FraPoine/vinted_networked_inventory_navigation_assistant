console.log("NINA content script loaded on Vinted.");

const MESSAGE_TYPES = {
  PREPARE_SEARCH: "PREPARE_SEARCH",
};

const CATALOG_SELECTORS = {
  primaryItemLinks:
    'a[data-testid^="product-item-id-"][data-testid$="--overlay-link"]',
  fallbackItemLinks: 'a[href*="/items/"]',
  gridItem: '[data-testid="grid-item"]',
  cardContainer: ".new-item-box__container",
  image: 'img[data-testid$="--image--img"]',
  fallbackImage: "img",
  descriptionTitle: 'p[data-testid$="--description-title"]',
  descriptionSubtitle: 'p[data-testid$="--description-subtitle"]',
  price: 'p[data-testid$="--price-text"]',
  totalPrice: 'span[data-testid="total-combined-price"]',
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

function isCatalogPage() {
  return (
    window.location.pathname === "/catalog" ||
    window.location.pathname.startsWith("/catalog/")
  );
}

function getCanonicalItemLinks() {
  const primaryLinks = Array.from(
    document.querySelectorAll(CATALOG_SELECTORS.primaryItemLinks),
  );

  if (primaryLinks.length > 0) {
    return primaryLinks;
  }

  return Array.from(
    document.querySelectorAll(CATALOG_SELECTORS.fallbackItemLinks),
  );
}

function findCardRoot(link) {
  return (
    link.closest(CATALOG_SELECTORS.gridItem) ||
    link.closest(CATALOG_SELECTORS.cardContainer) ||
    link.parentElement
  );
}

function extractItemId(link) {
  const testId = link.getAttribute("data-testid");
  const testIdMatch = testId?.match(/product-item-id-(\d+)--overlay-link/);

  if (testIdMatch) {
    return testIdMatch[1];
  }

  const href = link.getAttribute("href");
  const urlMatch = href?.match(/\/items\/(\d+)/);
  return urlMatch?.[1] ?? null;
}

function extractItemUrl(link, itemId) {
  const href = link.getAttribute("href");

  if (!href) {
    return null;
  }

  try {
    const url = new URL(href, window.location.origin);
    const itemPathMatch = url.pathname.match(/^\/items\/(\d+)(?:-|\/|$)/);

    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.vinted.it" ||
      !itemPathMatch ||
      itemPathMatch[1] !== itemId
    ) {
      return null;
    }

    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function readOptionalText(cardRoot, selector) {
  const text = cardRoot.querySelector(selector)?.textContent?.trim();
  return text || null;
}

function extractImageData(cardRoot) {
  const image =
    cardRoot.querySelector(CATALOG_SELECTORS.image) ||
    cardRoot.querySelector(CATALOG_SELECTORS.fallbackImage);

  if (!image) {
    return {
      imageUrl: null,
      imageAlt: null,
    };
  }

  const imageUrl = [image.currentSrc, image.src].find(
    (value) => typeof value === "string" && value.trim(),
  );
  const imageAlt = image.getAttribute("alt")?.trim();

  return {
    imageUrl: imageUrl?.trim() || null,
    imageAlt: imageAlt || null,
  };
}

function extractListing(link) {
  const itemId = extractItemId(link);

  if (!itemId) {
    return null;
  }

  const itemUrl = extractItemUrl(link, itemId);
  const cardRoot = findCardRoot(link);

  if (!itemUrl || !cardRoot) {
    return null;
  }

  const { imageUrl, imageAlt } = extractImageData(cardRoot);

  return {
    itemId,
    itemUrl,
    imageUrl,
    imageAlt,
    descriptionTitle: readOptionalText(
      cardRoot,
      CATALOG_SELECTORS.descriptionTitle,
    ),
    descriptionSubtitle: readOptionalText(
      cardRoot,
      CATALOG_SELECTORS.descriptionSubtitle,
    ),
    priceText: readOptionalText(cardRoot, CATALOG_SELECTORS.price),
    totalPriceText: readOptionalText(
      cardRoot,
      CATALOG_SELECTORS.totalPrice,
    ),
  };
}

function extractVisibleCatalogListings() {
  const listingsById = new Map();

  for (const link of getCanonicalItemLinks()) {
    const listing = extractListing(link);

    if (listing && !listingsById.has(listing.itemId)) {
      listingsById.set(listing.itemId, listing);
    }
  }

  return Array.from(listingsById.values());
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

  if (!isCatalogPage()) {
    return Promise.resolve({
      ok: false,
      error: "Open a Vinted catalog page before continuing.",
    });
  }

  const listings = extractVisibleCatalogListings();

  if (listings.length === 0) {
    return Promise.resolve({
      ok: false,
      error: "NINA could not find loaded listings on this catalog page.",
    });
  }

  console.log("NINA extracted Vinted catalog listings:", listings);

  return Promise.resolve({
    ok: true,
    itemCount: validation.items.length,
    listingCount: listings.length,
    listings,
  });
}

browser.runtime.onMessage.addListener(handleMessage);
