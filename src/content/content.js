console.log("NINA content script loaded on Vinted.");

const MESSAGE_TYPES = {
  PREPARE_SEARCH: "PREPARE_SEARCH",
  EXTRACT_CATALOG_LISTINGS: "EXTRACT_CATALOG_LISTINGS",
  EXTRACT_ITEM_SELLER: "EXTRACT_ITEM_SELLER",
};

const RESULT_TYPES = {
  CATALOG_READY: "CATALOG_READY",
  CATALOG_LISTINGS: "CATALOG_LISTINGS",
  ITEM_SELLER: "ITEM_SELLER",
};

const CATALOG_SELECTORS = {
  primaryCards:
    '.new-item-box__container[data-testid^="product-item-id-"]',
  fallbackCards: '[data-testid^="product-item-id-"]',
  primaryItemLink: 'a[data-testid$="--overlay-link"]',
  fallbackItemLink: 'a[href*="/items/"]',
  gridItem: '[data-testid="grid-item"]',
  image: 'img[data-testid$="--image--img"]',
  fallbackImage: "img",
  descriptionTitle: 'p[data-testid$="--description-title"]',
  descriptionSubtitle: 'p[data-testid$="--description-subtitle"]',
  price: 'p[data-testid$="--price-text"]',
  totalPrice: 'span[data-testid="total-combined-price"]',
};

const ITEM_PAGE_SELECTORS = {
  sellerName: '[data-testid="profile-username"]',
  sellerCard: ".web_ui__Card__card",
  itemSidebar: ".item-page-sidebar-content",
  sellerLink: 'a[href*="/member/"]',
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

function isCatalogPage() {
  return (
    window.location.pathname === "/catalog" ||
    window.location.pathname.startsWith("/catalog/")
  );
}

function getCanonicalCards() {
  const primaryCards = Array.from(
    document.querySelectorAll(CATALOG_SELECTORS.primaryCards),
  );

  if (primaryCards.length > 0) {
    return primaryCards;
  }

  return Array.from(
    document.querySelectorAll(CATALOG_SELECTORS.fallbackCards),
  );
}

function findItemLink(card) {
  return (
    card.querySelector(CATALOG_SELECTORS.primaryItemLink) ||
    card.querySelector(CATALOG_SELECTORS.fallbackItemLink)
  );
}

function resolveCardRoot(card) {
  const listingContentSelectors = [
    CATALOG_SELECTORS.image,
    CATALOG_SELECTORS.fallbackImage,
    CATALOG_SELECTORS.descriptionTitle,
    CATALOG_SELECTORS.descriptionSubtitle,
    CATALOG_SELECTORS.price,
    CATALOG_SELECTORS.totalPrice,
  ];
  const containsListingContent = listingContentSelectors.some((selector) =>
    card.querySelector(selector),
  );

  if (containsListingContent) {
    return card;
  }

  return card.closest(CATALOG_SELECTORS.gridItem) || card;
}

function extractItemId(card, link) {
  const cardTestId = card.getAttribute("data-testid");
  const cardTestIdMatch = cardTestId?.match(/product-item-id-(\d+)/);

  if (cardTestIdMatch) {
    return cardTestIdMatch[1];
  }

  const linkTestId = link.getAttribute("data-testid");
  const linkTestIdMatch = linkTestId?.match(/product-item-id-(\d+)/);

  if (linkTestIdMatch) {
    return linkTestIdMatch[1];
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

function extractListing(card) {
  const link = findItemLink(card);

  if (!link) {
    return null;
  }

  const itemId = extractItemId(card, link);

  if (!itemId) {
    return null;
  }

  const itemUrl = extractItemUrl(link, itemId);

  if (!itemUrl) {
    return null;
  }

  const cardRoot = resolveCardRoot(card);
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

  for (const card of getCanonicalCards()) {
    const listing = extractListing(card);

    if (listing && !listingsById.has(listing.itemId)) {
      listingsById.set(listing.itemId, listing);
    }
  }

  return Array.from(listingsById.values());
}

function readCurrentItemPage() {
  try {
    const url = new URL(window.location.href);
    const itemPathMatch = url.pathname.match(/^\/items\/(\d+)(?:-|\/|$)/);

    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.vinted.it" ||
      !itemPathMatch
    ) {
      return null;
    }

    url.search = "";
    url.hash = "";

    return {
      itemId: itemPathMatch[1],
      itemUrl: url.href,
    };
  } catch {
    return null;
  }
}

function findSellerLink(sellerNameElement) {
  const directLink = sellerNameElement.closest(ITEM_PAGE_SELECTORS.sellerLink);

  if (directLink) {
    return directLink;
  }

  const sellerCard = sellerNameElement.closest(ITEM_PAGE_SELECTORS.sellerCard);
  const cardLink = sellerCard?.querySelector(ITEM_PAGE_SELECTORS.sellerLink);

  if (cardLink) {
    return cardLink;
  }

  const itemSidebar =
    sellerNameElement.closest(ITEM_PAGE_SELECTORS.itemSidebar) ||
    document.querySelector(ITEM_PAGE_SELECTORS.itemSidebar);

  return itemSidebar?.querySelector(ITEM_PAGE_SELECTORS.sellerLink) ?? null;
}

function extractSellerIdentity(link) {
  const href = link.getAttribute("href");

  if (!href) {
    return null;
  }

  try {
    const url = new URL(href, window.location.origin);
    const sellerPathMatch = url.pathname.match(
      /^\/member\/(\d+)(?:-|\/|$)/,
    );

    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.vinted.it" ||
      !sellerPathMatch
    ) {
      return null;
    }

    url.search = "";
    url.hash = "";

    return {
      sellerId: sellerPathMatch[1],
      sellerUrl: url.href,
    };
  } catch {
    return null;
  }
}

function extractItemSeller(itemPage) {
  const sellerNameElement = document.querySelector(
    ITEM_PAGE_SELECTORS.sellerName,
  );
  const sellerName = sellerNameElement?.textContent?.trim();

  if (!sellerNameElement || !sellerName) {
    return null;
  }

  const sellerLink = findSellerLink(sellerNameElement);

  if (!sellerLink) {
    return null;
  }

  const sellerIdentity = extractSellerIdentity(sellerLink);

  if (!sellerIdentity) {
    return null;
  }

  return {
    itemId: itemPage.itemId,
    itemUrl: itemPage.itemUrl,
    sellerId: sellerIdentity.sellerId,
    sellerName,
    sellerUrl: sellerIdentity.sellerUrl,
  };
}

function handleCatalogPage(items) {
  return Promise.resolve({
    ok: true,
    resultType: RESULT_TYPES.CATALOG_READY,
    itemCount: items.length,
  });
}

function handleItemPage(items, itemPage) {
  const itemSeller = extractItemSeller(itemPage);

  if (!itemSeller) {
    console.warn("NINA could not extract a valid seller from this item page.");

    return Promise.resolve({
      ok: false,
      error: "NINA could not find the seller on this Vinted item page.",
    });
  }

  console.log("NINA extracted Vinted item seller:", itemSeller);

  return Promise.resolve({
    ok: true,
    resultType: RESULT_TYPES.ITEM_SELLER,
    itemCount: items.length,
    itemSeller,
  });
}

function handlePrepareSearch(items) {
  if (isCatalogPage()) {
    return handleCatalogPage(items);
  }

  const itemPage = readCurrentItemPage();

  if (itemPage) {
    return handleItemPage(items, itemPage);
  }

  return Promise.resolve({
    ok: false,
    error: "Open a Vinted catalog or item page before continuing.",
  });
}

function handlePrepareSearchMessage(message) {
  const validation = validatePrepareSearch(message);

  if (!validation.ok) {
    return Promise.resolve(validation);
  }

  return handlePrepareSearch(validation.items);
}

function handleExtractCatalogListingsMessage() {
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

  console.log(
    "NINA extracted listings from temporary catalog tab:",
    listings,
  );

  return Promise.resolve({
    ok: true,
    resultType: RESULT_TYPES.CATALOG_LISTINGS,
    listingCount: listings.length,
    listings,
  });
}

function handleExtractItemSellerMessage() {
  const itemPage = readCurrentItemPage();

  if (!itemPage) {
    return Promise.resolve({
      ok: false,
      error: "Open a Vinted item page before continuing.",
    });
  }

  const itemSeller = extractItemSeller(itemPage);

  if (!itemSeller) {
    console.warn(
      "NINA could not extract a valid seller from the temporary item tab.",
    );

    return Promise.resolve({
      ok: false,
      error: "NINA could not find the seller on this Vinted item page.",
    });
  }

  console.log(
    "NINA extracted seller for temporary item tab:",
    itemSeller,
  );

  return Promise.resolve({
    ok: true,
    resultType: RESULT_TYPES.ITEM_SELLER,
    itemSeller,
  });
}

function handleMessage(message) {
  if (message === null || typeof message !== "object") {
    return undefined;
  }

  if (message.type === MESSAGE_TYPES.PREPARE_SEARCH) {
    return handlePrepareSearchMessage(message);
  }

  if (message.type === MESSAGE_TYPES.EXTRACT_CATALOG_LISTINGS) {
    return handleExtractCatalogListingsMessage();
  }

  if (message.type === MESSAGE_TYPES.EXTRACT_ITEM_SELLER) {
    return handleExtractItemSellerMessage();
  }

  return undefined;
}

browser.runtime.onMessage.addListener(handleMessage);
