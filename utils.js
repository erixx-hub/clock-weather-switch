import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

/**
 * Shared helper to fetch JSON via a provided Soup session.
 * @param {Soup.Session} session - The session to use for the request
 * @param {string} url - The URL to fetch
 * @returns {Promise<Object>} - Parsed JSON
 */
export function fetchJson(session, url) {
    return new Promise((resolve, reject) => {
        const message = Soup.Message.new('GET', url);
        message.request_headers.append('User-Agent', 'gnome-shell-extension-clock-weather');

        session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null,
            (sess, result) => {
                try {
                    const bytes = sess.send_and_read_finish(result);

                    if (message.status_code !== 200) {
                        reject(new Error(`HTTP Error ${message.status_code}`));
                        return;
                    }

                    if (!bytes) {
                        reject(new Error('Empty response'));
                        return;
                    }

                    const decoder = new TextDecoder('utf-8');
                    const text = decoder.decode(bytes.get_data());
                    resolve(JSON.parse(text));
                } catch (e) {
                    reject(e);
                }
            }
        );
    });
}

/**
 * Helper to convert WMO weather codes to icons
 */
export function weatherCodeToIcon(code) {
    if (code === 0) return '☀️';
    if (code <= 2) return '⛅';
    if (code <= 48) return '☁️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '❄️';
    if (code <= 99) return '⛈️';
    return '☁️';
}
