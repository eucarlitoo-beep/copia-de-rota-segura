import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { DRIVER_TYPES, F, R, S } from "@/src/constants";
import { ConfirmSheet, Icon, Txt } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";

const COVER = "https://images.unsplash.com/photo-1679193559894-5e27935d00c5?crop=entropy&cs=srgb&fm=jpg&q=70&w=900";

export default function Perfil() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, refresh } = useAuth();
  const [unread, setUnread] = useState(0);
  const [confirmOut, setConfirmOut] = useState(false);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  useFocusEffect(
    useCallback(() => {
      refresh();
      api("/notifications").then((n) => setUnread(n.unread)).catch(() => {});
    }, [refresh]),
  );

  if (!user) return null;
  const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const type = DRIVER_TYPES.find((t) => t.key === user.driver_type)?.label;

  const rows: { icon: string; label: string; to: string; id: string; badge?: number }[] = [
    { icon: "create", label: "Editar perfil", to: "/profile-edit", id: "edit" },
    { icon: "people", label: "Contatos de emergência", to: "/contacts", id: "contacts" },
    { icon: "mic", label: "Palavra-chave do SOS", to: "/keyword", id: "keyword" },
    { icon: "chatbox-ellipses", label: "Sugestões e melhorias", to: "/feedback", id: "feedback" },
    { icon: "time", label: "Histórico de ocorrências", to: "/history", id: "history" },
    { icon: "notifications", label: "Notificações", to: "/notifications", id: "notifications", badge: unread },
    { icon: "card", label: "Assinatura ROTA SEGURA", to: "/plans", id: "plans" },
    { icon: "lock-closed", label: "Privacidade e LGPD", to: "/privacy", id: "privacy" },
  ];
  if (user.role === "admin") rows.push({ icon: "shield-half", label: "Painel administrativo", to: "/admin", id: "admin" });

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottomChrome + S.xl }}>
        <View style={s.cover}>
          <Image source={COVER} style={StyleFill} contentFit="cover" />
          <View style={[StyleFill, { backgroundColor: colors.scrim }]} />
          <View style={[s.coverContent, { paddingTop: insets.top + S.xl }]}>
            <View style={s.avatar}><Txt style={s.initials}>{initials}</Txt></View>
            <Txt testID="profile-name" style={s.name}>{user.name}</Txt>
            <Txt style={s.meta}>Motorista de {type?.toLowerCase()} {user.city ? `· ${user.city}` : ""}</Txt>
            <View testID="profile-plan-badge" style={[s.plan, user.is_premium && { backgroundColor: colors.brandPrimary }]}>
              <Icon name={user.is_premium ? "star" : "star-outline"} size={14} color={colors.onBrand} />
              <Txt style={s.planText}>{user.is_premium ? "Premium" : "Plano gratuito"}</Txt>
            </View>
          </View>
        </View>
        <View style={s.list}>
          {rows.map((r) => (
            <Pressable key={r.id} testID={`profile-row-${r.id}`} onPress={() => router.push(r.to as any)} style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surfaceSecondary }]}>
              <View style={s.rowIcon}><Icon name={r.icon as any} size={22} color={colors.brand} /></View>
              <Txt style={s.rowLabel}>{r.label}</Txt>
              {r.badge ? <View style={s.badge}><Txt style={s.badgeText}>{r.badge}</Txt></View> : null}
              <Icon name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          ))}
          <Pressable testID="profile-logout" onPress={() => setConfirmOut(true)} style={s.row}>
            <View style={[s.rowIcon, { backgroundColor: colors.brandTertiary }]}><Icon name="log-out" size={22} color={colors.error} /></View>
            <Txt style={[s.rowLabel, { color: colors.error }]}>Sair da conta</Txt>
          </Pressable>
        </View>
        <Txt variant="small" style={{ textAlign: "center", marginTop: S.lg, paddingHorizontal: S.xl }}>
          ROTA SEGURA v1.0 · App independente, sem vínculo com Uber, 99 ou inDrive.
        </Txt>
      </ScrollView>
      <ConfirmSheet
        testID="logout-sheet"
        visible={confirmOut}
        title="Sair da conta?"
        message="Você precisará entrar novamente para usar o SOS com seus contatos."
        confirmLabel="Sair"
        danger
        onClose={() => setConfirmOut(false)}
        onConfirm={async () => { setConfirmOut(false); await logout(); router.replace("/login"); }}
      />
    </View>
  );
}

const StyleFill = { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 };

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  cover: { backgroundColor: c.brand, overflow: "hidden" },
  coverContent: { alignItems: "center", paddingBottom: S.xl, paddingHorizontal: S.xl },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: c.surface },
  initials: { fontFamily: F.black, fontSize: 32, color: c.onBrandPrimary },
  name: { fontFamily: F.black, fontSize: 22, color: c.onBrand, marginTop: S.md },
  meta: { fontFamily: F.medium, fontSize: 14, color: c.brandTertiary, marginTop: 2 },
  plan: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: S.md, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: R.pill, paddingHorizontal: S.md, paddingVertical: 6 },
  planText: { fontFamily: F.bold, fontSize: 13, color: c.onBrand },
  list: { margin: S.lg, backgroundColor: c.surface, borderRadius: R.md + 4, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, minHeight: 64, paddingHorizontal: S.lg, borderBottomWidth: 1, borderBottomColor: c.divider },
  rowIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.brandSoft, alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1, fontFamily: F.semibold, fontSize: 16, color: c.onSurface },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { fontFamily: F.bold, fontSize: 12, color: c.onBrandPrimary },
}));
