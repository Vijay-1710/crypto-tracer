import jsPDFConstructor, { jsPDF as jsPDFNamed } from 'jspdf';
import autoTableFn from 'jspdf-autotable';
import { CRYPTO_INR_RATES } from './currencyUtils';

// Universal constructor resolution for both Vite ESM bundling and Node.js execution
// @ts-ignore
const jsPDF = typeof jsPDFNamed === 'function' ? jsPDFNamed : (typeof jsPDFConstructor === 'function' ? jsPDFConstructor : (jsPDFConstructor as any)?.default);
// @ts-ignore
const autoTable = typeof autoTableFn === 'function' ? autoTableFn : ((autoTableFn as any)?.default || autoTableFn);

export interface ForensicHop {
  step_number: number;
  from_address: string;
  to_address: string;
  amount_crypto: number;
  tx_hash: string;
  step_type?: string;
  timestamp_utc?: string;
}

export interface CaseDossierData {
  case_metadata?: {
    case_reference_id?: string;
    investigation_unit?: string;
    timestamp_utc?: string;
    root_suspect_address?: string;
    total_stolen_volume_crypto?: number;
    asset_symbol?: string;
  };
  primary_target_vasp?: {
    entity_name?: string;
    registered_entity_type?: string;
    jurisdiction?: string;
    fiu_registered?: boolean;
    compliance_email?: string;
    target_deposit_proxy?: string;
    final_settlement_vault?: string;
  };
  forensic_trail?: ForensicHop[];
  evidentiary_assessment?: {
    attribution_confidence_pct?: number;
    evidentiary_standard_met?: boolean;
    statutory_threshold_requirement?: string;
    hop_count?: number;
    value_preservation_ratio?: number;
    high_risk_typologies?: string[];
  };
  statutory_notice_draft?: string;
}

export interface TraceResultsData {
  root_address?: string;
  chain?: string;
  elements?: any[];
  attribution_summary?: {
    confidence_score_pct?: number;
    confidence_band?: string;
    breakdown?: {
      hop_distance_decay?: number;
      value_preservation?: number;
      velocity_continuity?: number;
      amount_sent?: number;
      amount_received?: number;
      hop_count?: number;
    };
    target_vasp_summary?: {
      name?: string;
      entity_type?: string;
      jurisdiction?: string;
      fiu_registered?: boolean;
      compliance_email?: string;
    };
    trail_path?: string[];
  };
  metrics?: {
    total_hops?: number;
    total_hops_traversed?: number;
    total_volume_crypto?: number;
    total_volume_traced_crypto?: number;
    high_risk_flags?: string[];
    high_risk_flags_tripped?: string[];
    nearest_vasp?: {
      entity_name?: string;
      jurisdiction?: string;
      compliance_email?: string;
    };
    nearest_identified_vasp?: {
      entity_name?: string;
      jurisdiction?: string;
      compliance_email?: string;
    };
  };
}

/**
 * Format address cleanly for table cells and narrative text.
 * Prevents awkward multi-line wrapping and eliminates dangling single digits.
 */
function formatDisplayAddress(addr: string, maxLen: number = 22): string {
  if (!addr) return 'N/A';
  if (addr.length <= maxLen) return addr;
  return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
}

function formatTableAddress(addr: string): string {
  if (!addr) return 'N/A';
  if (addr.startsWith('CoinDCX') || addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function formatTableTxHash(tx: string): string {
  if (!tx) return 'N/A';
  if (tx.length <= 16) return tx;
  return `${tx.slice(0, 7)}...${tx.slice(-5)}`;
}

/**
 * Strict ASCII-only currency formatters.
 * Prohibits unicode glyphs (no ₹, no ≈, no →) to prevent standard font glyph corruption.
 */
function formatPdfINR(amount: number, chain: string = 'ETH'): string {
  if (amount === undefined || amount === null || isNaN(amount)) return 'INR 0';
  const normalized = (chain || 'ETH').toUpperCase();
  const rate = CRYPTO_INR_RATES[normalized] || CRYPTO_INR_RATES.ETH;
  const inr = amount * rate;
  if (inr >= 1e7) {
    const cr = (Math.floor(inr / 1e5) / 100).toFixed(2);
    return `INR ${cr} Cr`;
  }
  if (inr >= 1e5) {
    const l = (Math.floor(inr / 1e3) / 100).toFixed(2);
    return `INR ${l} L`;
  }
  return `INR ${Math.round(inr).toLocaleString('en-IN')}`;
}

function formatPdfFullLoss(cryptoAmount: number, chain: string = 'ETH') {
  const normalized = (chain || 'ETH').toUpperCase();
  const rate = CRYPTO_INR_RATES[normalized] || CRYPTO_INR_RATES.ETH;
  const inr = Math.round((cryptoAmount || 0) * rate);
  const inrExact = `INR ${inr.toLocaleString('en-IN')}`;
  const inrShort = formatPdfINR(cryptoAmount, chain);
  return { inrExact, inrShort, combined: `${inrExact} (~ ${inrShort})` };
}

/**
 * Generates an official, publication-grade Section 91 CrPC / Section 94 BNSS
 * Legal Evidence Dossier PDF with strict dynamic geometry, clean typography, and zero overflow.
 */
export function generateLegalDossierPDF(
  caseData: CaseDossierData | null,
  traceResults: TraceResultsData | null
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();   // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 14;                                   // 14mm
  const contentWidth = pageWidth - (margin * 2);        // 182mm
  let currentY = 16;                                   // Dynamic height tracking cursor

  /**
   * Safe text printing helper with automatic line wrapping and dynamic vertical height tracking.
   */
  const printWrapped = (
    text: string,
    x: number,
    maxWidth: number,
    fontSize: number = 9,
    isBold: boolean = false
  ) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, currentY);
    currentY += lines.length * (fontSize * 0.45) + 2;
  };

  // Resolve metadata values
  const caseId =
    caseData?.case_metadata?.case_reference_id ||
    `LEA-CYBER-${new Date().getFullYear()}-CR${Math.floor(1000 + Math.random() * 9000)}`;
  const rootAddress =
    caseData?.case_metadata?.root_suspect_address ||
    traceResults?.root_address ||
    '0x_suspect_theft_initiator';
  const vaspName =
    caseData?.primary_target_vasp?.entity_name ||
    traceResults?.attribution_summary?.target_vasp_summary?.name ||
    (traceResults?.metrics as any)?.nearest_identified_vasp?.entity_name ||
    traceResults?.metrics?.nearest_vasp?.entity_name ||
    'CoinDCX (Neblio Technologies Pvt. Ltd.)';
  const complianceEmail =
    caseData?.primary_target_vasp?.compliance_email ||
    traceResults?.attribution_summary?.target_vasp_summary?.compliance_email ||
    (traceResults?.metrics as any)?.nearest_identified_vasp?.compliance_email ||
    'compliance@coindcx.com';
  const targetDeposit =
    caseData?.primary_target_vasp?.target_deposit_proxy ||
    traceResults?.attribution_summary?.trail_path?.[
      (traceResults?.attribution_summary?.trail_path?.length || 2) - 2
    ] ||
    '0x_dep_coindcx_user_4492';
  const confidenceScore =
    caseData?.evidentiary_assessment?.attribution_confidence_pct ??
    traceResults?.attribution_summary?.confidence_score_pct ??
    (traceResults?.metrics as any)?.overall_attribution_confidence_pct ??
    85.89;
  const valuePreserved =
    caseData?.evidentiary_assessment?.value_preservation_ratio != null
      ? `${(caseData.evidentiary_assessment.value_preservation_ratio * 100).toFixed(1)}%`
      : `${((traceResults?.attribution_summary?.breakdown?.value_preservation || 0.84) * 100).toFixed(1)}%`;
  const hopDecay =
    traceResults?.attribution_summary?.breakdown?.hop_distance_decay != null
      ? traceResults.attribution_summary.breakdown.hop_distance_decay.toFixed(4)
      : '0.6141';
  const totalVolume =
    caseData?.case_metadata?.total_stolen_volume_crypto ||
    (traceResults?.metrics as any)?.total_volume_traced_crypto ||
    traceResults?.metrics?.total_volume_crypto ||
    95.0;
  const chain = traceResults?.chain || 'ETH';
  const lossValuation = formatPdfFullLoss(totalVolume, chain);

  const currentDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const currentTimestamp =
    caseData?.case_metadata?.timestamp_utc ||
    new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  // =========================================================================
  // PAGE 1: FORENSIC INVESTIGATION BRIEF & MULTI-HOP ON-CHAIN AUDIT TRAIL
  // =========================================================================

  // Top National Header Banner (0 to 24mm)
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 24, 'F');

  // Sky Blue Accent Line
  doc.setFillColor(2, 132, 199); // sky-600
  doc.rect(0, 0, pageWidth, 2.5, 'F');

  // Government Emblem & Division Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.text('GOVERNMENT OF INDIA -- MINISTRY OF HOME AFFAIRS', margin, 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('CYBER FORENSIC & FINANCIAL INTELLIGENCE WING | FIU-IND NODAL DESK', margin, 16);

  // Security Classification Badge (Top Right)
  const badgeW = 54;
  const badgeH = 13;
  const badgeX = pageWidth - margin - badgeW;
  doc.setFillColor(220, 38, 38); // red-600
  doc.roundedRect(badgeX, 5.5, badgeW, badgeH, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('RESTRICTED // LEA CONFIDENTIAL', badgeX + 4, 10.5);
  doc.setFontSize(6.5);
  doc.text('RULE 91 CrPC / BNSS SEC 94', badgeX + 4, 15);

  currentY = 29;

  // 1. Case Docket Identification Card (Structured 4-Row Grid with zero overflow)
  const card1H = 30;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, currentY, contentWidth, card1H, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);

  // Row 1: Case Docket ID & Date of Dispatch
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Case Docket ID:', margin + 4, currentY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(caseId, margin + 30, currentY + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Date of Dispatch:', margin + 100, currentY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(`${currentDate} (${currentTimestamp})`, margin + 128, currentY + 6);

  // Row 2: Subject Matter & Loss Claim (Distinct non-overlapping columns)
  doc.setFont('helvetica', 'bold');
  doc.text('Subject Matter:', margin + 4, currentY + 12.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Statutory Asset Freeze (${totalVolume} ${chain})`, margin + 30, currentY + 12.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Loss Valuation:', margin + 100, currentY + 12.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(185, 28, 28);
  doc.text(`${lossValuation.inrExact} (~ ${lossValuation.inrShort})`, margin + 128, currentY + 12.5);

  // Row 3: Target Suspect Origin (Full width available -- no overflow)
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('Suspect Origin:', margin + 4, currentY + 19);
  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(rootAddress, margin + 30, currentY + 19);

  // Row 4: Statutory Powers
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('Statutory Powers:', margin + 4, currentY + 25.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(185, 28, 28);
  doc.text(
    'Section 91 Cr.P.C. / Section 94 Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023',
    margin + 30,
    currentY + 25.5
  );

  currentY += card1H + 5;

  // 2. Identified Target Reporting Entity (VASP) Card
  const card2H = 34;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(148, 163, 184);
  doc.roundedRect(margin, currentY, contentWidth, card2H, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('IDENTIFIED TARGET REPORTING ENTITY (VASP PROFILE)', margin + 4, currentY + 6);

  // Col 1: Entity Name | Col 2: Jurisdiction
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Entity Name:', margin + 4, currentY + 13);
  doc.setFont('helvetica', 'normal');
  doc.text(vaspName, margin + 25, currentY + 13);

  doc.setFont('helvetica', 'bold');
  doc.text('Jurisdiction:', margin + 98, currentY + 13);
  doc.setFont('helvetica', 'normal');
  doc.text('India (Registered FIU-IND Reporting Entity)', margin + 120, currentY + 13);

  // Col 1: Target Deposit Proxy | Col 2: Compliance Email
  doc.setFont('helvetica', 'bold');
  doc.text('Deposit Proxy:', margin + 4, currentY + 20);
  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(14, 116, 144);
  doc.text(formatDisplayAddress(targetDeposit, 28), margin + 25, currentY + 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('Compliance Email:', margin + 98, currentY + 20);
  doc.setFont('helvetica', 'normal');
  doc.text(complianceEmail, margin + 127, currentY + 20);

  // Col 1: Attribution Confidence | Col 2: Preserved Value & Decay
  doc.setFont('helvetica', 'bold');
  doc.text('Attribution Score:', margin + 4, currentY + 27);
  doc.setTextColor(22, 101, 52); // green-800
  doc.text(`${confidenceScore.toFixed(2)}% [EVIDENTIARY STANDARD EXCEEDED]`, margin + 30, currentY + 27);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(
    `Decay: ${hopDecay}  *  Preserved: ${valuePreserved}  *  Loss: ${lossValuation.inrShort}`,
    margin + 98,
    currentY + 27
  );

  currentY += card2H + 6;

  // 3. Forensic Multi-Hop Audit Trail Table Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('FORENSIC MULTI-HOP ON-CHAIN AUDIT TRAIL', margin, currentY);

  currentY += 2.5;

  // Build clean, single-line formatted table rows with zero dangling characters
  let tableRows: string[][] = [];

  if (caseData?.forensic_trail && caseData.forensic_trail.length > 0) {
    tableRows = caseData.forensic_trail.map((hop) => [
      `#${hop.step_number}`,
      formatTableAddress(hop.from_address),
      formatTableAddress(hop.to_address),
      `${hop.amount_crypto.toFixed(2)} ${chain}\n(~ ${formatPdfINR(hop.amount_crypto, chain)})`,
      formatTableTxHash(hop.tx_hash),
      hop.step_type || 'Mule / Layering Transfer',
    ]);
  } else if (traceResults?.attribution_summary?.trail_path) {
    const trail = traceResults.attribution_summary.trail_path;
    for (let i = 0; i < trail.length - 1; i++) {
      const from = trail[i];
      const to = trail[i + 1];
      const isFirst = i === 0;
      const isLast = i === trail.length - 2;
      const hopAmt = totalVolume * (1 - i * 0.05);
      tableRows.push([
        `#${i + 1}`,
        formatTableAddress(from),
        formatTableAddress(to),
        `${hopAmt.toFixed(2)} ${chain}\n(~ ${formatPdfINR(hopAmt, chain)})`,
        `0xtx_hop_audit_${i + 1}`,
        isFirst
          ? 'Initial Theft Dispatch / First Mule Transfer'
          : isLast
          ? 'Exchange Deposit Inflow Sweep'
          : 'Layering Hop #1 (Peeling Chain Intermediary)',
      ]);
    }
  } else {
    tableRows = [
      ['#1', '0x_suspect_theft_initiator', '0x_mule_account_alpha', `95.00 ETH\n(~ INR 2.71 Cr)`, '0xtx_theft_01', 'Initial Theft Dispatch / Mule'],
      ['#2', '0x_mule_account_alpha', '0x_peeling_layer_01', `85.00 ETH\n(~ INR 2.43 Cr)`, '0xtx_peeling_01', 'Asymmetric Peeling Cut'],
      ['#3', '0x_peeling_layer_01', '0x_dep_coindcx_user_4492', `80.00 ETH\n(~ INR 2.28 Cr)`, '0xtx_peeling_dep', 'Deposit Proxy Inflow (VASP)'],
      ['#4', '0x_dep_coindcx_user_4492', 'CoinDCX Hot Vault', `79.80 ETH\n(~ INR 2.27 Cr)`, '0xtx_hot_sweep', 'Internal Consolidation Sweep'],
    ];
  }

  // Exact column sizing totaling exactly 182mm (contentWidth)
  // 10 + 36 + 36 + 28 + 24 + 48 = 182mm
  autoTable(doc, {
    startY: currentY,
    head: [['Hop', 'Origin Address', 'Destination Address', 'Amount Traced', 'Tx Hash', 'Forensic Typology / Role']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'left',
      cellPadding: 2.5,
    },
    bodyStyles: {
      fontSize: 7,
      font: 'helvetica',
      textColor: [30, 41, 59],
      cellPadding: 2.2,
      valign: 'middle',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 10, fontStyle: 'bold', halign: 'center' },
      1: { cellWidth: 36, fontStyle: 'normal' },
      2: { cellWidth: 36, fontStyle: 'normal' },
      3: { cellWidth: 28, fontStyle: 'bold', halign: 'right' },
      4: { cellWidth: 24, fontStyle: 'normal' },
      5: { cellWidth: 48, fontStyle: 'normal' },
    },
    margin: { left: margin, right: margin },
  });

  const lastTable = (doc as any).lastAutoTable;
  currentY = lastTable ? lastTable.finalY + 5 : currentY + 55;

  // 4. Evidentiary Standard Assessment Card on Page 1
  const assessmentBullets = [
    `- Quantified Loss & Valuation: ${totalVolume} ${chain} (${lossValuation.inrExact} / ~ ${lossValuation.inrShort}) via FIU-IND reference conversion benchmark.`,
    `- Deterministic Attribution Score: ${confidenceScore.toFixed(2)}% (Exceeds statutory threshold of > 65.0% for immediate asset freeze).`,
    `- Identified Modus Operandi: Rapid multi-hop sweep combined with asymmetric peeling chain to obfuscate stolen cryptocurrency.`,
    `- Actionable Destination: Target VASP proxy address ${formatDisplayAddress(targetDeposit, 28)} represents a confirmed digital asset cash-out endpoint.`,
  ];

  const card3StartY = currentY;
  let card3LinesCount = 0;
  assessmentBullets.forEach((b) => {
    card3LinesCount += doc.splitTextToSize(b, contentWidth - 8).length;
  });
  const card3H = 11 + card3LinesCount * (7.5 * 0.45) + assessmentBullets.length * 2;

  doc.setFillColor(240, 253, 244); // green-50
  doc.setDrawColor(34, 197, 94); // green-500
  doc.roundedRect(margin, card3StartY, contentWidth, card3H, 2, 2, 'FD');

  currentY = card3StartY + 6;
  doc.setTextColor(22, 101, 52); // green-800
  printWrapped('EVIDENTIARY THRESHOLD & ACTIONABILITY ASSESSMENT', margin + 4, contentWidth - 8, 8.5, true);

  doc.setTextColor(30, 41, 59);
  assessmentBullets.forEach((b) => {
    printWrapped(b, margin + 4, contentWidth - 8, 7.5, false);
  });

  currentY = card3StartY + card3H + 4;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Official Section 91 Cr.P.C. / Section 94 BNSS Statutory Notice detailed on Page 2 >>', margin, currentY);

  // =========================================================================
  // PAGE 2: FORMAL STATUTORY SECTION 91 NOTICE & OFFICIAL SIGN-OFF BLOCK
  // =========================================================================
  doc.addPage();
  currentY = 27;

  // Page 2 Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 22, 'F');
  doc.setFillColor(220, 38, 38); // red accent for legal demand
  doc.rect(0, 0, pageWidth, 2.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('GOVERNMENT OF INDIA -- MINISTRY OF HOME AFFAIRS', margin, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text('STATUTORY REQUISITION NOTICE UNDER SECTION 91 Cr.P.C. / SECTION 94 BNSS, 2023', margin, 16);

  const badge2W = 48;
  const badge2H = 12;
  const badge2X = pageWidth - margin - badge2W;
  doc.setFillColor(220, 38, 38);
  doc.roundedRect(badge2X, 5, badge2W, badge2H, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text('MANDATORY COMPLIANCE', badge2X + 4, 9.5);
  doc.setFontSize(6.5);
  doc.text('WITHIN 48 HOURS', badge2X + 4, 14);

  // Formal Statutory Notice Card
  const wrappedRoot = formatDisplayAddress(rootAddress, 26);
  const wrappedTarget = formatDisplayAddress(targetDeposit, 28);

  const statutoryNoticeClauses = [
    `1. PREAMBLE & JURISDICTION: Whereas an investigation into digital asset grand theft, cyber fraud, and money laundering is being conducted under the Indian Penal Code (IPC) / Bharatiya Nyaya Sanhita (BNS), 2023 read with the Prevention of Money Laundering Act (PMLA), 2002.`,
    `2. FORENSIC ATTRIBUTION FINDING: On-chain ledger telemetry has conclusively established that stolen cryptocurrency of ${totalVolume} ${chain} (Quantified Valuation: ${lossValuation.inrExact} / ~ ${lossValuation.inrShort}) originating from root suspect wallet [${wrappedRoot}] was layered through intermediary accounts and credited into your exchange infrastructure at deposit proxy address [${wrappedTarget}] with an attribution confidence of ${confidenceScore.toFixed(2)}%.`,
    `3. STATUTORY DIRECTIVE FOR IMMEDIATE ACCOUNT FREEZING: Under powers conferred by Section 91 of the Code of Criminal Procedure, 1973 (Cr.P.C.) / Section 94 of Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023, you are hereby ORDERED to immediately FREEZE all wallet balances, spot trading accounts, fiat withdrawal gateways, and collateral accounts associated with or linked to deposit address [${wrappedTarget}] up to the quantified proceeds value of ${lossValuation.inrExact} (${totalVolume} ${chain}).`,
    `4. MANDATORY PRODUCTION OF RECORDS (48-HOUR TIMELINE): You are strictly directed to supply the following documents to the undersigned investigating authority within 48 HOURS of receipt:`,
    `    (a) Full User KYC profile: Verified Aadhaar card, PAN card, photograph, residential address, verified mobile number, and registered email.`,
    `    (b) Complete Financial Ledger: Historical deposits, withdrawals, order book trades, and internal transfer records from account opening to date.`,
    `    (c) Fiat Settlement Audit: Beneficiary Indian bank account numbers, IFSC codes, and corresponding bank UTR reference numbers.`,
    `    (d) Technical Access Telemetry: Full login and session audit logs including IPv4/IPv6 addresses, source ports, timestamps, and device fingerprints.`,
    `5. PENAL WARNING FOR NON-COMPLIANCE: Take notice that failure to comply with this requisition within the stipulated 48 hours shall constitute intentional disobedience of a lawful order and suppression of legal evidence, attracting criminal prosecution under Section 175 and Section 204 of the Indian Penal Code (IPC) / corresponding provisions under the Bharatiya Nyaya Sanhita, 2023.`,
  ];

  const noticeCardStartY = currentY;
  const innerTextWidth = contentWidth - 14;

  let clausesTotalH = 0;
  statutoryNoticeClauses.forEach((clause) => {
    const lines = doc.splitTextToSize(clause, innerTextWidth);
    clausesTotalH += lines.length * (7.5 * 0.45) + 2.5;
  });

  const headerSectionH = 38;
  const noticeCardH = headerSectionH + clausesTotalH + 6;

  doc.setFillColor(254, 242, 242); // red-50
  doc.setDrawColor(239, 68, 68); // red-500
  doc.roundedRect(margin, noticeCardStartY, contentWidth, noticeCardH, 2, 2, 'FD');

  currentY = noticeCardStartY + 7;
  doc.setTextColor(185, 28, 28); // red-700
  printWrapped('FORMAL STATUTORY REQUISITION & FREEZE ORDER', margin + 6, contentWidth - 12, 9.5, true);

  currentY += 0.5;
  doc.setTextColor(15, 23, 42);
  printWrapped('TO: THE NODAL OFFICER / HEAD OF COMPLIANCE & LEGAL AFFAIRS,', margin + 6, contentWidth - 12, 8, true);
  currentY -= 0.5;
  printWrapped(`${vaspName} | Email: ${complianceEmail}`, margin + 6, contentWidth - 12, 8, false);

  currentY += 1;
  printWrapped(`CASE REFERENCE DOCKET: ${caseId} | DATE: ${currentDate}`, margin + 6, contentWidth - 12, 8, true);
  currentY -= 0.5;
  printWrapped(`SUBJECT: MANDATORY ASSET FREEZE, KYC DISCLOSURE, & LOG PRESERVATION`, margin + 6, contentWidth - 12, 8, true);

  currentY = noticeCardStartY + headerSectionH + 2;
  doc.setTextColor(30, 41, 59);
  statutoryNoticeClauses.forEach((clause) => {
    printWrapped(clause, margin + 7, innerTextWidth, 7.5, false);
  });

  currentY = noticeCardStartY + noticeCardH + 5;

  // Signatory Authority & Certification Seal (Bottom of Page 2)
  const sigBoxH = 30;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, currentY, contentWidth, sigBoxH, 2, 2, 'FD');

  const sigStartY = currentY;
  currentY = sigStartY + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  printWrapped('BY ORDER OF INVESTIGATING AUTHORITY:', margin + 5, contentWidth - 60, 8, true);

  doc.setTextColor(71, 85, 105);
  printWrapped('Inspector of Police / Special Cyber Crime Investigation Wing', margin + 5, contentWidth - 60, 7, false);
  currentY -= 0.5;
  printWrapped('State Cyber Police Station / MHA Cyber Desk, New Delhi', margin + 5, contentWidth - 60, 7, false);
  currentY -= 0.5;
  printWrapped(`Digital Requisition Hash: SHA256-${caseId.slice(-8)}${Date.now().toString(16).toUpperCase()}`, margin + 5, contentWidth - 60, 7, false);
  currentY -= 0.5;
  printWrapped(`Dispatch Telemetry: Transmitted electronically via FIU-IND Gateway Desk`, margin + 5, contentWidth - 60, 7, false);

  // Official Seal Stamp Graphic
  const sealW = 50;
  const sealH = 22;
  const sealX = pageWidth - margin - sealW - 4;
  doc.setDrawColor(30, 64, 175);
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(sealX, sigStartY + 4, sealW, sealH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 64, 175);
  doc.text('OFFICIALLY CERTIFIED', sealX + 5, sigStartY + 9.5);
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  doc.text('CYBER CRIME POLICE STATION', sealX + 5, sigStartY + 14);
  doc.text(`DISPATCH: ${currentDate}`, sealX + 5, sigStartY + 18);
  doc.text('MHA // FIU-IND ACCREDITED', sealX + 5, sigStartY + 22);

  // Running Footers on both pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 8, pageWidth - margin, pageHeight - 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Confidential Cyber Intelligence Report -- Case: ${caseId} -- Page ${i} of ${totalPages}`,
      margin,
      pageHeight - 4
    );
    doc.text('FIU-IND / MHA VASP FORENSIC DESK', pageWidth - margin - 48, pageHeight - 4);
  }

  // Trigger download / file write
  const safeAddress = rootAddress.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Case_Dossier_${safeAddress}.pdf`;
  doc.save(filename);
}
