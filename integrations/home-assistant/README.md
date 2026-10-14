# Home Assistant

For the exact discovery topics, JSON configuration, and sensor value paths,
see [the shared MQTT contract](../../docs/MQTT_SPECIFICATION.md#home-assistant-auto-discovery).

Enable the Home Assistant MQTT integration and connect it to the same
Mosquitto broker. The simulator publishes retained MQTT Discovery configuration
for the Libre Solar battery as one device. Every entity reads the existing
canonical telemetry topic; no Home Assistant-specific telemetry format is
created.

## Discovery entities

The simulator publishes discovery for:

- State of charge
- Pack voltage, current, and power
- Battery temperature
- Cycle count
- BMS state
- Cell 1 through Cell 4 voltage
- Minimum, maximum, and average cell voltage
- Cell imbalance
- Balancing
- Online/offline availability

All entities use a stable device identifier derived from `site_id` and
`battery_id`, for example `libre_solar_site_001_BAT_001`, and are grouped under
`Libre Solar BAT-001`. Discovery also sets an `object_id`, but Home Assistant
may preserve earlier entity IDs in its registry. Check **Developer tools -> States**
and map the dashboard references to your actual entities.

Availability comes from the existing status topic:

```text
libre-solar/site-001/BAT-001/status
```

The telemetry topic remains:

```text
libre-solar/site-001/BAT-001/telemetry
```

## Install the dashboard

The ready-to-import Lovelace dashboard is
`integrations/home-assistant/dashboard.yaml`.

Using the Home Assistant UI:

1. Open the MQTT integration and confirm the Libre Solar device and entities
   have appeared.
2. Open **Settings -> Dashboards**.
3. Create a new dashboard or open an existing dashboard in edit mode.
4. Choose **Add dashboard card**, then **Manual**.
5. Add the cards from `dashboard.yaml` section by section, or use YAML
   dashboard mode and paste the complete file contents.
6. Save and open the **Libre Solar Battery** view.

The dashboard contains Battery Overview, Battery History, Cell Monitoring,
Battery Health, and Events and State Changes sections. SOH is intentionally
shown as not calculated because the current dashboard does not use an SOH
entity.

## Verify discovery from MQTT

Subscribe to retained Discovery messages:

```bash
mosquitto_sub -h localhost -p 1883 -t 'homeassistant/#' -v
```

Restart the simulator so it republishes retained discovery configuration:

```bash
docker compose up -d --build --force-recreate simulator
```

You should see topics such as:

```text
homeassistant/sensor/libre_solar_site_001_BAT_001/soc/config
homeassistant/sensor/libre_solar_site_001_BAT_001/pack_voltage/config
homeassistant/binary_sensor/libre_solar_site_001_BAT_001/online/config
```

## Verify scenarios

Deploy simulator source changes once with `docker compose up -d --build --no-deps simulator`.
After that, switch conditions without editing `.env` or restarting:

```bash
docker compose exec -T mosquitto mosquitto_pub -h localhost -q 1 \
  -t 'libre-solar/site-001/BAT-001/control' \
  -m '{"schema_version":"1.0","command":"SET_SCENARIO","value":"HIGH_TEMPERATURE"}'
```

Temperature and BMS state should update in Home Assistant.
Select `NORMAL` to reset the simulated battery to a healthy baseline:

```bash
docker compose exec -T mosquitto mosquitto_pub -h localhost -q 1 \
  -t 'libre-solar/site-001/BAT-001/control' \
  -m '{"schema_version":"1.0","command":"SET_SCENARIO","value":"NORMAL"}'
```

The next telemetry step should show `NORMAL`, healthy cell voltages, and empty error flags.
Select `RECOVERY` instead for gradual recovery while preserving measurements.
MPM fault history remains stored in either case.

## BMS state change notifications

The [notification blueprint](bms-state-notifications.yaml) watches the discovered BMS state sensor.
Using the sensor rather than only the MQTT event topic also catches `WARNING → FAULT` and a return to `NORMAL`, for which the current MQTT event schema has no dedicated recovery event.

- Every transition between `NORMAL`, `LOW_SOC`, `WARNING`, and `FAULT` creates or updates a Home Assistant notification.
- Each message identifies the battery/site, previous state, new state, and transition time.
- One notification per battery is kept in the notification panel and updated with the latest transition; the sensor's history/logbook retains state changes according to your recorder settings.
- Repeated telemetry, attribute-only changes, first initialization, and `unknown`/`unavailable` transitions are ignored.
- Optional actions deliver the same message to configured phone/email destinations.
- Actions are queued in order, with up to 100 queued runs; changes while Home Assistant is stopped are not replayed.

Connectivity changes are separate from BMS health and would need a separate availability automation.

### Install in Home Assistant Container

Run from the gateway root, substituting your actual container name if needed:

```bash
docker exec homeassistant mkdir -p /config/blueprints/automation/libre_solar
docker cp integrations/home-assistant/bms-state-notifications.yaml \
  homeassistant:/config/blueprints/automation/libre_solar/bms-state-notifications.yaml
```

For another installation type, copy the file into `blueprints/automation/libre_solar/` inside Home Assistant's configuration directory using its file editor or your normal configuration access.

1. Open **Settings → Automations & scenes → Blueprints** and reload blueprints if needed.
2. Select **Libre Solar BMS state notifications** and create an automation.
3. Select the actual **BMS State** sensor in the entity picker. The existing local installation uses `sensor.libre_solar_bat_001_bms_state`; a fresh registry may use a different ID.
4. Set the battery/site label. Leave optional actions empty to enable Home Assistant notifications only.
5. Save and enable the automation.

[notifications.example.yaml](notifications.example.yaml) is the equivalent `automations.yaml` entry for the existing local entity name.
Merge the entry into your existing automation list only if creating it through YAML; do not overwrite other automations or create a second copy of the same notification automation.
The standard configuration contains `automation: !include automations.yaml`.

### Add email delivery

Your Home Assistant account email is not an outgoing email configuration.
Configure **Settings → Devices & services → Add integration → SMTP**, using your provider's SMTP host, port, security, and credentials.
Add the intended recipient and note its `notify.*` entity.
For Gmail, the documented settings are `smtp.gmail.com`, port `587`, STARTTLS, your Gmail address as username/sender, and a Google app password where supported.
Enter credentials privately in Home Assistant; do not put them in this repository or chat.
See the [official SMTP setup guide](https://www.home-assistant.io/integrations/smtp/) for provider requirements.

Edit the BMS automation's optional notification actions and add this, replacing the example recipient entity:

```yaml
- action: notify.send_message
  continue_on_error: true
  target:
    entity_id: notify.your_email_recipient
  data:
    title: "{{ notification_title }}"
    message: "{{ notification_message }}"
```

The email integration must be configured before that action can deliver mail.
If the setup form reports **Invalid flow specified**, close the form, reload
Home Assistant, and start a new SMTP setup from **Add integration**.
Setup flows are held in memory; restarting Home Assistant can invalidate a
form that was already open. Reusing that form will not save the integration.
This error is distinct from an SMTP authentication error; enter a provider app
password in the fresh form, rather than a normal Gmail account password.
For older Home Assistant installations exposing a legacy `notify.staff_email` action instead of a notify entity, select that actual action and supply the same title/message, without the `target` block.
The local Home Assistant version inspected for this implementation is 2026.9.4 and supports SMTP setup through the UI.

### Add Companion phone delivery

Install the Home Assistant Companion app, connect it to this Home Assistant instance, and grant notification permission.
Find the registered `notify.mobile_app_*` action in **Developer tools → Actions**.
Add the following to optional notification actions, using your actual action name:

```yaml
- action: notify.mobile_app_your_phone
  continue_on_error: true
  data:
    title: "{{ notification_title }}"
    message: "{{ notification_message }}"
```

You can add both phone and email actions.
The Home Assistant notification is created first; `continue_on_error` lets independent delivery actions continue if one channel fails.
See [Companion notification documentation](https://companion.home-assistant.io/docs/notifications/notifications-basic/) for device setup and delivery requirements.

### Verify the automation

Start in `NORMAL`, then select `HIGH_TEMPERATURE`, wait for `WARNING` or `FAULT`, and select `NORMAL` again using the commands above.
Open Home Assistant's notification panel and check that the latest message says the battery returned to normal.
Open the automation's **Traces** to inspect each actual state change; repeated unchanged telemetry should not notify.
With SMTP/Companion configured, confirm the same transitions reach the intended recipient/device.
The automation's **Run actions** button does not supply a real state trigger; use a scenario change for this test.

To validate the installed blueprint using Home Assistant's own action/template engine, run:

```bash
docker exec -i homeassistant python - \
  < integrations/home-assistant/tests/validate_notifications.py
```

The validator checks all 12 directed BMS state transitions, ignored initialization/unchanged/unknown states, and optional phone/email actions with mocked destinations.
It sends no real email or phone notification.

Relevant platform references: [state triggers](https://www.home-assistant.io/docs/automation/trigger/), [blueprints](https://www.home-assistant.io/docs/blueprint/schema/), and [persistent notifications](https://www.home-assistant.io/integrations/persistent_notification/).
