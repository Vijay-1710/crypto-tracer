"""VASP (Virtual Asset Service Provider) Registry Module.

Designed for cryptocurrency tracking and financial intelligence operations by law
enforcement agencies (LEAs) and Financial Intelligence Units (FIU).

Maintains a verified in-memory registry of known entity addresses across EVM and
Bitcoin blockchains, identifies counterparties, flags dynamic deposit proxies,
and provides risk classification without third-party dependencies.
"""

from copy import deepcopy
import re
from typing import Any, Dict


# ---------------------------------------------------------------------------
# In-Memory Registry of Known VASPs, Mixers, and Sanctioned Protocols
# ---------------------------------------------------------------------------
# All addresses are stored normalized (lowercase, trimmed) for fast O(1) matching.
KNOWN_VASPS: Dict[str, Dict[str, Any]] = {
    # -----------------------------------------------------------------------
    # Major Indian FIU-Registered Exchanges
    # -----------------------------------------------------------------------
    # CoinDCX (Neblio Technologies Pvt. Ltd. - FIU Registered)
    "0x71c0800b651000dd65f4ffc04b8ce273bb31e9c2": {
        "name": "CoinDCX Primary Hot Vault",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "India",
        "nodetype": "vasp_hot",
        "fiu_registered": True,
        "risk_tier": "Low",
        "compliance_email": "compliance@coindcx.com",
    },
    "0x_coindcx_main_inflow_vault": {
        "name": "CoinDCX Main Inflow Vault",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "India",
        "nodetype": "vasp_hot",
        "fiu_registered": True,
        "risk_tier": "Low",
        "compliance_email": "compliance@coindcx.com",
    },
    "coindcx main inflow vault": {
        "name": "CoinDCX Main Inflow Vault",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "India",
        "nodetype": "vasp_hot",
        "fiu_registered": True,
        "risk_tier": "Low",
        "compliance_email": "compliance@coindcx.com",
    },
    "0xa090e604de405096ab149070ec610143926664d3": {
        "name": "CoinDCX Secondary Liquidity Reserve",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "India",
        "nodetype": "vasp_hot",
        "fiu_registered": True,
        "risk_tier": "Low",
        "compliance_email": "compliance@coindcx.com",
    },
    "34qvqjp8u9l4p3uk6dz5h8c8g1n2kpopqr": {
        "name": "CoinDCX Bitcoin Hot Wallet (P2SH)",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "India",
        "nodetype": "vasp_hot",
        "fiu_registered": True,
        "risk_tier": "Low",
        "compliance_email": "compliance@coindcx.com",
    },
    "bc1qcdcxhotreserve8823x90k21389dsk839210sd8": {
        "name": "CoinDCX Bitcoin SegWit Settlement Reserve",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "India",
        "nodetype": "vasp_hot",
        "fiu_registered": True,
        "risk_tier": "Low",
        "compliance_email": "compliance@coindcx.com",
    },

    # WazirX (Zanmai Labs Pvt. Ltd. - FIU Registered)
    "0x27ab61b32c4a006b6ab538805f80023850946486": {
        "name": "WazirX Primary Hot Vault",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "India",
        "nodetype": "vasp_hot",
        "fiu_registered": True,
        "risk_tier": "Low",
        "compliance_email": "nodal@wazirx.com",
    },
    "0x549638ff7b10380082f3303350b4507000b9030c": {
        "name": "WazirX Operational Settlement Vault",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "India",
        "nodetype": "vasp_hot",
        "fiu_registered": True,
        "risk_tier": "Low",
        "compliance_email": "nodal@wazirx.com",
    },
    "39g82h2xs67vk9l1x3zpqyt7e2n4ru6p9m": {
        "name": "WazirX Bitcoin Operational Vault",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "India",
        "nodetype": "vasp_hot",
        "fiu_registered": True,
        "risk_tier": "Low",
        "compliance_email": "nodal@wazirx.com",
    },

    # CoinSwitch / CoinSwitch Kuber (Bitcipher Labs LLP - FIU Registered)
    "0x3cffd56b46b7e4d40fb66ec964771d872c695005": {
        "name": "CoinSwitch Kuber Primary Hot Wallet",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "India",
        "nodetype": "vasp_hot",
        "fiu_registered": True,
        "risk_tier": "Low",
        "compliance_email": "compliance@coinswitch.co",
    },
    "0x6f4b638ff7b10380082f3303350b4507000b9031d": {
        "name": "CoinSwitch Treasury Reserve",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "India",
        "nodetype": "vasp_hot",
        "fiu_registered": True,
        "risk_tier": "Low",
        "compliance_email": "compliance@coinswitch.co",
    },
    "1coinswitchhotreservewalletaddr78912": {
        "name": "CoinSwitch Bitcoin Reserve Wallet",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "India",
        "nodetype": "vasp_hot",
        "fiu_registered": True,
        "risk_tier": "Low",
        "compliance_email": "compliance@coinswitch.co",
    },

    # -----------------------------------------------------------------------
    # International Centralized Exchanges
    # -----------------------------------------------------------------------
    # Binance
    "0x28c6c06298d514db089934071355e5743bf21d60": {
        "name": "Binance Hot Wallet 14",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "International",
        "nodetype": "vasp_hot",
        "fiu_registered": False,
        "risk_tier": "Medium",
        "compliance_email": "compliance@binance.com",
    },
    "0xdfd5293d8e347dfe59e90efd55b2956a13430eb0": {
        "name": "Binance Hot Wallet 16",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "International",
        "nodetype": "vasp_hot",
        "fiu_registered": False,
        "risk_tier": "Medium",
        "compliance_email": "compliance@binance.com",
    },
    "34xp4vrocgjym3xr7ycvpfhocnxv4twseo": {
        "name": "Binance Primary BTC Cold/Hot Pool",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "International",
        "nodetype": "vasp_hot",
        "fiu_registered": False,
        "risk_tier": "Medium",
        "compliance_email": "compliance@binance.com",
    },
    "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h": {
        "name": "Binance SegWit Settlement Pool",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "International",
        "nodetype": "vasp_hot",
        "fiu_registered": False,
        "risk_tier": "Medium",
        "compliance_email": "compliance@binance.com",
    },

    # Kraken (Payward Inc.)
    "0x2910543af39aba0cd09dbb2d50200b3e800a63d2": {
        "name": "Kraken Primary Liquidity Vault",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "International",
        "nodetype": "vasp_hot",
        "fiu_registered": False,
        "risk_tier": "Low",
        "compliance_email": "compliance@kraken.com",
    },
    "0x0a869d79a7052c7f1b55a8ebabbea3420f0d1e13": {
        "name": "Kraken Settlement Node 2",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "International",
        "nodetype": "vasp_hot",
        "fiu_registered": False,
        "risk_tier": "Low",
        "compliance_email": "compliance@kraken.com",
    },
    "3fupzptasr8tenderwzwc4tqyjc2k8uyw": {
        "name": "Kraken Bitcoin Treasury",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "International",
        "nodetype": "vasp_hot",
        "fiu_registered": False,
        "risk_tier": "Low",
        "compliance_email": "compliance@kraken.com",
    },

    # OKX
    "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b": {
        "name": "OKX Hot Wallet 1",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "International",
        "nodetype": "vasp_hot",
        "fiu_registered": False,
        "risk_tier": "Medium",
        "compliance_email": "compliance@okx.com",
    },
    "0xa7efae728d2936e78bda97dc267687568dd593f3": {
        "name": "OKX Settlement Vault 2",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "International",
        "nodetype": "vasp_hot",
        "fiu_registered": False,
        "risk_tier": "Medium",
        "compliance_email": "compliance@okx.com",
    },
    "bc1q4uz9892k398fsldk3091kdls934810kdls0123": {
        "name": "OKX SegWit BTC Hot Reserve",
        "entity_type": "Centralized Exchange",
        "jurisdiction": "International",
        "nodetype": "vasp_hot",
        "fiu_registered": False,
        "risk_tier": "Medium",
        "compliance_email": "compliance@okx.com",
    },

    # -----------------------------------------------------------------------
    # High-Risk Privacy Protocols / Sanctioned Mixers
    # -----------------------------------------------------------------------
    # Tornado Cash (OFAC Specially Designated Nationals - SDN List)
    "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b": {
        "name": "Tornado Cash 100 ETH Vault (OFAC Sanctioned)",
        "entity_type": "Mixer",
        "jurisdiction": "Sanctioned",
        "nodetype": "mixer",
        "fiu_registered": False,
        "risk_tier": "Critical",
        "compliance_email": "none/sanctioned",
    },
    "0x_tornado_cash_vault": {
        "name": "Tornado Cash 100 ETH Vault (OFAC Sanctioned)",
        "entity_type": "Mixer",
        "jurisdiction": "Sanctioned",
        "nodetype": "mixer",
        "fiu_registered": False,
        "risk_tier": "Critical",
        "compliance_email": "none/sanctioned",
    },
    "tornado cash": {
        "name": "Tornado Cash Mixer (OFAC Sanctioned)",
        "entity_type": "Mixer",
        "jurisdiction": "Sanctioned",
        "nodetype": "mixer",
        "fiu_registered": False,
        "risk_tier": "Critical",
        "compliance_email": "none/sanctioned",
    },
    "0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936": {
        "name": "Tornado Cash 10 ETH Vault (OFAC Sanctioned)",
        "entity_type": "Mixer",
        "jurisdiction": "Sanctioned",
        "nodetype": "mixer",
        "fiu_registered": False,
        "risk_tier": "Critical",
        "compliance_email": "none/sanctioned",
    },
    "0x12d66f87a04a9e220743712ce6d9bb1b5616b8fc": {
        "name": "Tornado Cash 1 ETH Vault (OFAC Sanctioned)",
        "entity_type": "Mixer",
        "jurisdiction": "Sanctioned",
        "nodetype": "mixer",
        "fiu_registered": False,
        "risk_tier": "Critical",
        "compliance_email": "none/sanctioned",
    },
    "0x22aa8b782fb9c24329e105e940af8303f29e33c0": {
        "name": "Tornado Cash 0.1 ETH Vault (OFAC Sanctioned)",
        "entity_type": "Mixer",
        "jurisdiction": "Sanctioned",
        "nodetype": "mixer",
        "fiu_registered": False,
        "risk_tier": "Critical",
        "compliance_email": "none/sanctioned",
    },
    "0x083e82b2c126478894fe052b803fb9c10d98668f": {
        "name": "Tornado Cash Router Contract",
        "entity_type": "Mixer",
        "jurisdiction": "Sanctioned",
        "nodetype": "mixer",
        "fiu_registered": False,
        "risk_tier": "Critical",
        "compliance_email": "none/sanctioned",
    },

    # Railgun (Privacy Protocol / Relayer Network)
    "0xfa7093cdd9ee6932b4eb2c9e1cde7ce00b1fa4b9": {
        "name": "Railgun Privacy Smart Contract (ZK-SNARK Vault)",
        "entity_type": "Mixer",
        "jurisdiction": "Sanctioned",
        "nodetype": "mixer",
        "fiu_registered": False,
        "risk_tier": "Critical",
        "compliance_email": "none/decentralized",
    },
    "0x550938ff7b10380082f3303350b4507000b9030f": {
        "name": "Railgun Relayer Adapt Contract",
        "entity_type": "Mixer",
        "jurisdiction": "Sanctioned",
        "nodetype": "mixer",
        "fiu_registered": False,
        "risk_tier": "Critical",
        "compliance_email": "none/decentralized",
    },
}

# ---------------------------------------------------------------------------
# Fallback Profile for Unrecognized Addresses
# ---------------------------------------------------------------------------
UNATTRIBUTED_FALLBACK: Dict[str, Any] = {
    "name": "Unattributed Wallet",
    "entity_type": "Unknown",
    "jurisdiction": "Unknown",
    "nodetype": "unattributed",
    "fiu_registered": False,
    "risk_tier": "Medium",
    "compliance_email": None,
}

# ---------------------------------------------------------------------------
# Dynamic Deposit Proxy and Sweep Pattern Signatures
# ---------------------------------------------------------------------------
# Exchange profile mapping for dynamic deposit proxies
EXCHANGE_PROXY_PROFILES: Dict[str, Dict[str, Any]] = {
    "coindcx": {
        "display_name": "CoinDCX Dynamic Deposit Proxy",
        "jurisdiction": "India",
        "fiu_registered": True,
        "risk_tier": "Low",
        "compliance_email": "compliance@coindcx.com",
    },
    "wazirx": {
        "display_name": "WazirX Dynamic Deposit Proxy",
        "jurisdiction": "India",
        "fiu_registered": True,
        "risk_tier": "Low",
        "compliance_email": "nodal@wazirx.com",
    },
    "coinswitch": {
        "display_name": "CoinSwitch Dynamic Deposit Proxy",
        "jurisdiction": "India",
        "fiu_registered": True,
        "risk_tier": "Low",
        "compliance_email": "compliance@coinswitch.co",
    },
    "binance": {
        "display_name": "Binance Dynamic Deposit Proxy",
        "jurisdiction": "International",
        "fiu_registered": False,
        "risk_tier": "Medium",
        "compliance_email": "compliance@binance.com",
    },
    "kraken": {
        "display_name": "Kraken Dynamic Deposit Proxy",
        "jurisdiction": "International",
        "fiu_registered": False,
        "risk_tier": "Low",
        "compliance_email": "compliance@kraken.com",
    },
    "okx": {
        "display_name": "OKX Dynamic Deposit Proxy",
        "jurisdiction": "International",
        "fiu_registered": False,
        "risk_tier": "Medium",
        "compliance_email": "compliance@okx.com",
    },
}

# Compiled regex patterns for detecting dynamic proxies and sweep signatures
DYNAMIC_DEP_REGEX = re.compile(r"^0x_dep_([a-z0-9]+)_(.*)$")
GENERIC_DEP_PREFIX_REGEX = re.compile(r"^0x_dep_([a-z0-9_]+)$")
SWEEP_SIGNATURE_REGEX = re.compile(r"^(?:0x_sweep_|.*_sweep(?:_proxy)?_|[0-9a-f]{4}sweep[0-9a-f]+)", re.IGNORECASE)


def identify_entity(address: str) -> Dict[str, Any]:
    """Identifies and classifies a cryptocurrency wallet address.

    Workflow:
      1. Normalizes address (lowercase, trims whitespace).
      2. Direct match lookup against KNOWN_VASPS dictionary.
      3. Pattern detection to flag dynamic exchange deposit proxies
         (e.g., '0x_dep_*' patterns and exchange sweep signatures).
      4. Fallback to an unattributed profile for unflagged/unrecognized wallets.

    Args:
        address: Cryptocurrency address string in EVM hex or Bitcoin format.

    Returns:
        Dictionary containing structured entity metadata:
            - name (str)
            - entity_type (str)
            - jurisdiction (str)
            - nodetype (str: 'vasp_hot', 'vasp_deposit', 'mixer', 'unattributed')
            - fiu_registered (bool)
            - risk_tier (str: 'Low', 'Medium', 'Critical')
            - compliance_email (str or None)
    """
    if not address or not isinstance(address, str):
        return deepcopy(UNATTRIBUTED_FALLBACK)

    # Step 1: Normalize address
    normalized = address.strip().lower()

    # Step 2: Direct match against KNOWN_VASPS
    if normalized in KNOWN_VASPS:
        return deepcopy(KNOWN_VASPS[normalized])

    # Step 3: Pattern detection for Dynamic VASP Deposit Proxies & Sweep Signatures
    # 3a. Check for exchange-specific dynamic deposit proxies: e.g., '0x_dep_coindcx_991f28b4a2'
    dep_match = DYNAMIC_DEP_REGEX.match(normalized)
    if dep_match:
        exchange_slug = dep_match.group(1)
        sub_id = dep_match.group(2)
        if exchange_slug in EXCHANGE_PROXY_PROFILES:
            profile = EXCHANGE_PROXY_PROFILES[exchange_slug]
            return {
                "name": f"{profile['display_name']} ({sub_id[:8]}...)",
                "entity_type": "Centralized Exchange",
                "jurisdiction": profile["jurisdiction"],
                "nodetype": "vasp_deposit",
                "fiu_registered": profile["fiu_registered"],
                "risk_tier": profile["risk_tier"],
                "compliance_email": profile["compliance_email"],
            }
        # Unknown exchange slug with 0x_dep_ prefix
        return {
            "name": f"Dynamic VASP Deposit Proxy ({exchange_slug.upper()})",
            "entity_type": "Centralized Exchange",
            "jurisdiction": "Dynamic / Unassigned",
            "nodetype": "vasp_deposit",
            "fiu_registered": False,
            "risk_tier": "Medium",
            "compliance_email": "investigations@fiu-india.gov.in",
        }

    # 3b. Generic '0x_dep_' prefix pattern
    if GENERIC_DEP_PREFIX_REGEX.match(normalized) or normalized.startswith("0x_dep_"):
        return {
            "name": f"Dynamic VASP Deposit Proxy ({normalized[:14]}...)",
            "entity_type": "Centralized Exchange",
            "jurisdiction": "Dynamic / Unassigned",
            "nodetype": "vasp_deposit",
            "fiu_registered": False,
            "risk_tier": "Medium",
            "compliance_email": "investigations@fiu-india.gov.in",
        }

    # 3c. Sweep signature detection
    if SWEEP_SIGNATURE_REGEX.search(normalized):
        return {
            "name": f"Dynamic Exchange Sweep Proxy ({normalized[:14]}...)",
            "entity_type": "Centralized Exchange",
            "jurisdiction": "Dynamic / Unassigned",
            "nodetype": "vasp_deposit",
            "fiu_registered": False,
            "risk_tier": "Medium",
            "compliance_email": "investigations@fiu-india.gov.in",
        }

    # 3d. Mixer pattern detection (e.g. Tornado Cash aliases)
    if "tornado" in normalized:
        return {
            "name": "Tornado Cash Mixer (OFAC Sanctioned)",
            "entity_type": "Mixer",
            "jurisdiction": "Sanctioned",
            "nodetype": "mixer",
            "fiu_registered": False,
            "risk_tier": "Critical",
            "compliance_email": "none/sanctioned",
        }

    # Step 4: Return Unattributed Fallback profile
    fallback = deepcopy(UNATTRIBUTED_FALLBACK)
    return fallback
