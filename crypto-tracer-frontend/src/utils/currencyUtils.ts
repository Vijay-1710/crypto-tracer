/**
 * Indian Rupee (INR) Currency Conversion & Valuation Utilities
 * Tailored for Indian Law Enforcement Agencies (LEAs), FIU-IND compliance,
 * Section 91 CrPC / Section 94 BNSS statutory requisitions, and court evidentiary filings.
 */

export const CRYPTO_INR_RATES: Record<string, number> = {
  ETH: 285420, // 1 ETH ≈ ₹2,85,420
  BTC: 5840000, // 1 BTC ≈ ₹58,40,000
  MATIC: 38.5, // 1 MATIC / POL ≈ ₹38.50
  POL: 38.5,
  BSC: 52100, // 1 BNB / BSC ≈ ₹52,100
  BNB: 52100,
  USDT: 86.8, // 1 USDT ≈ ₹86.80
  USDC: 86.8,
};

export const LIVE_TICKER_TEXT = 'ETH/INR: ₹2,85,420 • BTC/INR: ₹58,40,000';

/**
 * Converts a crypto volume to INR using standard Indian numbering system (Lakhs and Crores).
 * Example:
 *   79.8 ETH  -> "₹2.27 Cr"
 *   10.0 ETH  -> "₹28.54 L"
 *   0.2 ETH   -> "₹57,084"
 */
export function formatCryptoToINR(cryptoAmount: number, chain: string = 'ETH'): string {
  if (cryptoAmount === undefined || cryptoAmount === null || isNaN(cryptoAmount)) {
    return '₹0';
  }

  const normalizedChain = (chain || 'ETH').toUpperCase();
  const rate = CRYPTO_INR_RATES[normalizedChain] || CRYPTO_INR_RATES.ETH;
  const inr = cryptoAmount * rate;

  if (inr >= 1e7) {
    // 1 Crore = 1,00,00,000
    const cr = (Math.floor(inr / 1e5) / 100).toFixed(2);
    return `₹${cr} Cr`;
  }
  if (inr >= 1e5) {
    // 1 Lakh = 1,00,000
    const l = (Math.floor(inr / 1e3) / 100).toFixed(2);
    return `₹${l} L`;
  }
  if (inr >= 1) {
    return `₹${Math.round(inr).toLocaleString('en-IN')}`;
  }
  return `₹${inr.toFixed(2)}`;
}

/**
 * Formats a crypto volume with its Indian Rupee equivalent alongside.
 * Example: 79.8 ETH (≈ ₹2.27 Cr)
 */
export function formatCryptoWithINR(cryptoAmount: number, chain: string = 'ETH'): string {
  if (cryptoAmount === undefined || cryptoAmount === null || isNaN(cryptoAmount)) {
    return `0 ${chain} (≈ ₹0)`;
  }
  const inrStr = formatCryptoToINR(cryptoAmount, chain);
  return `${cryptoAmount} ${chain} (≈ ${inrStr})`;
}

/**
 * Returns full quantified loss valuation in Indian Rupees for statutory notices & court filings.
 * Provides exact comma-grouped figures alongside Crores/Lakhs for maximum evidentiary precision.
 */
export function formatFullLossINR(
  cryptoAmount: number,
  chain: string = 'ETH'
): { inrExact: string; inrShort: string; combined: string } {
  const normalizedChain = (chain || 'ETH').toUpperCase();
  const rate = CRYPTO_INR_RATES[normalizedChain] || CRYPTO_INR_RATES.ETH;
  const inr = Math.round((cryptoAmount || 0) * rate);
  const inrExact = `₹${inr.toLocaleString('en-IN')}`;
  const inrShort = formatCryptoToINR(cryptoAmount, chain);

  return {
    inrExact,
    inrShort,
    combined: `${cryptoAmount} ${chain} (${inrExact} / ≈ ${inrShort})`,
  };
}
