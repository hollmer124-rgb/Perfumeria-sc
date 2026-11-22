(function () {
  const isLocal = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
  const API_BASE_URL = isLocal ? "http://127.0.0.1:8000/api" : "/api";

  class ApiError extends Error {
    constructor(message, statusCode, detail) {
      super(message);
      this.name = "ApiError";
      this.status = statusCode;
      this.detail = detail;
    }
  }

  function getAccessToken() {
    return window.localStorage.getItem("access_token");
  }

  function clearSession() {
    window.localStorage.removeItem("access_token");
    window.localStorage.removeItem("refresh_token");
    window.localStorage.removeItem("current_user");
  }

  function validationMessage(detail) {
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail.map(function (item) {
        const location = Array.isArray(item.loc) ? item.loc.slice(1).join(" → ") : "";
        return (location ? location + ": " : "") + (item.msg || "Dato inválido");
      }).join(" ");
    }
    return "La solicitud no pudo completarse.";
  }

  async function apiFetch(endpoint, options) {
    const requestOptions = Object.assign({}, options || {});
    const skipUnauthorizedRedirect = Boolean(requestOptions.skipUnauthorizedRedirect);
    delete requestOptions.skipUnauthorizedRedirect;

    const headers = new Headers(requestOptions.headers || {});
    const token = getAccessToken();
    if (token) headers.set("Authorization", "Bearer " + token);

    if (requestOptions.body && typeof requestOptions.body !== "string") {
      headers.set("Content-Type", "application/json");
      requestOptions.body = JSON.stringify(requestOptions.body);
    }

    let response;
    try {
      response = await window.fetch(API_BASE_URL + endpoint, Object.assign({}, requestOptions, {
        headers: headers,
      }));
    } catch (error) {
      throw new ApiError(
        "No fue posible conectar con el servidor. Verifica que la API esté activa.",
        0,
        error
      );
    }

    if (response.status === 401 && !skipUnauthorizedRedirect) {
      clearSession();
      if (!window.location.pathname.toLowerCase().endsWith("/login.html")) {
        window.location.assign("login.html");
      }
    }

    if (!response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }
      const detail = payload && payload.detail;
      throw new ApiError(
        validationMessage(detail) || "La solicitud no pudo completarse.",
        response.status,
        detail
      );
    }

    if (response.status === 204) return null;
    const payload = await response.json();
    const totalCount = response.headers.get("X-Total-Count");
    if (Array.isArray(payload) && totalCount !== null) {
      Object.defineProperty(payload, "__totalCount", {
        value: Number(totalCount),
        enumerable: false,
      });
    }
    return payload;
  }

  async function downloadBlob(endpoint) {
    const token = getAccessToken();
    if (!token) {
      window.location.assign("login.html");
      throw new ApiError("Debes iniciar sesión para descargar el reporte.", 401, null);
    }

    let response;
    try {
      response = await window.fetch(API_BASE_URL + endpoint, {
        headers: {
          Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          Authorization: "Bearer " + token,
        },
      });
    } catch (error) {
      throw new ApiError(
        "No fue posible conectar con el servidor. Verifica que la API esté activa.",
        0,
        error
      );
    }

    if (response.status === 401) {
      clearSession();
      if (!window.location.pathname.toLowerCase().endsWith("/login.html")) {
        window.location.assign("login.html");
      }
    }

    if (!response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }
      const detail = payload && payload.detail;
      throw new ApiError(validationMessage(detail), response.status, detail);
    }

    const contentDisposition = response.headers.get("Content-Disposition") || "";
    const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    return {
      blob: await response.blob(),
      filename: filenameMatch ? filenameMatch[1] : "",
    };
  }

  window.PerfumeriaAPI = Object.freeze({
    API_BASE_URL: API_BASE_URL,
    ApiError: ApiError,
    apiFetch: apiFetch,
    clearSession: clearSession,
    downloadBlob: downloadBlob,
    getAccessToken: getAccessToken,
  });
})();
