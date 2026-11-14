import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { F, R, S } from "@/src/constants";
import { SosSheet } from "@/src/components/SosSheet";
import { Icon, OfflineBanner, Txt } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { useOnline } from "@/src/net";
import { makeStyles, useTheme } from "@/src/theme";

export default function Home() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const online = useOnline();
  const [sos, setSos] = useState(false);
  const [info, setInfo] = useState({ contacts: 0, sharing: false, unread: 0 });
  const pulse = useSharedValue(1);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1.12, { duration: 1100 }), -1, true);
  }, [pulse]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: 2 - pulse.value * 1.5 }));
  const buttonPulse = useAnimatedStyle(() => ({ transform: [{ scale: 0.96 + (pulse.value - 1) * 0.4 }] }));

  useFocusEffect(
    useCallback(() => {
      Promise.all([api("/contacts"), api("/share/active"), api("/notifications")])
        .then(([c, sh, n]) => setInfo({ contacts: c.items.length, sharing: !!sh.id, unread: n.unread }))
        .catch(() => {});
    }, []),
  );

  const first = user?.name.split(" ")[0] ?? "";

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + S.md }]}>
        <View style={{ flex: 1 }}>
          <Txt style={s.hello}>Olá, {first}</Txt>
          <Txt style={s.sub}>Sua segurança em primeiro lugar</Txt>
        </View>
        <Pressable testID="home-notifications-button" accessibilityLabel="Notificações" onPress={() => router.push("/notifications")} style={s.bell}>
          <Icon name="notifications" size={24} color={colors.onBrand} />
          {info.unread > 0 ? <View testID="home-unread-badge" style={s.badge}><Txt style={s.badgeText}>{info.unread}</Txt></View> : null}
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: bottomChrome + S.xl, gap: S.lg }}>
        <OfflineBanner online={online} />
        <Animated.View entering={FadeInDown.duration(400)} style={s.sosWrap}>
          <Animated.View style={[s.ring, ring]} />
          <Animated.View style={[s.sosButtonPulse, buttonPulse]}>
            <Pressable
              testID="sos-button"
              accessibilityRole="button"
              accessibilityLabel="Botão SOS. Toque para pedir ajuda"
              accessibilityHint="Abre as opções para pedir ajuda"
              onPress={() => setSos(true)}
              style={({ pressed }) => [s.sos, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}
            >
              <Txt style={s.sosText}>SOS</Txt>
              <Txt style={s.sosHint}>Toque para pedir ajuda</Txt>
            </Pressable>
          </Animated.View>
        </Animated.View>
        {info.contacts === 0 ? (
          <Pressable testID="home-add-contacts-hint" onPress={() => router.push("/contacts")} style={s.hint}>
            <Icon name="person-add" size={22} color={colors.onBrandTertiary} />
            <Txt style={s.hintText}>Cadastre ao menos 1 contato de confiança para o SOS avisar alguém.</Txt>
          </Pressable>
        ) : null}
        <Animated.View entering={FadeInDown.delay(120).duration(400)} style={s.grid}>
          <Tile testID="home-share-tile" icon="navigate" title="Compartilhar localização" sub={info.sharing ? "Ativo agora" : "Envie um link em tempo real"} active={info.sharing} onPress={() => router.push("/share")} big />
          <View style={s.col}>
            <Tile testID="home-contacts-tile" icon="people" title="Contatos" sub={`${info.contacts} cadastrado(s)`} onPress={() => router.push("/contacts")} />
            <Tile testID="home-report-tile" icon="megaphone" title="Relatar risco" sub="Ajude outros motoristas" onPress={() => router.push("/report")} />
          </View>
        </Animated.View>
        <Tile testID="home-history-tile" icon="time" title="Histórico de ocorrências" sub="Seus SOS e relatos" onPress={() => router.push("/history")} row />
        <Tile testID="home-community-tile" icon="chatbubbles" title="Comunidade SOS" sub="Converse e receba apoio" onPress={() => router.push("/community")} row />
      </ScrollView>
      <SosSheet visible={sos} onClose={() => setSos(false)} />
    </View>
  );
}

function Tile({ icon, title, sub, onPress, big, row, active, testID }: { icon: string; title: string; sub: string; onPress: () => void; big?: boolean; row?: boolean; active?: boolean; testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.tile, big && s.tileBig, row && s.tileRow, active && s.tileActive, pressed && { opacity: 0.85 }]}>
      <View style={[s.tileIcon, big && { backgroundColor: colors.brandPrimary }]}>
        <Icon name={icon as any} size={24} color={big ? colors.onBrandPrimary : colors.brand} />
      </View>
      <View style={row ? { flex: 1 } : undefined}>
        <Txt style={[s.tileTitle, big && { color: colors.onBrand }]}>{title}</Txt>
        <Txt style={[s.tileSub, big && { color: colors.brandTertiary }]}>{sub}</Txt>
      </View>
      {row ? <Icon name="chevron-forward" size={20} color={colors.muted} /> : null}
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: { backgroundColor: c.brand, paddingHorizontal: S.xl, paddingBottom: S.lg, flexDirection: "row", alignItems: "center" },
  hello: { fontFamily: F.black, fontSize: 24, color: c.onBrand },
  sub: { fontFamily: F.medium, fontSize: 14, color: c.brandTertiary },
  bell: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 4, right: 4, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { fontFamily: F.bold, fontSize: 11, color: c.onBrandPrimary },
  sosWrap: { alignItems: "center", justifyContent: "center", height: 260 },
  ring: { position: "absolute", width: 230, height: 230, borderRadius: 115, backgroundColor: c.brandTertiary },
  sosButtonPulse: { width: 200, height: 200 },
  sos: { width: 200, height: 200, borderRadius: 100, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", borderWidth: 8, borderColor: c.surface, shadowColor: c.brandSecondary, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  sosText: { fontFamily: F.black, fontSize: 56, lineHeight: 66, color: c.onBrandPrimary, letterSpacing: 2 },
  sosHint: { fontFamily: F.semibold, fontSize: 13, color: c.onBrandPrimary },
  hint: { flexDirection: "row", gap: S.md, alignItems: "center", backgroundColor: c.brandTertiary, borderRadius: R.md, padding: S.lg },
  hintText: { flex: 1, fontFamily: F.semibold, fontSize: 14, color: c.onBrandTertiary },
  grid: { flexDirection: "row", gap: S.md },
  col: { flex: 1, gap: S.md },
  tile: { flex: 1, backgroundColor: c.surface, borderRadius: R.md + 4, padding: S.lg, gap: S.md, borderWidth: 1, borderColor: c.border, minHeight: 120 },
  tileBig: { backgroundColor: c.brand, borderColor: c.brand, justifyContent: "space-between" },
  tileRow: { flexDirection: "row", alignItems: "center", minHeight: 76 },
  tileActive: { borderColor: c.success, borderWidth: 3 },
  tileIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: c.brandSoft, alignItems: "center", justifyContent: "center" },
  tileTitle: { fontFamily: F.bold, fontSize: 16, color: c.onSurface },
  tileSub: { fontFamily: F.medium, fontSize: 13, color: c.muted, marginTop: 2 },
}));
