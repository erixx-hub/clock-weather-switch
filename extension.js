import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Soup from 'gi://Soup';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { fetchJson, weatherCodeToIcon } from './utils.js';

function formatTimeAndDate() {
    const now = GLib.DateTime.new_now_local();
    return now.format('%a %d.%m. %H:%M');
}

export default class ClockWeatherExtension extends Extension {
    enable() {
        // Review Point 6: Use built-in getSettings
        this._settings = this.getSettings();

        // Review Point 4: Create session in enable
        this._httpSession = new Soup.Session();

        this._weatherCache = { text: '–°C', icon: '☁️' };
        this._showWeather = false;

        this._dateMenu = Main.panel.statusArea.dateMenu;
        if (this._dateMenu) {
            this._label = this._dateMenu._clockDisplay;
        } else {
            console.error("Clock Weather Switch: Could not find dateMenu");
            return;
        }

        // Set initial text
        this._label.text = this._getNextText();

        // Initial weather update
        this._updateWeather();

        // Update weather every 15 minutes (900s)
        this._weatherTimer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            900,
            () => {
                this._updateWeather();
                return GLib.SOURCE_CONTINUE;
            }
        );

        this._restartSwitchTimer();
    }

    disable() {
        // Clean up timers
        if (this._weatherTimer) {
            GLib.source_remove(this._weatherTimer);
            this._weatherTimer = null;
        }
        if (this._switchTimer) {
            GLib.source_remove(this._switchTimer);
            this._switchTimer = null;
        }

        // Reset UI
        if (this._label) {
            this._label.text = formatTimeAndDate();
            this._label.remove_all_transitions();
            this._label.opacity = 255;
            this._label.translation_y = 0;
            this._label = null;
        }

        // Review Point 4: Abort and null out session
        if (this._httpSession) {
            this._httpSession.abort();
            this._httpSession = null;
        }

        // Review Point 7: Null out settings
        this._settings = null;
        this._dateMenu = null;
    }

    async _updateWeather() {
        // Safety check if disabled
        if (!this._settings || !this._httpSession) return;

        const lat = this._settings.get_double('latitude');
        const lon = this._settings.get_double('longitude');

        if (!lat && !lon) return;

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;

        try {
            const data = await fetchJson(this._httpSession, url);
            const cw = data?.current_weather;
            if (!cw) return;

            this._weatherCache.text = `${Math.round(cw.temperature)}°C`;
            this._weatherCache.icon = weatherCodeToIcon(cw.weathercode);
        } catch (e) {
            console.error(`Clock Weather Switch: weather error: ${e.message}`);
        }
    }

    _restartSwitchTimer() {
        if (this._switchTimer) GLib.source_remove(this._switchTimer);
        
        // Safety check
        if (!this._settings) return;

        const interval = this._settings.get_int('interval-seconds');

        this._switchTimer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            interval,
            () => {
                this._showWeather = !this._showWeather;
                this._slideToNext();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _getNextText() {
        if (this._showWeather) return `${this._weatherCache.icon} ${this._weatherCache.text}`;
        
        // Safety check
        if (!this._settings) return formatTimeAndDate();

        const prefix = this._settings.get_boolean('show-clock-icon') ? '🕒 ' : '';
        return `${prefix}${formatTimeAndDate()}`;
    }

    _slideToNext() {
        if (!this._label) return;

        const text = this._getNextText();

        this._label.ease({
            translation_y: -12,
            opacity: 0,
            duration: 160,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                // Check if label still exists (extension might be disabled during animation)
                if (!this._label) return;
                
                this._label.text = text;
                this._label.translation_y = 12;
                this._label.ease({
                    translation_y: 0,
                    opacity: 255,
                    duration: 160,
                    mode: Clutter.AnimationMode.EASE_IN_QUAD,
                });
            },
        });
    }
}
