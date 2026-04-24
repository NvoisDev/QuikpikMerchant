let _wholesalerId: string | null = null;
let _token: string | null = null;

export function setImpersonation(wholesalerId: string | null, token: string | null): void {
  _wholesalerId = wholesalerId;
  _token = token;
}

export function getImpersonationId(): string | null {
  return _wholesalerId;
}

const _originalFetch = window.fetch.bind(window);
window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
  if (_wholesalerId && _token) {
    // Only inject impersonation headers for same-origin /api requests
    // to prevent accidental header disclosure to third-party services
    let url: string;
    if (typeof input === "string") {
      url = input;
    } else if (input instanceof URL) {
      url = input.href;
    } else {
      url = (input as Request).url;
    }

    const isSameOriginApi =
      url.startsWith("/api/") ||
      url.startsWith(window.location.origin + "/api/");

    if (isSameOriginApi) {
      const headers = new Headers(init?.headers || {});
      headers.set("X-Admin-Impersonate", _wholesalerId);
      headers.set("X-Impersonate-Token", _token);
      return _originalFetch(input, { ...(init || {}), headers });
    }
  }
  return _originalFetch(input, init);
};
