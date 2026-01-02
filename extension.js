import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Soup from 'gi://Soup';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

function formatTimeAndDate() {
    return GLib.DateTime.new_now_local().format('%a %d.%m. %H:%M');
}

export default class ClockWeatherExtension extends Extension {
    enable() {
        // Review Punkt 2: Keine ID mehr nötig, da in metadata.json definiert
        this._settings = this.getSettings();
        this._httpSession = new Soup.Session();
        this._weatherCache = { text: '–°C', icon: '☁️' };
        this._showWeather = false;

        this._dateMenu = Main.panel.statusArea.dateMenu;
        this._label = this._dateMenu?._clockDisplay;
        
        if (!this._label) return;

        this._label.text = this._getNextText();
        this._updateWeather();

        this._weatherTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 900, () => {
            this._updateWeather();
            return GLib.SOURCE_CONTINUE;
        });
        
        this._restartSwitchTimer();
    }

    disable() {
        if (this._weatherTimer) {
            GLib.source_remove(this._weatherTimer);
            this._weatherTimer = null;
        }
        if (this._switchTimer) {
            GLib.source_remove(this._switchTimer);
            this._switchTimer = null;
        }
        
        if (this._label) {
            this._label.text = formatTimeAndDate();
            this._label.remove_all_transitions();
            this._label.opacity = 255;
            this._label.translation_y = 0;
            this._label = null;
        }
        
        if (this._httpSession) {
            this._httpSession.abort();
            this._httpSession = null;
        }

        this._settings = null;
    }

    async _updateWeather() {
        if (!this._settings || !this._httpSession) return;
        const lat = this._settings.get_double('latitude');
        const lon = this._settings.get_double('longitude');
        if (lat === 0 && lon === 0) return;

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
        try {
            const message = Soup.Message.new('GET', url);
            this._httpSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (sess, res) => {
                if (!this._httpSession) return;
                try {
                    const bytes = sess.send_and_read_finish(res);
                    const decoder = new TextDecoder('utf-8');
                    const data = JSON.parse(decoder.decode(bytes.get_data()));
                    const cw = data?.current_weather;
                    if (cw) {
                        this._weatherCache.text = `${Math.round(cw.temperature)}°C`;
                        const codes = { 0: '☀️', 1: '⛅', 2: '⛅', 3: '☁️' };
                        this._weatherCache.icon = codes[cw.weathercode] || '☁️';
                    }
                } catch (e) {}
            });
        } catch (e) {}
    }

    _restartSwitchTimer() {
        if (this._switchTimer) GLib.source_remove(this._switchTimer);
        if (!this._settings) return;

        const interval = this._settings.get_int('interval-seconds');
        this._switchTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._showWeather = !this._showWeather;
            this._slideToNext();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _getNextText() {
        if (this._showWeather) return `${this._weatherCache.icon} ${this._weatherCache.text}`;
        
        let prefix = '';
        if (this._settings && this._settings.get_boolean('show-clock-icon')) {
            prefix = '🕒 ';
        }
        return `${prefix}${formatTimeAndDate()}`;
    }

    _slideToNext() {
        if (!this._label) return;
        const text = this._getNextText();
        this._label.ease({
            translation_y: -12, opacity: 0, duration: 160,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            // Review Punkt 3: onComplete -> onStopped
            onStopped: () => {
                if (!this._label) return;
                this._label.text = text;
                this._label.translation_y = 12;
                this._label.ease({
                    translation_y: 0, opacity: 255, duration: 160,
                    mode: Clutter.AnimationMode.EASE_IN_QUAD,
                });
            },
        });
    }
}
