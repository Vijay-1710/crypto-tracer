/**
 * Embedded Mock Forensic Intelligence Dataset for Cryptocurrency Tracking & VASP Attribution.
 * 
 * Provides an enterprise-grade pre-calculated multi-hop laundering trace for '0x_suspect_theft_initiator',
 * guaranteeing zero-fail execution on deployed environments (such as Vercel) where local Python backends
 * are inaccessible or blocked by browser Mixed Content security policies.
 */

export interface MockCytoscapeElement {
  data: {
    id: string;
    label?: string;
    source?: string;
    target?: string;
    amount?: number;
    amount_crypto?: number;
    tx_hash?: string;
    timestamp?: number;
    timestamp_utc?: string;
    nodetype?: 'suspect' | 'unattributed' | 'mixer' | 'vasp_deposit' | 'vasp_hot';
    entity_type?: string;
    risk_tier?: 'Low' | 'Medium' | 'High' | 'Critical';
    hop_distance?: number;
    balance?: number;
    in_primary_path?: boolean;
    is_root?: boolean;
    is_terminal?: boolean;
    is_peeling?: boolean;
    is_sweep?: boolean;
    fiu_registered?: boolean;
    compliance_email?: string | null;
  };
}

export interface ForensicHop {
  step_number: number;
  from_address: string;
  to_address: string;
  amount_crypto: number;
  amount_inr?: number;
  tx_hash: string;
  timestamp: number;
  timestamp_utc: string;
  step_type: string;
  in_primary_path: boolean;
}

export interface MockTraceData {
  status: string;
  root_address: string;
  chain: string;
  elements: MockCytoscapeElement[];
  attribution_summary: {
    confidence_score_pct: number;
    confidence_band: 'High' | 'Moderate' | 'Low' | 'Inconclusive';
    breakdown: {
      hop_distance_decay: number;
      value_preservation: number;
      velocity_continuity: number;
      base_score: number;
      direct_sweep_bonus: number;
      mixer_proximity_penalty: number;
      hop_count: number;
      amount_sent: number;
      amount_received: number;
    };
    target_vasp_summary: {
      name: string;
      entity_type: string;
      jurisdiction: string;
      nodetype: string;
      fiu_registered: boolean;
      compliance_email: string;
    };
    trail_path: string[];
  };
  metrics: {
    total_hops_traversed: number;
    total_volume_traced_crypto: number;
    quantified_loss_inr: number;
    high_risk_flags_tripped: string[];
    nearest_identified_vasp: {
      entity_name: string;
      jurisdiction: string;
      compliance_email: string;
      fiu_registered: boolean;
    };
  };
  forensic_hops: ForensicHop[];
  dossier_data?: {
    case_metadata: {
      case_reference_id: string;
      investigation_unit: string;
      timestamp_utc: string;
      root_suspect_address: string;
      total_stolen_volume_crypto: number;
      asset_symbol: string;
    };
    primary_target_vasp: {
      entity_name: string;
      registered_entity_type: string;
      jurisdiction: string;
      fiu_registered: boolean;
      compliance_email: string;
      target_deposit_proxy: string;
      final_settlement_vault: string;
    };
    forensic_trail: ForensicHop[];
    evidentiary_assessment: {
      attribution_confidence_pct: number;
      evidentiary_standard_met: boolean;
      statutory_threshold_requirement: string;
      hop_count: number;
      value_preservation_ratio: number;
      high_risk_typologies: string[];
    };
    statutory_notice_draft: string;
  };
}

export const MOCK_TRACE_DATA: MockTraceData = {
  status: 'success',
  root_address: '0x_suspect_theft_initiator',
  chain: 'ETH',
  elements: [
    // -------------------------------------------------------------------------
    // Nodes (Suspect, Layering Mules, Sanctioned Mixer, Deposit Proxy, Hot Vault)
    // -------------------------------------------------------------------------
    {
      data: {
        id: '0x_suspect_theft_initiator',
        label: 'Suspect Theft Initiator',
        entity_type: 'Suspect Origin Wallet',
        nodetype: 'suspect',
        risk_tier: 'Critical',
        hop_distance: 0,
        balance: 0.0,
        in_primary_path: true,
        is_root: true,
        is_terminal: false,
        fiu_registered: false,
        compliance_email: null,
      },
    },
    {
      data: {
        id: '0x_mule_account_alpha',
        label: 'Mule Account Alpha',
        entity_type: 'Layering Intermediate Mule',
        nodetype: 'unattributed',
        risk_tier: 'High',
        hop_distance: 1,
        balance: 0.0,
        in_primary_path: true,
        is_root: false,
        is_terminal: false,
        fiu_registered: false,
        compliance_email: null,
      },
    },
    {
      data: {
        id: '0x_tornado_cash_vault',
        label: 'Tornado Cash 100 ETH Vault (OFAC Sanctioned)',
        entity_type: 'Cryptocurrency Mixer',
        nodetype: 'mixer',
        risk_tier: 'Critical',
        hop_distance: 1,
        balance: 25.0,
        in_primary_path: false,
        is_root: false,
        is_terminal: true,
        fiu_registered: false,
        compliance_email: 'none/sanctioned',
      },
    },
    {
      data: {
        id: '0x_peeling_layer_01',
        label: 'Peeling Layer 01',
        entity_type: 'Layering Mule (Peeling Chain)',
        nodetype: 'unattributed',
        risk_tier: 'High',
        hop_distance: 2,
        balance: 0.0,
        in_primary_path: true,
        is_root: false,
        is_terminal: false,
        fiu_registered: false,
        compliance_email: null,
      },
    },
    {
      data: {
        id: '0x_peeled_fee_sink_alpha',
        label: 'Peeled Fee Sink',
        entity_type: 'Fee Liquidation Sink',
        nodetype: 'unattributed',
        risk_tier: 'Medium',
        hop_distance: 2,
        balance: 10.0,
        in_primary_path: false,
        is_root: false,
        is_terminal: false,
        fiu_registered: false,
        compliance_email: null,
      },
    },
    {
      data: {
        id: '0x_mule_loop_cycler',
        label: 'Cyclic Mule Account',
        entity_type: 'Obfuscation Loop Cycler',
        nodetype: 'unattributed',
        risk_tier: 'Medium',
        hop_distance: 2,
        balance: 0.05,
        in_primary_path: false,
        is_root: false,
        is_terminal: false,
        fiu_registered: false,
        compliance_email: null,
      },
    },
    {
      data: {
        id: '0x_dep_coindcx_user_4492',
        label: 'CoinDCX Dynamic Deposit Proxy (user_4492)',
        entity_type: 'Centralized Exchange Deposit Proxy',
        nodetype: 'vasp_deposit',
        risk_tier: 'Low',
        hop_distance: 3,
        balance: 0.2,
        in_primary_path: true,
        is_root: false,
        is_terminal: false,
        fiu_registered: true,
        compliance_email: 'compliance@coindcx.com',
      },
    },
    {
      data: {
        id: '0x_peeled_gas_sink_layer01',
        label: 'Gas Relayer Sink',
        entity_type: 'Fee Liquidation Sink',
        nodetype: 'unattributed',
        risk_tier: 'Low',
        hop_distance: 3,
        balance: 5.0,
        in_primary_path: false,
        is_root: false,
        is_terminal: false,
        fiu_registered: false,
        compliance_email: null,
      },
    },
    {
      data: {
        id: 'CoinDCX Main Inflow Vault',
        label: 'CoinDCX Main Inflow Vault',
        entity_type: 'Centralized Exchange Hot Vault',
        nodetype: 'vasp_hot',
        risk_tier: 'Low',
        hop_distance: 4,
        balance: 79.8,
        in_primary_path: true,
        is_root: false,
        is_terminal: true,
        fiu_registered: true,
        compliance_email: 'compliance@coindcx.com',
      },
    },

    // -------------------------------------------------------------------------
    // Directed Transfer Edges (Amounts, Hashes, Timestamps, Typology Flags)
    // -------------------------------------------------------------------------
    {
      data: {
        id: '0x_suspect_theft_initiator->0x_mule_account_alpha',
        source: '0x_suspect_theft_initiator',
        target: '0x_mule_account_alpha',
        amount: 95.0,
        amount_crypto: 95.0,
        tx_hash: '0xtx_theft_to_mule_alpha_01',
        timestamp: 1711929600,
        timestamp_utc: '2024-04-01 00:00:00 UTC',
        is_peeling: false,
        is_sweep: false,
        in_primary_path: true,
      },
    },
    {
      data: {
        id: '0x_suspect_theft_initiator->0x_tornado_cash_vault',
        source: '0x_suspect_theft_initiator',
        target: '0x_tornado_cash_vault',
        amount: 25.0,
        amount_crypto: 25.0,
        tx_hash: '0xtx_theft_to_tornado_obfuscation',
        timestamp: 1711929700,
        timestamp_utc: '2024-04-01 00:01:40 UTC',
        is_peeling: false,
        is_sweep: false,
        in_primary_path: false,
      },
    },
    {
      data: {
        id: '0x_mule_account_alpha->0x_peeling_layer_01',
        source: '0x_mule_account_alpha',
        target: '0x_peeling_layer_01',
        amount: 85.0,
        amount_crypto: 85.0,
        tx_hash: '0xtx_mule_alpha_to_peeling_layer',
        timestamp: 1711930800,
        timestamp_utc: '2024-04-01 00:20:00 UTC',
        is_peeling: true,
        is_sweep: false,
        in_primary_path: true,
      },
    },
    {
      data: {
        id: '0x_mule_account_alpha->0x_peeled_fee_sink_alpha',
        source: '0x_mule_account_alpha',
        target: '0x_peeled_fee_sink_alpha',
        amount: 10.0,
        amount_crypto: 10.0,
        tx_hash: '0xtx_mule_alpha_peeled_cut',
        timestamp: 1711931000,
        timestamp_utc: '2024-04-01 00:23:20 UTC',
        is_peeling: true,
        is_sweep: false,
        in_primary_path: false,
      },
    },
    {
      data: {
        id: '0x_mule_account_alpha->0x_mule_loop_cycler',
        source: '0x_mule_account_alpha',
        target: '0x_mule_loop_cycler',
        amount: 1.0,
        amount_crypto: 1.0,
        tx_hash: '0xtx_mule_alpha_to_cycler',
        timestamp: 1711931100,
        timestamp_utc: '2024-04-01 00:25:00 UTC',
        is_peeling: false,
        is_sweep: false,
        in_primary_path: false,
      },
    },
    {
      data: {
        id: '0x_mule_loop_cycler->0x_mule_account_alpha',
        source: '0x_mule_loop_cycler',
        target: '0x_mule_account_alpha',
        amount: 0.95,
        amount_crypto: 0.95,
        tx_hash: '0xtx_cycler_back_to_mule_alpha',
        timestamp: 1711931200,
        timestamp_utc: '2024-04-01 00:26:40 UTC',
        is_peeling: false,
        is_sweep: false,
        in_primary_path: false,
      },
    },
    {
      data: {
        id: '0x_peeling_layer_01->0x_dep_coindcx_user_4492',
        source: '0x_peeling_layer_01',
        target: '0x_dep_coindcx_user_4492',
        amount: 80.0,
        amount_crypto: 80.0,
        tx_hash: '0xtx_peeling_to_coindcx_dep',
        timestamp: 1711936800,
        timestamp_utc: '2024-04-01 02:00:00 UTC',
        is_peeling: false,
        is_sweep: false,
        in_primary_path: true,
      },
    },
    {
      data: {
        id: '0x_peeling_layer_01->0x_peeled_gas_sink_layer01',
        source: '0x_peeling_layer_01',
        target: '0x_peeled_gas_sink_layer01',
        amount: 5.0,
        amount_crypto: 5.0,
        tx_hash: '0xtx_peeling_gas_sink',
        timestamp: 1711937000,
        timestamp_utc: '2024-04-01 02:03:20 UTC',
        is_peeling: true,
        is_sweep: false,
        in_primary_path: false,
      },
    },
    {
      data: {
        id: '0x_dep_coindcx_user_4492->CoinDCX Main Inflow Vault',
        source: '0x_dep_coindcx_user_4492',
        target: 'CoinDCX Main Inflow Vault',
        amount: 79.8,
        amount_crypto: 79.8,
        tx_hash: '0xtx_coindcx_internal_sweep_hot',
        timestamp: 1711940400,
        timestamp_utc: '2024-04-01 03:00:00 UTC',
        is_peeling: false,
        is_sweep: true,
        in_primary_path: true,
      },
    },
  ],

  // ---------------------------------------------------------------------------
  // Attribution Summary (Mathematical scoring breakdown & target VASP profile)
  // ---------------------------------------------------------------------------
  attribution_summary: {
    confidence_score_pct: 85.89,
    confidence_band: 'High',
    breakdown: {
      hop_distance_decay: 0.6141,
      value_preservation: 0.84,
      velocity_continuity: 1.0,
      base_score: 0.8089,
      direct_sweep_bonus: 0.1,
      mixer_proximity_penalty: 0.05,
      hop_count: 4,
      amount_sent: 95.0,
      amount_received: 79.8,
    },
    target_vasp_summary: {
      name: 'CoinDCX Main Inflow Vault',
      entity_type: 'Centralized Exchange',
      jurisdiction: 'India (FIU-IND Registered)',
      nodetype: 'vasp_hot',
      fiu_registered: true,
      compliance_email: 'compliance@coindcx.com',
    },
    trail_path: [
      '0x_suspect_theft_initiator',
      '0x_mule_account_alpha',
      '0x_peeling_layer_01',
      '0x_dep_coindcx_user_4492',
      'CoinDCX Main Inflow Vault',
    ],
  },

  // ---------------------------------------------------------------------------
  // Metrics & Investigation Telemetry
  // ---------------------------------------------------------------------------
  metrics: {
    total_hops_traversed: 4,
    total_volume_traced_crypto: 95.88,
    quantified_loss_inr: 27325800, // ≈ ₹2.73 Cr at standard reference rate (₹2,85,000/ETH)
    high_risk_flags_tripped: [
      'Sanctioned Mixer Interaction (OFAC SDN List / Tornado Cash)',
      'Asymmetric Peeling Chain Detected (> 80/20 Layering)',
      'Rapid Exchange Consolidation Sweep (> 95% Inflow Consolidation)',
    ],
    nearest_identified_vasp: {
      entity_name: 'CoinDCX (Neblio Technologies Pvt. Ltd.)',
      jurisdiction: 'India (FIU-IND Registered)',
      compliance_email: 'compliance@coindcx.com',
      fiu_registered: true,
    },
  },

  // ---------------------------------------------------------------------------
  // Forensic Hops (Ordered multi-hop transaction audit trail for table reports)
  // ---------------------------------------------------------------------------
  forensic_hops: [
    {
      step_number: 1,
      from_address: '0x_suspect_theft_initiator',
      to_address: '0x_mule_account_alpha',
      amount_crypto: 95.0,
      amount_inr: 27075000,
      tx_hash: '0xtx_theft_to_mule_alpha_01',
      timestamp: 1711929600,
      timestamp_utc: '2024-04-01 00:00:00 UTC',
      step_type: 'Initial Theft Outflow',
      in_primary_path: true,
    },
    {
      step_number: 2,
      from_address: '0x_mule_account_alpha',
      to_address: '0x_peeling_layer_01',
      amount_crypto: 85.0,
      amount_inr: 24225000,
      tx_hash: '0xtx_mule_alpha_to_peeling_layer',
      timestamp: 1711930800,
      timestamp_utc: '2024-04-01 00:20:00 UTC',
      step_type: 'Asymmetric Peeling Chain (85/10/1 Split)',
      in_primary_path: true,
    },
    {
      step_number: 3,
      from_address: '0x_peeling_layer_01',
      to_address: '0x_dep_coindcx_user_4492',
      amount_crypto: 80.0,
      amount_inr: 22800000,
      tx_hash: '0xtx_peeling_to_coindcx_dep',
      timestamp: 1711936800,
      timestamp_utc: '2024-04-01 02:00:00 UTC',
      step_type: 'Exchange Deposit Inflow',
      in_primary_path: true,
    },
    {
      step_number: 4,
      from_address: '0x_dep_coindcx_user_4492',
      to_address: 'CoinDCX Main Inflow Vault',
      amount_crypto: 79.8,
      amount_inr: 22743000,
      tx_hash: '0xtx_coindcx_internal_sweep_hot',
      timestamp: 1711940400,
      timestamp_utc: '2024-04-01 03:00:00 UTC',
      step_type: 'Rapid Exchange Consolidation Sweep (99.75% swept)',
      in_primary_path: true,
    },
  ],

  // ---------------------------------------------------------------------------
  // Companion Case Dossier Data (Pre-drafted Section 91 CrPC notice for PDF)
  // ---------------------------------------------------------------------------
  dossier_data: {
    case_metadata: {
      case_reference_id: 'LEA-CYBER-2026-CR5975',
      investigation_unit: 'Cyber Crime Investigation Division / FIU-IND Nodal Cell',
      timestamp_utc: '2026-10-05 04:00:00 UTC',
      root_suspect_address: '0x_suspect_theft_initiator',
      total_stolen_volume_crypto: 95.88,
      asset_symbol: 'ETH',
    },
    primary_target_vasp: {
      entity_name: 'CoinDCX (Neblio Technologies Pvt. Ltd.)',
      registered_entity_type: 'Centralized Exchange (FIU-IND Registered)',
      jurisdiction: 'Republic of India',
      fiu_registered: true,
      compliance_email: 'compliance@coindcx.com',
      target_deposit_proxy: '0x_dep_coindcx_user_4492',
      final_settlement_vault: 'CoinDCX Main Inflow Vault',
    },
    forensic_trail: [
      {
        step_number: 1,
        from_address: '0x_suspect_theft_initiator',
        to_address: '0x_mule_account_alpha',
        amount_crypto: 95.0,
        tx_hash: '0xtx_theft_to_mule_alpha_01',
        step_type: 'Theft Layering Hop 1',
        timestamp_utc: '2024-04-01 00:00:00 UTC',
        timestamp: 1711929600,
        in_primary_path: true,
      },
      {
        step_number: 2,
        from_address: '0x_mule_account_alpha',
        to_address: '0x_peeling_layer_01',
        amount_crypto: 85.0,
        tx_hash: '0xtx_mule_alpha_to_peeling_layer',
        step_type: 'Asymmetric Peeling Hop 2',
        timestamp_utc: '2024-04-01 00:20:00 UTC',
        timestamp: 1711930800,
        in_primary_path: true,
      },
      {
        step_number: 3,
        from_address: '0x_peeling_layer_01',
        to_address: '0x_dep_coindcx_user_4492',
        amount_crypto: 80.0,
        tx_hash: '0xtx_peeling_to_coindcx_dep',
        step_type: 'Deposit Inflow Hop 3',
        timestamp_utc: '2024-04-01 02:00:00 UTC',
        timestamp: 1711936800,
        in_primary_path: true,
      },
      {
        step_number: 4,
        from_address: '0x_dep_coindcx_user_4492',
        to_address: 'CoinDCX Main Inflow Vault',
        amount_crypto: 79.8,
        tx_hash: '0xtx_coindcx_internal_sweep_hot',
        step_type: 'Internal Sweep Hop 4 (Terminal VASP Vault)',
        timestamp_utc: '2024-04-01 03:00:00 UTC',
        timestamp: 1711940400,
        in_primary_path: true,
      },
    ],
    evidentiary_assessment: {
      attribution_confidence_pct: 85.89,
      evidentiary_standard_met: true,
      statutory_threshold_requirement: 'Meets Prima Facie Statutory Threshold for Immediate Asset Freeze under Sec 91 Cr.P.C. / Sec 94 BNSS',
      hop_count: 4,
      value_preservation_ratio: 0.84,
      high_risk_typologies: [
        'Sanctioned Mixer Interaction (OFAC SDN List / Tornado Cash)',
        'Asymmetric Peeling Chain Layering (> 80/20 Distribution)',
        'Rapid Exchange Consolidation Sweep (> 95% Deposit Liquidation)',
      ],
    },
    statutory_notice_draft: `FORMAL NOTICE UNDER SECTION 91 OF THE CODE OF CRIMINAL PROCEDURE, 1973
READ WITH SECTION 94 OF THE BHARATIYA NAGARIK SURAKSHA SANHITA, 2023 (BNSS)

TO:
The Nodal Officer / Head of Compliance
Neblio Technologies Pvt. Ltd. (Operating as CoinDCX)
Email: compliance@coindcx.com
Jurisdiction: FIU-IND Registered VASP (Reporting Entity under PMLA, 2002)

SUBJECT: STATUTORY DIRECTIVE FOR URGENT FREEZING OF PROCEEDS OF CRIME AND PRODUCTION OF KYC/LOGIN AUDIT LOGS

WHEREAS, an investigation into multi-hop unauthorized cyber diversion of digital assets is being actively pursued by this Law Enforcement Agency;

AND WHEREAS, deterministic forensic blockchain graph reconstruction confirms that stolen cryptocurrency originating from Suspect Origin Address 0x_suspect_theft_initiator was layered across 4 intermediate hops and credited into your exchange deposit proxy (0x_dep_coindcx_user_4492) before internal consolidation into your Main Inflow Vault;

NOW THEREFORE, in exercise of powers conferred under Section 91 Cr.P.C. and Section 94 BNSS, you are hereby ORDERED TO:
1. IMMEDIATELY FREEZE and debit-restrict the recipient user account(s) associated with deposit proxy address 0x_dep_coindcx_user_4492.
2. PRESERVE AND FURNISH complete Customer Due Diligence (CDD/KYC) records, including PAN/Aadhaar/Passport, linked bank accounts, mobile number, and email.
3. PROVIDE COMPLETE TRANSACTION AND ACCESS LOGS including IP addresses with timestamp UTC and device identifiers for the 180-day window preceding this notice.

Failure to comply within 48 hours shall attract penal consequences under Section 175 of the Indian Penal Code (IPC) / Section 210 of Bharatiya Nyaya Sanhita, 2023 (BNS) and Section 13 of the Prevention of Money Laundering Act, 2002.`,
  },
};

/**
 * Pre-configured fallback map supporting multiple demo scenario addresses.
 */
export const MOCK_TRACE_FALLBACK: Record<string, MockTraceData> = {
  '0x_suspect_theft_initiator': MOCK_TRACE_DATA,
};

/**
 * Direct reference to the bundled mock trace JSON data for offline / fallback rendering.
 */
export const FALLBACK_MOCK_DATA: MockTraceData = MOCK_TRACE_DATA;

export default MOCK_TRACE_DATA;
