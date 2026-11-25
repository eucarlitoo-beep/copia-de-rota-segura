import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { api, setTransientAuthToken, setUnauthorizedHandler, TOKEN_KEY } from "@/src/api";
import { storage } from "@/src/utils/storage";

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  driver_type: "aplicativo" | "taxi" | "profissional";
  vehicle: string;
  city: string;
  role: "user" | "admin";
  plan: string;
  plan_expires_at: string | null;
  is_premium: boolean;
  location_consent: boolean;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  authError: string;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  socialLogin: (provider: "google" | "apple", idToken: string, nonce: string, remember?: boolean) => Promise<void>;
  googleSession: (sessionId: string, remember?: boolean) => Promise<void>;
  register: (data: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
};

const Ctx = createContext<AuthCtx>({} as AuthCtx);

// Um session_id do Google só pode ser trocado uma vez.
const usedSessionIds = new Set<string>();
export const extractSessionId = (url: string | null | undefined) => url?.match(/[?#&]session_id=([^&#]+)/)?.[1] ?? null;

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  const logout = useCallback(async () => {
    const pushToken = await storage.secureGet("push_token", null as string | null);
    if (pushToken) {
      let timeout: ReturnType<typeof setTimeout>;
      await Promise.race([
        api("/push/token", { method: "DELETE", body: { token: pushToken } }).catch(() => {}),
        new Promise<void>((resolve) => { timeout = setTimeout(resolve, 1500); }),
      ]);
      clearTimeout(timeout!);
      await storage.secureRemove("push_token");
    }
    await storage.secureRemove(TOKEN_KEY);
    setTransientAuthToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setUser(await api<User>("/auth/me"));
    } catch {
      // offline: mantém o usuário atual
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
    });
    (async () => {
      // Web: retorno do login Google (Emergent) chega como #session_id=... na URL.
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const sid = extractSessionId(window.location.href);
        if (sid) {
          try {
            await googleSessionRef.current(sid);
            const url = new URL(window.location.href);
            url.searchParams.delete("session_id");
            url.hash = url.hash.replace(/[#&]?session_id=[^&]*/, "");
            window.history.replaceState(window.history.state, "", url.toString());
            setLoading(false);
            return;
          } catch (e) {
            setAuthError(e instanceof Error ? e.message : "Não foi possível concluir o acesso Google.");
          }
        }
      }
      const token = await storage.secureGet(TOKEN_KEY, null as string | null);
      setTransientAuthToken(null);
      if (token) {
        await refresh();
      } else {
        setUser(null);
      }
      setLoading(false);
    })();
  }, [logout, refresh]);

  const save = async (r: { token: string; user: User }, remember = true) => {
    if (remember) {
      await storage.secureSet(TOKEN_KEY, r.token);
      setTransientAuthToken(null);
    } else {
      await storage.secureRemove(TOKEN_KEY);
      setTransientAuthToken(r.token);
    }
    setUser(r.user);
  };

  const login = async (email: string, password: string, remember = true) =>
    save(await api("/auth/login", { method: "POST", body: { email, password } }), remember);
  const socialLogin: AuthCtx["socialLogin"] = async (provider, idToken, nonce, remember = true) =>
    save(await api("/auth/social", { method: "POST", body: { provider, id_token: idToken, nonce } }), remember);
  const register = async (data: Record<string, unknown>) =>
    save(await api("/auth/register", { method: "POST", body: data }));
  const googleSession = async (sessionId: string, remember = true) => {
    if (usedSessionIds.has(sessionId)) return;
    usedSessionIds.add(sessionId);
    await save(await api("/auth/session", { method: "POST", body: { session_id: sessionId } }), remember);
  };
  const googleSessionRef = useRef(googleSession);
  googleSessionRef.current = googleSession;

  return <Ctx.Provider value={{ user, loading, authError, login, socialLogin, googleSession, register, logout, refresh, setUser }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
