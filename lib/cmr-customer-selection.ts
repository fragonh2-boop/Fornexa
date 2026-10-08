export type CmrCustomerOption = { code: string; name: string };

/** Only codes loaded from the authenticated tenant can be selected. */
export function selectedCmrCustomerCodes(codes: string[], customers: CmrCustomerOption[]): string[] {
  const available = new Set(customers.map(customer => customer.code));
  return [...new Set(codes.filter(code => available.has(code)))];
}

export function hasValidCmrCustomerSelection(codes: string[], customers: CmrCustomerOption[]): boolean {
  return codes.length > 0 && selectedCmrCustomerCodes(codes, customers).length === codes.length;
}
