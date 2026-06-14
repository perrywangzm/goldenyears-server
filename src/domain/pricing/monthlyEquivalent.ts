export function monthlyEquivalent(price: number, unit: "month" | "day") {
  return unit === "month" ? price : price * 30;
}

export function formatSgdPrice(price: number, unit: "month" | "day") {
  return `From SGD ${price.toLocaleString("en-SG")}/${unit}`;
}
