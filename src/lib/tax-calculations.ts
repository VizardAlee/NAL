import { roundCurrency } from './financial-integrity';

export type WithholdingTaxPositionInput = {
  grossCorporateTaxDue: number;
  creditsSuffered: number;
  deductedFromPayments: number;
  remitted: number;
};

/**
 * Separates WHT suffered by the company (a potential corporate-tax credit)
 * from WHT deducted by the company (a liability until remitted).
 */
export function calculateWithholdingTaxPosition(input: WithholdingTaxPositionInput) {
  const grossCorporateTaxDue = Math.max(0, roundCurrency(input.grossCorporateTaxDue));
  const creditsSuffered = Math.max(0, roundCurrency(input.creditsSuffered));
  const deductedFromPayments = Math.max(0, roundCurrency(input.deductedFromPayments));
  const remitted = Math.max(0, roundCurrency(input.remitted));

  const creditApplied = Math.min(grossCorporateTaxDue, creditsSuffered);
  const creditCarryforward = Math.max(0, roundCurrency(creditsSuffered - creditApplied));
  const corporateTaxPayable = Math.max(0, roundCurrency(grossCorporateTaxDue - creditApplied));
  const outstanding = Math.max(0, roundCurrency(deductedFromPayments - remitted));
  const remittanceExcess = Math.max(0, roundCurrency(remitted - deductedFromPayments));

  return {
    creditsSuffered,
    creditApplied,
    creditCarryforward,
    corporateTaxPayable,
    deductedFromPayments,
    remitted,
    outstanding,
    remittanceExcess,
  };
}
