import json
from pathlib import Path


DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "enterprise_data.json"


def load_domain() -> dict:
    with DATA_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_scenarios() -> list[dict]:
    return load_domain()["scenarios"]


def list_scenario_cards() -> list[dict]:
    domain = load_domain()
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


def get_scenario_bundle(scenario_id: str) -> dict | None:
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
    linked_assets = [assets[item] for item in scenario.get("asset_ids", [])]
    linked_identities = [identities[item] for item in scenario.get("identity_ids", [])]

    control_ids = set(primary_asset.get("control_ids", []))
    for asset in linked_assets:
        control_ids.update(asset.get("control_ids", []))
    linked_controls = [controls[item] for item in control_ids]

    return {
        "scenario": scenario,
        "service": service,
        "business_unit": business_unit,
        "primary_asset": primary_asset,
        "linked_assets": linked_assets,
        "linked_identities": linked_identities,
        "linked_controls": linked_controls,
    }
