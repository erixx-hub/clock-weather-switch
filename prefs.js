import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { fetchJson } from './utils.js';

export default class ClockWeatherPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        // Review Point 6: Use built-in getSettings
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ title: 'Settings' });

        /* Switch interval */
        const intervalRow = new Adw.ActionRow({
            title: 'Switch interval (seconds)',
        });

        const intervalSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 2,
                upper: 120,
                step_increment: 1,
            }),
            valign: Gtk.Align.CENTER,
        });

        intervalSpin.set_value(settings.get_int('interval-seconds'));
        intervalSpin.connect('value-changed', () => {
            settings.set_int('interval-seconds', intervalSpin.get_value_as_int());
        });

        intervalRow.add_suffix(intervalSpin);
        intervalRow.set_activatable_widget(intervalSpin);
        group.add(intervalRow);

        /* Show clock icon */
        const iconRow = new Adw.ActionRow({
            title: 'Show clock icon',
            subtitle: 'Show the 🕒 emoji before the time.',
        });

        const iconSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: settings.get_boolean('show-clock-icon'),
        });

        iconSwitch.connect('notify::active', () => {
            settings.set_boolean('show-clock-icon', iconSwitch.active);
        });

        iconRow.add_suffix(iconSwitch);
        iconRow.set_activatable_widget(iconSwitch);
        group.add(iconRow);

        /* Location search */
        const locationRow = new Adw.ActionRow({
            title: 'Location (city)',
            subtitle: 'Enter a city name, e.g. “Berlin” or “Osnabrück”.',
        });

        const locationEntry = new Gtk.Entry({
            valign: Gtk.Align.CENTER,
            hexpand: true,
            placeholder_text: 'City name…',
            text: settings.get_string('location-query') || '',
        });

        locationRow.add_suffix(locationEntry);
        locationRow.set_activatable_widget(locationEntry);
        group.add(locationRow);

        /* Detected location */
        const detectedRow = new Adw.ActionRow({
            title: 'Detected Location',
        });

        const detectedLabel = new Gtk.Label({
            xalign: 1,
            valign: Gtk.Align.CENTER,
            label: settings.get_string('location-label') || '—',
        });

        detectedRow.add_suffix(detectedLabel);
        group.add(detectedRow);

        let debounceId = 0;

        const doLookup = async () => {
            const query = (locationEntry.text || '').trim();
            settings.set_string('location-query', query);

            if (!query) {
                settings.set_string('location-label', '');
                settings.set_double('latitude', 0.0);
                settings.set_double('longitude', 0.0);
                detectedLabel.label = '—';
                detectedRow.set_subtitle('');
                return;
            }

            detectedLabel.label = 'Searching…';
            detectedRow.set_subtitle('Querying open-meteo geocoding…');

            const url = 'https://geocoding-api.open-meteo.com/v1/search' +
                `?name=${encodeURIComponent(query)}&count=1&format=json&language=en`;

            // Create a temporary session for this lookup
            const session = new Soup.Session();

            try {
                // Use shared fetchJson via utils.js
                const data = await fetchJson(session, url);

                if (!data || !data.results || data.results.length < 1) {
                    settings.set_string('location-label', '');
                    settings.set_double('latitude', 0.0);
                    settings.set_double('longitude', 0.0);
                    detectedLabel.label = 'Not found';
                    detectedRow.set_subtitle('No results from geocoding.');
                    return;
                }

                const r = data.results[0];
                const labelParts = [r.name];
                if (r.admin1) labelParts.push(r.admin1);
                if (r.country) labelParts.push(r.country);
                const label = labelParts.join(', ');

                settings.set_string('location-label', label);
                settings.set_double('latitude', Number(r.latitude) || 0.0);
                settings.set_double('longitude', Number(r.longitude) || 0.0);

                detectedLabel.label = label;
                detectedRow.set_subtitle(`lat ${r.latitude}, lon ${r.longitude}`);

            } catch (e) {
                detectedLabel.label = 'Error';
                detectedRow.set_subtitle(String(e.message || e));
                console.error(e);
            } finally {
                // Important: Clean up the temp session
                session.abort();
            }
        };

        locationEntry.connect('changed', () => {
            if (debounceId) GLib.source_remove(debounceId);

            debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                debounceId = 0;
                doLookup();
                return GLib.SOURCE_REMOVE;
            });
        });

        page.add(group);
        window.add(page);
    }
}
