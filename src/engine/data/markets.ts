export interface CountryDef {
  code: string;
  name: string;
  currency: string;
  corporateTax: number; // %
  payrollTax: number; // % employer contributions on salaries
  taxNote: string;
  fxBase: number; // INR per unit of currency at start
  fxVol: number; // monthly volatility
}

export const COUNTRIES: Record<string, CountryDef> = {
  IN: { code: 'IN', name: 'India', currency: 'INR', corporateTax: 25.17, payrollTax: 13, taxNote: 'New regime 22% + surcharge & cess ≈ 25.17%. Employer PF/ESI ≈ 13% of salary.', fxBase: 1, fxVol: 0 },
  US: { code: 'US', name: 'United States', currency: 'USD', corporateTax: 25.5, payrollTax: 8, taxNote: 'Federal 21% + average state ≈ 25.5%. FICA/unemployment ≈ 8%.', fxBase: 83, fxVol: 0.012 },
  GB: { code: 'GB', name: 'United Kingdom', currency: 'GBP', corporateTax: 25, payrollTax: 13.8, taxNote: 'Main rate 25%. Employer NIC ≈ 13.8%.', fxBase: 105, fxVol: 0.015 },
  DE: { code: 'DE', name: 'Germany', currency: 'EUR', corporateTax: 30, payrollTax: 20, taxNote: 'Corporate + trade tax ≈ 30%. Employer social contributions ≈ 20%.', fxBase: 90, fxVol: 0.013 },
  FR: { code: 'FR', name: 'France', currency: 'EUR', corporateTax: 25, payrollTax: 30, taxNote: 'Corporate 25%. Employer social charges ≈ 30%.', fxBase: 90, fxVol: 0.013 },
  SG: { code: 'SG', name: 'Singapore', currency: 'SGD', corporateTax: 17, payrollTax: 17, taxNote: 'Headline 17%. CPF employer ≈ 17%.', fxBase: 62, fxVol: 0.009 },
  AE: { code: 'AE', name: 'United Arab Emirates', currency: 'AED', corporateTax: 9, payrollTax: 12.5, taxNote: '9% above AED 375k. Pension/benefits ≈ 12.5%.', fxBase: 22.6, fxVol: 0.004 },
  JP: { code: 'JP', name: 'Japan', currency: 'JPY', corporateTax: 30.6, payrollTax: 15, taxNote: 'Effective ≈ 30.6%. Social insurance ≈ 15%.', fxBase: 0.56, fxVol: 0.018 },
  BR: { code: 'BR', name: 'Brazil', currency: 'BRL', corporateTax: 34, payrollTax: 28, taxNote: 'IRPJ + CSLL ≈ 34%. Payroll charges ≈ 28%.', fxBase: 16.5, fxVol: 0.03 },
  ID: { code: 'ID', name: 'Indonesia', currency: 'IDR', corporateTax: 22, payrollTax: 10, taxNote: 'Standard 22%. BPJS ≈ 10%.', fxBase: 0.0053, fxVol: 0.02 },
  AU: { code: 'AU', name: 'Australia', currency: 'AUD', corporateTax: 30, payrollTax: 11.5, taxNote: '30% (25% small business). Superannuation ≈ 11.5%.', fxBase: 55, fxVol: 0.016 },
  CA: { code: 'CA', name: 'Canada', currency: 'CAD', corporateTax: 26.5, payrollTax: 9, taxNote: 'Federal + provincial ≈ 26.5%. CPP/EI ≈ 9%.', fxBase: 61, fxVol: 0.012 },
};

export interface MarketDef {
  id: string;
  name: string;
  kind: 'city' | 'region' | 'country';
  country: string;
  population: number; // millions
  income: number; // per-capita spending power index (India avg = 1)
  laborCost: number; // salary index (Bengaluru = 1)
  rentIndex: number; // office rent index
  regulation: number; // 0..1 extra regulatory burden
  competition: number; // 0..1 local competitive intensity
  entryCost: number; // INR one-off to enter
  entryDays: number;
  distance: number; // cultural/operational distance 0..1 from India
  growth: number; // annual demand growth
  hqOption: boolean;
}

export const MARKETS: MarketDef[] = [
  { id: 'blr', name: 'Bengaluru', kind: 'city', country: 'IN', population: 13, income: 1.7, laborCost: 1, rentIndex: 1, regulation: 0, competition: 0.8, entryCost: 300000, entryDays: 30, distance: 0, growth: 0.06, hqOption: true },
  { id: 'mum', name: 'Mumbai', kind: 'city', country: 'IN', population: 21, income: 1.8, laborCost: 1.05, rentIndex: 1.6, regulation: 0, competition: 0.85, entryCost: 500000, entryDays: 30, distance: 0, growth: 0.05, hqOption: true },
  { id: 'del', name: 'Delhi NCR', kind: 'city', country: 'IN', population: 33, income: 1.6, laborCost: 0.95, rentIndex: 1.2, regulation: 0.05, competition: 0.8, entryCost: 500000, entryDays: 30, distance: 0, growth: 0.05, hqOption: true },
  { id: 'hyd', name: 'Hyderabad', kind: 'city', country: 'IN', population: 11, income: 1.4, laborCost: 0.9, rentIndex: 0.8, regulation: 0, competition: 0.65, entryCost: 250000, entryDays: 25, distance: 0, growth: 0.07, hqOption: true },
  { id: 'che', name: 'Chennai', kind: 'city', country: 'IN', population: 12, income: 1.3, laborCost: 0.88, rentIndex: 0.8, regulation: 0, competition: 0.6, entryCost: 250000, entryDays: 25, distance: 0.05, growth: 0.05, hqOption: true },
  { id: 'pun', name: 'Pune', kind: 'city', country: 'IN', population: 7.5, income: 1.4, laborCost: 0.9, rentIndex: 0.75, regulation: 0, competition: 0.6, entryCost: 200000, entryDays: 20, distance: 0, growth: 0.07, hqOption: true },
  { id: 'kol', name: 'Kolkata', kind: 'city', country: 'IN', population: 15, income: 1.0, laborCost: 0.75, rentIndex: 0.6, regulation: 0.05, competition: 0.5, entryCost: 200000, entryDays: 25, distance: 0.05, growth: 0.04, hqOption: true },
  { id: 'in_rest', name: 'Rest of India', kind: 'region', country: 'IN', population: 1200, income: 0.55, laborCost: 0.7, rentIndex: 0.5, regulation: 0.05, competition: 0.45, entryCost: 5000000, entryDays: 90, distance: 0.15, growth: 0.08, hqOption: false },
  { id: 'us', name: 'United States', kind: 'country', country: 'US', population: 335, income: 13, laborCost: 6.5, rentIndex: 6, regulation: 0.25, competition: 0.95, entryCost: 25000000, entryDays: 120, distance: 0.55, growth: 0.03, hqOption: true },
  { id: 'gb', name: 'United Kingdom', kind: 'country', country: 'GB', population: 68, income: 9.5, laborCost: 5, rentIndex: 5, regulation: 0.3, competition: 0.85, entryCost: 12000000, entryDays: 100, distance: 0.45, growth: 0.02, hqOption: true },
  { id: 'de', name: 'Germany', kind: 'country', country: 'DE', population: 84, income: 10, laborCost: 5.3, rentIndex: 4, regulation: 0.45, competition: 0.8, entryCost: 15000000, entryDays: 130, distance: 0.6, growth: 0.015, hqOption: true },
  { id: 'fr', name: 'France', kind: 'country', country: 'FR', population: 68, income: 9, laborCost: 5, rentIndex: 4, regulation: 0.45, competition: 0.75, entryCost: 12000000, entryDays: 120, distance: 0.6, growth: 0.015, hqOption: false },
  { id: 'sg', name: 'Singapore', kind: 'country', country: 'SG', population: 6, income: 14, laborCost: 5, rentIndex: 6, regulation: 0.15, competition: 0.75, entryCost: 5000000, entryDays: 60, distance: 0.3, growth: 0.03, hqOption: true },
  { id: 'ae', name: 'United Arab Emirates', kind: 'country', country: 'AE', population: 10, income: 9, laborCost: 3.8, rentIndex: 4, regulation: 0.2, competition: 0.6, entryCost: 5000000, entryDays: 60, distance: 0.3, growth: 0.04, hqOption: true },
  { id: 'jp', name: 'Japan', kind: 'country', country: 'JP', population: 124, income: 7.5, laborCost: 4.5, rentIndex: 4.5, regulation: 0.4, competition: 0.8, entryCost: 18000000, entryDays: 150, distance: 0.8, growth: 0.01, hqOption: false },
  { id: 'br', name: 'Brazil', kind: 'country', country: 'BR', population: 216, income: 2.3, laborCost: 1.7, rentIndex: 1.4, regulation: 0.5, competition: 0.6, entryCost: 9000000, entryDays: 120, distance: 0.65, growth: 0.03, hqOption: false },
  { id: 'id', name: 'Indonesia', kind: 'country', country: 'ID', population: 277, income: 1.1, laborCost: 0.9, rentIndex: 0.8, regulation: 0.35, competition: 0.55, entryCost: 7000000, entryDays: 100, distance: 0.5, growth: 0.05, hqOption: false },
  { id: 'au', name: 'Australia', kind: 'country', country: 'AU', population: 27, income: 11, laborCost: 5.5, rentIndex: 4.5, regulation: 0.25, competition: 0.7, entryCost: 8000000, entryDays: 90, distance: 0.45, growth: 0.025, hqOption: false },
  { id: 'ca', name: 'Canada', kind: 'country', country: 'CA', population: 40, income: 10, laborCost: 5, rentIndex: 4, regulation: 0.25, competition: 0.7, entryCost: 9000000, entryDays: 100, distance: 0.45, growth: 0.02, hqOption: false },
];

export const MARKET_BY_ID: Record<string, MarketDef> = Object.fromEntries(MARKETS.map((m) => [m.id, m]));

export function marketDef(id: string): MarketDef {
  const m = MARKET_BY_ID[id];
  if (!m) throw new Error(`Unknown market ${id}`);
  return m;
}

export function countryOf(marketId: string): CountryDef {
  return COUNTRIES[marketDef(marketId).country];
}
