// Cliente HTTP único. Toda a comunicação com o backend passa por aqui, o que
// permite trocar a camada de dados (ex.: Supabase) sem mexer nas telas.
import { storage } from "@/src/utils/storage";

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL as string;
const API = `${BACKEND_URL}/api`;
export const TOKEN_KEY = "auth_token";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown; skipUnauthorizedHandler?: boolean } = {}): Promise<T> {
  const token = await storage.secureGet(TOKEN_KEY, null as string | null);
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError("Sem conexão com a internet. Verifique sua rede.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && !init.skipUnauthorizedHandler) onUnauthorized?.();
    let msg = "Algo deu errado. Tente novamente.";
    if (typeof data?.detail === "string") msg = data.detail;
    else if (Array.isArray(data?.detail)) msg = "Verifique os dados informados.";
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado.");
