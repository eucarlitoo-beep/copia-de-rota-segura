// Atualização da localização compartilhada com a tela bloqueada (somente na versão instalada).
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { BACKEND_URL, TOKEN_KEY } from "@/src/api";
import { storage } from "@/src/utils/storage";

export const BG_SHARE_TASK = "rota-segura-background-share";
const SHARE_ID_KEY = "bg_share_id";

// Expo Go e web não suportam localização em segundo plano.
export const backgroundSupported =
  Platform.OS !== "web" && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

if (backgroundSupported) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(BG_SHARE_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const pos = data.locations[data.locations.length - 1];
    const [shareId, token] = await Promise.all([
      storage.getItem(SHARE_ID_KEY, null as string | null),
      storage.secureGet(TOKEN_KEY, null as string | null),
    ]);
    if (!shareId || !token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/share/${shareId}/location`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      });
      if (res.status === 410 || res.status === 401) await stopBackgroundShare();
    } catch {
      // sem rede: tenta de novo na próxima posição
    }
  });
}

/** Retorna true se a atualização em segundo plano foi ativada. */
export async function startBackgroundShare(shareId: string): Promise<boolean> {
  if (!backgroundSupported) return false;
  const bg = await Location.getBackgroundPermissionsAsync();
  if (!bg.granted) return false;
  await storage.setItem(SHARE_ID_KEY, shareId);
  if (await Location.hasStartedLocationUpdatesAsync(BG_SHARE_TASK).catch(() => false)) return true;
  await Location.startLocationUpdatesAsync(BG_SHARE_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 15000,
    distanceInterval: 25,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "ROTA SEGURA",
      notificationBody: "Compartilhando sua localização com quem você confia.",
    },
  });
  return true;
}

export async function stopBackgroundShare() {
  await storage.removeItem(SHARE_ID_KEY);
  if (!backgroundSupported) return;
  if (await Location.hasStartedLocationUpdatesAsync(BG_SHARE_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(BG_SHARE_TASK).catch(() => {});
  }
}
