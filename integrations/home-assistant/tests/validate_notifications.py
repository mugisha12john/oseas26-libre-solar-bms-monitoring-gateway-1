"""Run inside Home Assistant; notification destinations are mocked, never sent."""

import asyncio
from copy import deepcopy
from pathlib import Path
import sys

import yaml

from homeassistant.components.automation.config import PLATFORM_SCHEMA
from homeassistant.core import Context, HomeAssistant, State
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.script import Script
from homeassistant.helpers.template import Template


class BlueprintLoader(yaml.SafeLoader):
    pass


BlueprintLoader.add_constructor(
    "!input", lambda loader, node: {"blueprint_input": loader.construct_scalar(node)}
)


def expand(value, inputs):
    if isinstance(value, dict):
        if set(value) == {"blueprint_input"}:
            return deepcopy(inputs[value["blueprint_input"]])
        return {key: expand(item, inputs) for key, item in value.items()}
    if isinstance(value, list):
        return [expand(item, inputs) for item in value]
    return value


async def main():
    path = Path(sys.argv[1] if len(sys.argv) > 1 else
                "/config/blueprints/automation/libre_solar/bms-state-notifications.yaml")
    blueprint = yaml.load(path.read_text(), Loader=BlueprintLoader)
    inputs = {
        name: deepcopy(definition.get("default"))
        for name, definition in blueprint["blueprint"]["input"].items()
    }
    entity_id = "sensor.libre_solar_bat_001_bms_state"
    inputs["bms_state_entity"] = entity_id
    source = {key: value for key, value in blueprint.items() if key != "blueprint"}
    expanded = expand(source, inputs)
    hass = HomeAssistant("/tmp/libre-solar-notifications-validation")
    validated = PLATFORM_SCHEMA(expanded)
    captured = []

    async def capture(call):
        captured.append((call.domain, call.service, dict(call.data)))

    async def fail_delivery(call):
        raise HomeAssistantError("Intentional mocked delivery failure")

    hass.services.async_register("persistent_notification", "create", capture)
    hass.services.async_register("notify", "mock_phone", capture)
    hass.services.async_register("notify", "send_message", capture)
    hass.services.async_register("notify", "mock_failure", fail_delivery)
    condition = Template(expanded["conditions"][0]["value_template"], hass)
    script = Script(hass, validated["actions"], "BMS test", "libre_solar_test")

    def trigger(previous, current):
        return {
            "entity_id": entity_id,
            "from_state": State(entity_id, previous) if previous is not None else None,
            "to_state": State(entity_id, current) if current is not None else None,
        }

    states = ["NORMAL", "LOW_SOC", "WARNING", "FAULT"]
    for previous in states:
        for current in states:
            variables = {"trigger": trigger(previous, current)}
            accepted = condition.async_render(variables)
            assert accepted == (previous != current), (previous, current, accepted)
            if accepted:
                await script.async_run(variables, context=Context())
                data = captured[-1][2]
                assert f"{previous} to {current}" in " ".join(data["message"].split())
                assert current in data["title"]
    assert len(captured) == 12
    assert len({item[2]["notification_id"] for item in captured}) == 1
    for previous, current in [(None, "NORMAL"), ("unknown", "FAULT"),
                              ("FAULT", "unavailable"), ("unavailable", "NORMAL"),
                              ("NORMAL", None)]:
        assert not condition.async_render({"trigger": trigger(previous, current)})

    inputs["additional_notifications"] = [
        {"action": "notify.mock_phone", "data": {
            "title": "{{ notification_title }}", "message": "{{ notification_message }}"}},
        {"action": "notify.mock_failure", "continue_on_error": True},
        {"action": "notify.send_message", "target": {"entity_id": "notify.mock_email"},
         "data": {"title": "{{ notification_title }}", "message": "{{ notification_message }}"}},
    ]
    optional = expand(source, inputs)
    validated_optional = PLATFORM_SCHEMA(optional)
    await Script(hass, validated_optional["actions"], "Delivery test", "libre_solar_test").async_run(
        {"trigger": trigger("FAULT", "NORMAL")}, context=Context()
    )
    assert [item[0:2] for item in captured[-3:]] == [
        ("persistent_notification", "create"), ("notify", "mock_phone"),
        ("notify", "send_message"),
    ]
    assert all("FAULT to NORMAL" in " ".join(item[2]["message"].split())
               for item in captured[-3:])
    print("Passed: schema, all 12 BMS transitions, unchanged/unknown/initial-state filtering,")
    print("latest-notification replacement, recovery text, and isolated phone/email actions.")
    print("All external notification destinations were mocked; no phone message or email was sent.")


asyncio.run(main())
