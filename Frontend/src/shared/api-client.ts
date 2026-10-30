import type { AppError } from "./data-contract";

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: "MANAGER" | "DEPUTY_MANAGER" | "STAFF";
  status: "ACTIVE" | "LOCKED";
  jobTitle: string;
  department?: string | null;
  phoneNumber?: string | null;
  avatarUrl: string | null;
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface AuthSession {
  accessToken: string;
  expiresInSeconds: number;
  user: AuthenticatedUser;
}

interface ApiEnvelope<T> {
  data: T;
}

interface ApiFailure {
  error?: {
    code?: string;
    message?: string;
    fieldErrors?: Record<string, string | string[]>;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly code: AppError["code"],
    message: string,
    public readonly fieldErrors?: Record<string, string>,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }

  toAppError(): AppError {
    return { code: this.code, message: this.message, fieldErrors: this.fieldErrors };
  }
}

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const configuredApiUrl = configuredBaseUrl || "http://localhost:3000/api";
const apiBaseUrl = (() => {
  try {
    const url = new URL(configuredApiUrl);
    const localHosts = ["localhost", "127.0.0.1"];
    if (
      typeof window !== "undefined" &&
      localHosts.includes(window.location.hostname) &&
      localHosts.includes(url.hostname)
    ) {
      // Keep the refresh cookie on the same local host as the frontend origin.
      url.hostname = window.location.hostname;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return configuredApiUrl.replace(/\/$/, "");
  }
})();

export const isMockMode = import.meta.env.VITE_DATA_MODE === "mock";

class ApiClient {
  private accessToken: string | null = null;
  private refreshInFlight: Promise<AuthSession | null> | null = null;
  private sessionListeners = new Set<(session: AuthSession | null) => void>();
  private socketAccessToken: string | null = null;

  setAccessToken(token: string | null): void {
    this.accessToken = token;
    this.socketAccessToken = token;
  }

  getAccessToken(): string | null {
    return this.socketAccessToken;
  }

  onSession(listener: (session: AuthSession | null) => void): () => void {
    this.sessionListeners.add(listener);
    return () => this.sessionListeners.delete(listener);
  }

  private publishSession(session: AuthSession | null): void {
    this.accessToken = session?.accessToken ?? null;
    this.socketAccessToken = this.accessToken;
    this.sessionListeners.forEach((listener) => listener(session));
  }

  async login(email: string, password: string): Promise<AuthSession> {
    const session = await this.send<AuthSession>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }, false);
    this.publishSession(session);
    return session;
  }

  async refresh(): Promise<AuthSession | null> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.send<AuthSession>("/auth/refresh", {
      method: "POST",
    }, false)
      .then((session) => {
        this.publishSession(session);
        return session;
      })
      .catch((error: unknown) => {
        this.publishSession(null);
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      })
      .finally(() => {
        this.refreshInFlight = null;
      });
    return this.refreshInFlight;
  }

  async logout(allSessions = false): Promise<void> {
    try {
      if (this.accessToken) {
        await this.request<{ success: true }>(`/auth/${allSessions ? "logout-all" : "logout"}`, {
          method: "POST",
        });
      }
    } finally {
      this.publishSession(null);
    }
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.accessToken) await this.refresh();
    return this.send<T>(path, init, true, true);
  }

  async requestBlob(path: string, init: RequestInit = {}): Promise<{ blob: Blob; filename: string | null }> {
    if (!this.accessToken) await this.refresh();
    let response = await this.fetchWithAuth(path, init, true);
    if (response.status === 401) {
      const session = await this.refresh();
      if (session) response = await this.fetchWithAuth(path, init, true);
      else {
        this.publishSession(null);
        throw await this.toApiError(response);
      }
    }
    if (!response.ok) throw await this.toApiError(response);
    const disposition = response.headers.get("content-disposition");
    const filename = disposition?.match(/filename="?([^";]+)"?/i)?.[1] ?? null;
    return { blob: await response.blob(), filename };
  }

  private async send<T>(path: string, init: RequestInit, authenticated: boolean, retry401 = false): Promise<T> {
    const response = await this.fetchWithAuth(path, init, authenticated);
    if (response.status === 401 && authenticated && retry401) {
      const session = await this.refresh();
      if (session) return this.send<T>(path, init, true, false);
      this.publishSession(null);
      throw await this.toApiError(response);
    }
    if (!response.ok) throw await this.toApiError(response);
    if (response.status === 204) return undefined as T;
    const envelope = await response.json() as ApiEnvelope<T> | T;
    if (envelope && typeof envelope === "object" && "data" in envelope) {
      return (envelope as ApiEnvelope<T>).data;
    }
    return envelope as T;
  }

  private async fetchWithAuth(path: string, init: RequestInit, authenticated: boolean): Promise<Response> {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    if (authenticated && this.accessToken) headers.set("Authorization", `Bearer ${this.accessToken}`);
    try {
      return await fetch(`${apiBaseUrl}${path}`, {
        ...init,
        headers,
        credentials: "include",
      });
    } catch {
      throw new ApiError("NETWORK_ERROR", "Không kết nối được máy chủ. Kiểm tra backend và cấu hình API.");
    }
  }

  private async toApiError(response: Response): Promise<ApiError> {
    let payload: ApiFailure = {};
    try {
      payload = await response.json() as ApiFailure;
    } catch {
      // Keep the HTTP status as useful diagnostic information.
    }
    const code = payload.error?.code ?? (response.status === 401 ? "UNAUTHORIZED" : "SERVER_ERROR");
    const mappedCode: AppError["code"] =
      code === "UNAUTHORIZED" ? "UNAUTHORIZED" :
      code === "FORBIDDEN" ? "FORBIDDEN" :
      code === "NOT_FOUND" ? "NOT_FOUND" :
      code === "VALIDATION" ? "VALIDATION" :
      code === "CONFLICT" ? "CONFLICT" :
      code === "RATE_LIMITED" ? "RATE_LIMITED" : "SERVER_ERROR";
    const fieldErrors = payload.error?.fieldErrors
      ? Object.fromEntries(Object.entries(payload.error.fieldErrors).map(([key, value]) => [key, Array.isArray(value) ? value.join("; ") : value]))
      : undefined;
    const fallback = response.status === 401 ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." :
      response.status === 403 ? "Bạn không có quyền thực hiện thao tác này." :
      response.status === 404 ? "Không tìm thấy dữ liệu." :
      response.status === 409 ? "Dữ liệu đã thay đổi. Hãy tải lại rồi thử lại." :
      response.status === 429 ? "Bạn thao tác quá nhanh. Vui lòng thử lại sau." :
      response.status >= 500 ? "Máy chủ đang gặp sự cố. Vui lòng thử lại sau." : "Yêu cầu không hợp lệ.";
    return new ApiError(mappedCode, payload.error?.message || fallback, fieldErrors, response.status);
  }
}

export const apiClient = new ApiClient();
