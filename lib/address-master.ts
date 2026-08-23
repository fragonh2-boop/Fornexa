export type AddressUse = "pickup" | "delivery";

export type AddressAssignment = {
  customerCode: string;
  useForPickup: boolean;
  useForDelivery: boolean;
};

export function normalizeCustomerAssignments(primaryCustomerCode: string, values: unknown) {
  const codes = Array.isArray(values) ? values : [];
  return [...new Set([primaryCustomerCode, ...codes]
    .map(value => String(value ?? "").trim().toUpperCase())
    .filter(Boolean))];
}

export function hasOperationalUse(useForPickup: boolean, useForDelivery: boolean) {
  return useForPickup || useForDelivery;
}

export function canUseAddress(assignments: AddressAssignment[], customerCode: string, use: AddressUse) {
  const code = customerCode.trim().toUpperCase();
  return assignments.some(assignment => assignment.customerCode === code
    && (use === "pickup" ? assignment.useForPickup : assignment.useForDelivery));
}

export function normalizeCustomerRouteCode(value: string) {
  const routeValue = value.trim();
  if (/^(CLI|TER)-[A-Z0-9]+$/i.test(routeValue)) return routeValue.toUpperCase();
  const known: Record<string, string> = {
    "Mediterránea Retail": "CLI-000146",
    "Nova Distribution": "CLI-000145",
    "Atlas Components": "CLI-000144",
  };
  return known[routeValue] ?? `TER-${String(Math.abs([...routeValue].reduce((total, char) => total + char.charCodeAt(0), 0))).padStart(6, "0")}`;
}
