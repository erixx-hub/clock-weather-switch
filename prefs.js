import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ClockWeatherPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.clock-weather-switch');
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ title: 'Settings' });

        const intervalRow = new Adw.ActionRow({ title: 'Switch interval (seconds)' });
        const intervalSpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({ lower: 2, upper: 120, step_increment: 1 }),
            valign: Gtk.Align.CENTER,
        });
        intervalSpin.set_value(settings.get_int('interval-seconds'));
        intervalSpin.connect('value-changed', () => {
            settings.set_int('interval-seconds', intervalSpin.get_value_as_int());
        });
        intervalRow.add_suffix(intervalSpin);
        group.add(intervalRow);

        const iconRow = new Adw.ActionRow({ title: 'Show clock icon' });
        const iconSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER, active: settings.get_boolean('show-clock-icon') });
        iconSwitch.connect('notify::active', () => {
            settings.set_boolean('show-clock-icon', iconSwitch.active);
        });
        iconRow.add_suffix(iconSwitch);
        group.add(iconRow);

        const locationRow = new Adw.ActionRow({ title: 'Location (city)' });
        const locationEntry = new Gtk.Entry({
            valign: Gtk.Align.CENTER, hexpand: true,
            text: settings.get_string('location-query') || '',
        });
        locationRow.add_suffix(locationEntry);
        group.add(locationRow);

        const detectedLabel = new Gtk.Label({ xalign: 1, label: settings.get_string('location-label') || '—' });
        const detectedRow = new Adw.ActionRow({ title: 'Detected Location' });
        detectedRow.add_suffix(detectedLabel);
        group.add(detectedRow);

        let debounceId = 0;
        const doLookup = () => {
            const query = locationEntry.text.trim();
            settings.set_string('location-query', query);
            if (!query) return;

            detectedLabel.label = 'Searching…';
            const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&format=json`;
            const session = new Soup.Session();
            const message = Soup.Message.new('GET', url);
            
            session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (sess, res) => {
                try {
                    const bytes = sess.send_and_read_finish(res);
                    const data = JSON.parse(new TextDecoder().decode(bytes.get_data()));
                    if (data?.results?.length) {
                        const r = data.results[0];
                        const label = `${r.name}, ${r.country}`;
                        settings.set_string('location-label', label);
                        settings.set_double('latitude', r.latitude);
                        settings.set_double('longitude', r.longitude);
                        detectedLabel.label = label;
                    }
                } catch (e) {}
                finally { session.abort(); }
            });
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
