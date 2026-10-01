"use strict";

// Server-authoritative catalog pricing.
// Keep this file in sync with the public catalog. The backend must never trust
// client-submitted item names or prices when accepting an order request.
const CATALOG = Object.freeze({
  1:  { name: "ASPADOL 100mg", rates: { 90: 249, 180: 449, 250: 599, 300: 699 } },
  2:  { name: "Tramadol Pink 100mg", rates: { 90: 249, 180: 449, 250: 599, 300: 699 } },
  3:  { name: "Somadol 350mg", rates: { 90: 219, 180: 399, 250: 519, 300: 599 } },
  4:  { name: "Xanax (Alprazolam) 1mg", rates: { 90: 349, 180: 599, 250: 799, 300: 899 } },
  5:  { name: "Belbian 10mg", rates: { 90: 549, 180: 999, 250: 1299, 300: 1499 } },
  6:  { name: "Revotril 2mg", rates: { 90: 549, 180: 999, 250: 1299, 300: 1499 } },
  7:  { name: "Ambian 10mg", rates: { 90: 399, 180: 699, 250: 899, 300: 1099 } },
  8:  { name: "Ativan 2mg", rates: { 90: 399, 180: 699, 250: 899, 300: 1099 } },
  9:  { name: "Bensedin 10mg", rates: { 90: 549, 180: 999, 250: 1299, 300: 1499 } },
  10: { name: "Gabapentine 800mg", rates: { 90: 349, 180: 599, 250: 799, 300: 899 } },
  11: { name: "Viagra 100mg", rates: { 90: 249, 180: 449, 250: 599, 300: 699 } },
  12: { name: "Viagra 200mg", rates: { 90: 249, 180: 449, 250: 599, 300: 699 } },
  13: { name: "Pregablin 600mg", rates: { 90: 349, 180: 549, 250: 849, 300: 999 } },
  14: { name: "Aurogra 100mg", rates: { 90: 249, 180: 449, 250: 599, 300: 699 } },
  15: { name: "Cenforce 200mg", rates: { 90: 299, 180: 499, 250: 649, 300: 749 } },
  16: { name: "Cenforce Professional", rates: { 90: 329, 180: 549, 250: 729, 300: 829 } },
  17: { name: "Malegra 200mg", rates: { 90: 289, 180: 479, 250: 629, 300: 719 } },
  18: { name: "Cenforce 100mg", rates: { 90: 249, 180: 449, 250: 599, 300: 699 } },
  19: { name: "Cenforce 150mg", rates: { 90: 279, 180: 469, 250: 619, 300: 699 } },
  20: { name: "Vidalista 20mg", rates: { 90: 259, 180: 449, 250: 589, 300: 669 } },
  21: { name: "Tadalista Super Active", rates: { 90: 349, 180: 599, 250: 799, 300: 899 } },
  22: { name: "Vidalista 40mg", rates: { 90: 299, 180: 499, 250: 649, 300: 749 } },
  23: { name: "Vidalista 60mg", rates: { 90: 349, 180: 599, 250: 799, 300: 899 } },
  24: { name: "Vidalista Professional", rates: { 90: 329, 180: 549, 250: 729, 300: 829 } },
  25: { name: "Nervigesic 150mg", rates: { 90: 279, 180: 469, 250: 619, 300: 699 } },
  26: { name: "Nervigesic 75mg", rates: { 90: 229, 180: 399, 250: 529, 300: 619 } },
  27: { name: "Nervigesic 300mg", rates: { 90: 349, 180: 599, 250: 799, 300: 899 } },
  28: { name: "Tapaday 100mg", rates: { 90: 249, 180: 449, 250: 599, 300: 699 } },
  29: { name: "Tapaday 200mg", rates: { 90: 349, 180: 599, 250: 799, 300: 899 } },
  30: { name: "Topcynta 100mg", rates: { 90: 279, 180: 469, 250: 619, 300: 699 } },
  31: { name: "Aspadol 200mg", rates: { 90: 349, 180: 649, 250: 849, 300: 899 } },
  32: { name: "Adderall 30mg", rates: { 90: 399, 180: 649, 250: 849, 300: 949 } },
  33: { name: "Citra 100mg", rates: { 90: 299, 180: 449, 250: 579, 300: 669 } },
  34: { name: "Oxycodon (OxyContin) 80mg", rates: { 90: 349, 180: 549, 250: 719, 300: 819 } }
});

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function getCatalogItem(id) {
  const numericId = Number(id);
  return Number.isInteger(numericId) ? CATALOG[numericId] || null : null;
}

function calculateCatalogPrice(id, pillQty) {
  const item = getCatalogItem(id);
  const qty = Number(pillQty);
  if (!item || !Number.isInteger(qty) || qty < 1 || qty > 300) return null;

  if (Object.prototype.hasOwnProperty.call(item.rates, qty)) {
    return roundMoney(item.rates[qty]);
  }

  // Preserve the existing storefront's custom-quantity rule: custom quantities
  // are derived from the 90-pill rate; preset quantities use explicit rates.
  return roundMoney((item.rates[90] / 90) * qty);
}

function normalizeOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    throw new Error("Order must contain between 1 and 50 items.");
  }

  return items.map((raw) => {
    const id = Number(raw?.id);
    const pillQty = Number(raw?.pillQty);
    const quantity = Number(raw?.qty ?? 1);
    const catalogItem = getCatalogItem(id);
    const linePrice = calculateCatalogPrice(id, pillQty);

    if (!catalogItem) throw new Error("Unknown catalog item.");
    const submittedName = String(raw?.name || "").trim();
    if (!submittedName || submittedName.toLowerCase() !== catalogItem.name.toLowerCase()) {
      throw new Error("Catalog item mismatch. Please clear the cart and add the product again.");
    }
    if (!Number.isInteger(pillQty) || pillQty < 1 || pillQty > 300) {
      throw new Error("Invalid pill quantity.");
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new Error("Invalid cart quantity.");
    }
    if (linePrice === null) throw new Error("Unable to price catalog item.");

    // The current UI merges pill quantities into a single cart line. Keep qty for
    // forward compatibility, but calculate the authoritative line from pillQty.
    return {
      id,
      name: catalogItem.name,
      qty: quantity,
      pillQty,
      linePrice
    };
  });
}

module.exports = {
  CATALOG,
  getCatalogItem,
  calculateCatalogPrice,
  normalizeOrderItems,
  roundMoney
};
