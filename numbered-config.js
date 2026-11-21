/* Public client configuration for Numbered.
 * This file contains endpoints only. Never place API keys or admin tokens here.
 */
window.NUMBERED_CONFIG = Object.freeze({
  apiBaseUrl: "https://numbered-notify.sultan2021alamoudi.workers.dev",
  apiUrl(path) {
    const base = this.apiBaseUrl.replace(/\\/+$/, "");
    const route = String(path || "").replace(/^\\/+/, "");
    return base + (route ? "/" + route : "");
  }
});
