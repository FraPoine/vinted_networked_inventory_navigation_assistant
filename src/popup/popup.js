const form = document.querySelector("#item-form");
const itemFields = document.querySelector("#item-fields");
const addItemButton = document.querySelector("#add-item");
const status = document.querySelector("#status");

const MESSAGE_TYPES = {
  CREATE_SEARCH_REQUEST: "CREATE_SEARCH_REQUEST",
};

const RESULT_TYPES = {
  ITEM_SELLER: "ITEM_SELLER",
  SELLER_INTERSECTION_COMPLETE: "SELLER_INTERSECTION_COMPLETE",
};

let nextItemId = 3;
let isSubmitting = false;

function createItemField(itemNumber) {
  const field = document.createElement("div");
  const label = document.createElement("label");
  const input = document.createElement("input");
  const removeButton = document.createElement("button");
  const inputId = `item-${itemNumber}`;

  field.className = "item-field";

  label.htmlFor = inputId;
  label.textContent = `Item ${itemNumber}`;

  input.id = inputId;
  input.name = "items";
  input.type = "text";
  input.placeholder = "e.g. item name";
  input.autocomplete = "off";

  removeButton.className = "remove-item";
  removeButton.type = "button";
  removeButton.textContent = "Remove";
  removeButton.setAttribute("aria-label", `Remove item ${itemNumber}`);
  removeButton.addEventListener("click", () => removeItemField(field));

  field.append(label, input, removeButton);
  return { field, input };
}

function addItemField() {
  const { field, input } = createItemField(nextItemId);
  nextItemId += 1;
  itemFields.append(field);
  input.focus();
}

function removeItemField(field) {
  field.remove();
}

function readItems() {
  return Array.from(itemFields.querySelectorAll('input[name="items"]'))
    .map((input) => input.value.trim())
    .filter(Boolean);
}

function findDuplicateItems(items) {
  const seen = new Set();

  return items.filter((item) => {
    const normalizedItem = item.toLocaleLowerCase();

    if (seen.has(normalizedItem)) {
      return true;
    }

    seen.add(normalizedItem);
    return false;
  });
}

function validateItems(items) {
  if (items.length !== 2) {
    return "Enter exactly two items.";
  }

  if (findDuplicateItems(items).length > 0) {
    return "Each item must be different.";
  }

  return "";
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function isValidSearchSummary(summary, requestedItem) {
  const expectedKeys = [
    "requestedItem",
    "processedCount",
    "successCount",
    "failureCount",
    "sellerCount",
  ];

  return (
    summary !== null &&
    typeof summary === "object" &&
    !Array.isArray(summary) &&
    Object.keys(summary).length === expectedKeys.length &&
    expectedKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(summary, key),
    ) &&
    typeof summary.requestedItem === "string" &&
    summary.requestedItem.trim().length > 0 &&
    summary.requestedItem === requestedItem &&
    Number.isInteger(summary.processedCount) &&
    summary.processedCount >= 1 &&
    summary.processedCount <= 5 &&
    Number.isInteger(summary.successCount) &&
    summary.successCount > 0 &&
    summary.successCount <= summary.processedCount &&
    Number.isInteger(summary.failureCount) &&
    summary.failureCount >= 0 &&
    summary.successCount + summary.failureCount === summary.processedCount &&
    Number.isInteger(summary.sellerCount) &&
    summary.sellerCount > 0 &&
    summary.sellerCount <= summary.successCount
  );
}

function formatSellerIntersectionStatus(matchingSellerCount) {
  if (matchingSellerCount === 0) {
    return "No common sellers found in the processed listings.";
  }

  const sellerLabel = matchingSellerCount === 1 ? "seller" : "sellers";
  return `Found ${matchingSellerCount} ${sellerLabel} with listings in both processed searches.`;
}

async function handleSubmit(event) {
  event.preventDefault();

  if (isSubmitting) {
    return;
  }

  const items = readItems();
  const validationError = validateItems(items);

  if (validationError) {
    setStatus(validationError, true);
    return;
  }

  isSubmitting = true;
  setStatus("Sending items…");

  try {
    const response = await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.CREATE_SEARCH_REQUEST,
      items,
    });

    if (response === null || typeof response !== "object") {
      setStatus("NINA received an invalid background response.", true);
      return;
    }

    if (
      response.ok === true &&
      response.resultType === RESULT_TYPES.SELLER_INTERSECTION_COMPLETE &&
      response.itemCount === 2 &&
      response.searchCount === 2 &&
      Array.isArray(response.searches) &&
      response.searches.length === 2 &&
      response.searches.every((summary, index) =>
        isValidSearchSummary(summary, items[index]),
      ) &&
      Number.isInteger(response.matchingSellerCount) &&
      response.matchingSellerCount >= 0 &&
      response.matchingSellerCount <=
        Math.min(
          response.searches[0].sellerCount,
          response.searches[1].sellerCount,
        )
    ) {
      setStatus(
        formatSellerIntersectionStatus(response.matchingSellerCount),
      );
      return;
    }

    if (
      response.ok === true &&
      response.resultType === RESULT_TYPES.ITEM_SELLER &&
      response.itemCount === 2 &&
      typeof response.itemId === "string" &&
      /^\d+$/.test(response.itemId) &&
      typeof response.sellerName === "string" &&
      response.sellerName.trim().length > 0
    ) {
      setStatus(
        `Read seller ${response.sellerName} from the current Vinted item.`,
      );
      return;
    }

    if (response.ok === false && typeof response.error === "string") {
      setStatus(response.error, true);
      return;
    }

    setStatus("NINA received an invalid background response.", true);
  } catch (error) {
    console.error("NINA background communication failed.", error);
    setStatus("NINA could not contact the background script.", true);
  } finally {
    isSubmitting = false;
  }
}

addItemButton.addEventListener("click", addItemField);
form.addEventListener("submit", handleSubmit);
