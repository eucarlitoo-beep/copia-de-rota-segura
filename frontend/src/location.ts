// Localização com tratamento de permissões e falhas de GPS.
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

export type Coords = { lat: number; lng: number; accuracy: number | null };
export type LocFailure = "denied" | "consent_required" | "services_off" | "timeout" | "error";

export const FAILURE_TEXT: Record<LocFailure, string> = {
  denied: "Permissão de localização não concedida.",
  consent_required: "Ative o consentimento de localização em Perfil > Privacidade e LGPD para usar este recurso.",
  services_off: "O GPS do aparelho está desligado. Ative a localização.",
  timeout: "Sinal de GPS fraco. Tente em local aberto.",
  error: "Não foi possível obter sua localização.",
};

export function useLocationPermission() {
  const [perm, setPerm] = useState<Location.LocationPermissionResponse | null>(null);

  const check = useCallback(async () => {
    try {
      setPerm(await Location.getForegroundPermissionsAsync());
    } catch {
      setPerm(null);
    }
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener("change", (s) => s === "active" && check());
    return () => sub.remove();
  }, [check]);

  const request = useCallback(async () => {
    const r = await Location.requestForegroundPermissionsAsync();
    setPerm(r);
    return r.granted;
  }, []);

  return {
    granted: !!perm?.granted,
    undetermined: perm?.status === "undetermined",
    canAskAgain: perm?.canAskAgain ?? true,
    loaded: perm !== null,
    request,
  };
}

export async function getCurrentCoords(): Promise<{ ok: true; coords: Coords } | { ok: false; reason: LocFailure }> {
  try {
    const p = await Location.getForegroundPermissionsAsync();
    if (!p.granted) return { ok: false, reason: "denied" };
    if (!(await Location.hasServicesEnabledAsync())) return { ok: false, reason: "services_off" };
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((r) => setTimeout(() => r(null), 12000)),
    ]);
    const last = pos ? null : await Location.getLastKnownPositionAsync();
    const use = pos ?? (last && Date.now() - last.timestamp <= 2 * 60 * 1000 ? last : null);
    if (!use) return { ok: false, reason: "timeout" };
    if (!Number.isFinite(use.coords.latitude) || !Number.isFinite(use.coords.longitude) || Math.abs(use.coords.latitude) > 90 || Math.abs(use.coords.longitude) > 180) {
      return { ok: false, reason: "error" };
    }
    return { ok: true, coords: { lat: use.coords.latitude, lng: use.coords.longitude, accuracy: use.coords.accuracy ?? null } };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export const mapsLink = (c: { lat: number; lng: number }) => `https://maps.google.com/?q=${c.lat},${c.lng}`;
