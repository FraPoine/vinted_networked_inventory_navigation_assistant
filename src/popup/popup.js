const form = document.querySelector("#item-form");
const itemFields = document.querySelector("#item-fields");
const addItemButton = document.querySelector("#add-item");
const status = document.querySelector("#status");

let nextItemId = 3;

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
  if (items.length < 2) {
    return "Enter at least two items.";
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

function handleSubmit(event) {
  event.preventDefault();

  const items = readItems();
  const validationError = validateItems(items);

  if (validationError) {
    setStatus(validationError, true);
    return;
  }

  setStatus("Items validated successfully.");
  console.log("NINA validated items:", items);
}

addItemButton.addEventListener("click", addItemField);
form.addEventListener("submit", handleSubmit);
