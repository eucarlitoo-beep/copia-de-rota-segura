import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Platform, View } from "react-native";
import Constants from "expo-constants";
import { AndroidImportance } from "expo-notifications";
import * as ExpoNotifications from "expo-notifications";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { F, R, S } from "@/src/constants";
import { Btn, Empty, Icon, ScreenHeader, Txt } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { timeAgo } from "@/src/time";
import { storage } from "@/src/utils/storage";

type N = { id: string; title: string; body: string; kind: string; read: boolean; created_at: string };
const PUSH_TOKEN_KEY = "push_token";

ExpoNotifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export default function Notifications() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<N[] | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    storage.secureGet(PUSH_TOKEN_KEY, null as string | null).then((token) => setPushEnabled(Boolean(token)));
  }, []);

  const enablePush = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Notificação no celular", "Abra este app em um Android ou iPhone instalado para ativar notificações push.");
      return;
    }
    const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      Alert.alert("Configuração necessária", "O aplicativo ainda precisa de um ID de projeto EAS para gerar o token de push. Configure o projeto e gere uma build de desenvolvimento.");
      return;
    }
    setPushBusy(true);
    try {
      const permission = await ExpoNotifications.getPermissionsAsync();
      const granted = permission.granted || (await ExpoNotifications.requestPermissionsAsync()).granted;
      if (!granted) {
        Alert.alert("Permissão não concedida", "Ative notificações para o ROTA SEGURA nas configurações do celular.");
        return;
      }
      if (Platform.OS === "android") {
        await ExpoNotifications.setNotificationChannelAsync("default", {
          name: "Alertas de segurança", importance: AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 150, 250], lightColor: "#E33D4F",
        });
      }
      const token = (await ExpoNotifications.getExpoPushTokenAsync({ projectId })).data;
      await api("/push/token", { method: "POST", body: { token } });
      await storage.secureSet(PUSH_TOKEN_KEY, token);
      setPushEnabled(true);
      Alert.alert("Push ativado", "Este aparelho está cadastrado para receber notificações do ROTA SEGURA.");
    } catch (error) {
      Alert.alert("Não foi possível ativar", error instanceof Error ? error.message : "Tente novamente mais tarde.");
    } finally {
      setPushBusy(false);
    }
  };

  const disablePush = async () => {
    setPushBusy(true);
    try {
      const token = await storage.secureGet(PUSH_TOKEN_KEY, null as string | null);
      if (token) await api("/push/token", { method: "DELETE", body: { token } });
      await storage.secureRemove(PUSH_TOKEN_KEY);
      setPushEnabled(false);
      Alert.alert("Push desativado", "Este aparelho foi removido da lista de notificações.");
    } catch (error) {
      Alert.alert("Não foi possível desativar", error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      setPushBusy(false);
    }
  };

  useEffect(() => {
    api<{ items: N[] }>("/notifications")
      .then((r) => {
        setItems(r.items);
        api("/notifications/read", { method: "POST" }).catch(() => {});
      })
      .catch(() => setItems([]));
  }, []);

  const tone = (k: string) => (k === "success" ? colors.success : k === "warning" ? colors.warning : colors.brand);

  return (
    <View style={s.root}>
      <ScreenHeader title="Notificações" />
      {!items ? (
        <ActivityIndicator style={{ marginTop: S.xxl }} color={colors.brand} size="large" />
      ) : (
        <FlatList
          testID="notifications-list"
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: S.lg, gap: S.sm, paddingBottom: insets.bottom + S.xl }}
          ListHeaderComponent={<View style={s.pushCard}><Icon name="phone-portrait-outline" size={24} color={colors.brand} /><View style={{ flex: 1, gap: S.xs }}><Txt style={s.title}>Notificações no celular</Txt><Txt variant="small">{pushEnabled ? "Este aparelho está cadastrado para receber alertas." : "Ative alertas push para receber avisos de segurança neste aparelho."}</Txt><Btn testID={pushEnabled ? "push-disable" : "push-enable"} label={pushEnabled ? "Desativar notificações push" : "Ativar notificações push"} icon={pushEnabled ? "notifications-off-outline" : "notifications-outline"} onPress={pushEnabled ? disablePush : enablePush} loading={pushBusy} small /></View></View>}
          ListEmptyComponent={<Empty testID="notifications-empty" icon="notifications-off-outline" title="Sem notificações" />}
          renderItem={({ item }) => (
            <View testID={`notification-${item.id}`} style={[s.card, !item.read && { borderColor: colors.brandPrimary }]}>
              <Icon name={item.kind === "success" ? "checkmark-circle" : item.kind === "warning" ? "alert-circle" : "information-circle"} size={24} color={tone(item.kind)} />
              <View style={{ flex: 1 }}>
                <Txt style={s.title}>{item.title}</Txt>
                <Txt variant="small">{item.body}</Txt>
                <Txt variant="small" style={{ marginTop: 4 }}>{timeAgo(item.created_at)}</Txt>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  pushCard: { flexDirection: "row", alignItems: "flex-start", gap: S.md, backgroundColor: c.surface, borderRadius: R.md, padding: S.lg, marginBottom: S.sm, borderWidth: 1, borderColor: c.border },
  card: { flexDirection: "row", gap: S.md, backgroundColor: c.surface, borderRadius: R.md, padding: S.lg, borderWidth: 1.5, borderColor: c.border },
  title: { fontFamily: F.bold, fontSize: 15, color: c.onSurface },
}));
