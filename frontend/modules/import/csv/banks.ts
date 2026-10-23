// Banks whose CSV exports we understand. Only PKO is verified on a real file.
export const BANKS = [
  { id: "pko", name: "PKO BP" },
  { id: "mbank", name: "mBank" },
  { id: "ing", name: "ING Bank Śląski" },
  { id: "santander", name: "Santander" },
  { id: "pekao", name: "Pekao SA" },
  { id: "millennium", name: "Millennium" },
  { id: "alior", name: "Alior Bank" },
  { id: "revolut", name: "Revolut" },
  { id: "credit_agricole", name: "Credit Agricole" },
  { id: "generic", name: "Inny bank" },
] as const;

export type BankId = (typeof BANKS)[number]["id"];

export function bankName(id: string): string {
  return BANKS.find((bank) => bank.id === id)?.name || id;
}
