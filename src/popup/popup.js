const form = document.querySelector("#search-form");
const itemFields = document.querySelector("#item-fields");
const addItemButton = document.querySelector("#add-item");
const statusMessage = document.querySelector("#status");

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function addItemField() {
  const itemNumber = itemFields.querySelectorAll("input").length + 1;
  const field = document.createElement("div");
  const label = document.createElement("label");
  const input = document.createElement("input");

  field.className = "field";
  label.htmlFor = `item-${itemNumber}`;
  label.textContent = `Item ${itemNumber}`;
  input.id = `item-${itemNumber}`;
  input.name = "items";
  input.type = "text";
  input.autocomplete = "off";

  field.append(label, input);
  itemFields.append(field);
  input.focus();
}

function readItems() {
  return Array.from(itemFields.querySelectorAll("input"))
    .map((input) => input.value.trim())
    .filter(Boolean);
}

async function saveSearch(event) {
  event.preventDefault();
  const items = readItems();

  if (items.length < 2) {
    setStatus("Enter at least two items before continuing.", true);
    return;
  }

  try {
    const { searches = [] } = await browser.storage.local.get("searches");
    const safeSearches = Array.isArray(searches) ? searches : [];
    const search = {
      items,
      createdAt: new Date().toISOString(),
    };

    await browser.storage.local.set({
      searches: [...safeSearches, search],
    });
    setStatus(
      "Your items were saved. Seller search functionality will be implemented later.",
    );
  } catch (error) {
    console.error("NINA could not save the search.", error);
    setStatus("NINA could not save your items. Please try again.", true);
  }
}

addItemButton.addEventListener("click", addItemField);
form.addEventListener("submit", saveSearch);
