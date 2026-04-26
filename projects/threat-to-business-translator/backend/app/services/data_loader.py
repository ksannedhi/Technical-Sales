import json
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parents[2] / "data"

SECTOR_FILES: dict[str, str] = {
    "financial-services": "enterprise_data.json",
    "healthcare":         "enterprise_data_healthcare.json",
    "manufacturing":      "enterprise_data_manufacturing.json",
    "retail":             "enterprise_data_retail.json",
    "technology":         "enterprise_data_technology.json",
}

SECTORS: list[dict] = [
    {"id": "financial-services", "label": "Financial Services"},
    {"id": "healthcare",         "label": "Healthcare"},
    {"id": "manufacturing",      "label": "Manufacturing"},
    {"id": "retail",             "label": "Retail"},
    {"id": "technology",         "label": "Technology"},
]


def load_domain(sector: str = "financial-services") -> dict:
    file_name = SECTOR_FILES.get(sector, SECTOR_FILES["financial-services"])
    path = DATA_DIR / file_name
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def list_sectors() -> list[dict]:
    return SECTORS


def list_scenario_cards(sector: str = "financial-services") -> list[dict]:
    domain = load_domain(sector)
    service_map = {item["id"]: item for item in domain["business_services"]}

    cards = []
    for scenario in domain["scenarios"]:
        if scenario.get("library_visible", True) is False:
            continue
        service = service_map[scenario["service_id"]]
        cards.append(
            {
                "id": scenario["id"],
                "name": scenario["name"],
                "category": scenario["category"],
                "business_service": service["name"],
                "business_unit": service["business_unit"],
                "primary_asset": scenario["primary_asset_id"],
            }
        )
    return cards


def get_scenario_bundle(scenario_id: str, domain: dict | None = None) -> dict | None:
    if domain is None:
        domain = load_domain()
    scenario = next((item for item in domain["scenarios"] if item["id"] == scenario_id), None)
    if scenario is None:
        return None

    services = {item["id"]: item for item in domain["business_services"]}
    assets = {item["id"]: item for item in domain["assets"]}
    identities = {item["id"]: item for item in domain["identities"]}
    controls = {item["id"]: item for item in domain["controls"]}
    business_units = {item["id"]: item for item in domain["business_units"]}

    service = services[scenario["service_id"]]
    business_unit = business_units[service["business_unit_id"]]
    primary_asset = assets[scenario["primary_asset_id"]]
    linked_assets = [assets[item] for item in scenario.get("asset_ids", []) if item in assets]
    linked_identities = [identities[item] for item in scenario.get("identity_ids", []) if item in identities]

    control_ids = set(primary_asset.get("control_ids", []))
    for asset in linked_assets:
        control_ids.update(asset.get("control_ids", []))
    linked_controls = [controls[item] for item in control_ids if item in controls]

    return {
        "scenario": scenario,
        "service": service,
        "business_unit": business_unit,
        "primary_asset": primary_asset,
        "linked_assets": linked_assets,
        "linked_identities": linked_identities,
        "linked_controls": linked_controls,
    }
