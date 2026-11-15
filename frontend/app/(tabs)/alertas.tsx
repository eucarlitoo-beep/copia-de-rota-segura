import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import Animated, { FadeInDown, LinearTransition, ZoomIn } from "react-native-reanimated";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errMsg } from "@/src/api";
import { CATEGORIES, catOf, F, R, S } from "@/src/constants";
import { Btn, Empty, Icon, OfflineBanner, Sheet, Txt, useToast } from "@/src/components/ui";
import { RiskChart } from "@/src/components/RiskChart";
import { usesNativeTabs } from "@/src/navigation";
import { useOnline } from "@/src/net";
import { makeStyles, useTheme } from "@/src/theme";
import { timeAgo } from "@/src/time";

type Alert = { id: string; category: string; description: string; created_at: string; confirmations: number; confirmed_by_me: boolean; flagged_by_me: boolean; is_mine: boolean; lat: number; lng: number };

const FLAG_REASONS = [
  { key: "falso", label: "Informação falsa" },
  { key: "ofensivo", label: "Ofensivo ou acusatório" },
  { key: "dados_pessoais", label: "Expõe dados pessoais" },
  { key: "duplicado", label: "Duplicado" },
  { key: "outro", label: "Outro motivo" },
];

export default function Alertas() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const online = useOnline();
  const toast = useToast();
  const [cat, setCat] = useState<string | null>(null);
  const [items, setItems] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [flagging, setFlagging] = useState<Alert | null>(null);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await api<Alert[]>("/alerts"));
    } catch (e) {
      setError(errMsg(e));
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pick = (c: string | null) => {
    setCat(c);
  };

  const confirm = async (a: Alert) => {
    try {
      await api(`/alerts/${a.id}/confirm`, { method: "POST" });
      setItems((p) => p.map((x) => (x.id === a.id ? { ...x, confirmations: x.confirmations + 1, confirmed_by_me: true } : x)));
      toast("Obrigado por confirmar.", "success");
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };

  const flag = async (reason: string) => {
    if (!flagging) return;
    try {
      await api(`/alerts/${flagging.id}/flag`, { method: "POST", body: { reason } });
      setItems((p) => p.map((x) => (x.id === flagging.id ? { ...x, flagged_by_me: true } : x)));
      toast("Denúncia enviada para a moderação.", "success");
    } catch (e) {
      toast(errMsg(e), "error");
    }
    setFlagging(null);
  };

  const chips = [{ key: null, label: "Todos" }, ...CATEGORIES.map((c) => ({ key: c.key, label: c.label }))];
  const visibleItems = cat ? items.filter((item) => item.category === cat) : items;

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + S.md }]}>
        <View style={s.headRow}>
          <Txt style={s.title}>Alertas</Txt>
          <Pressable testID="alerts-report-button" onPress={() => router.push("/report")} style={s.newBtn}>
            <Icon name="add" size={20} color={colors.onBrandPrimary} />
            <Txt style={s.newText}>Relatar</Txt>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow} contentContainerStyle={s.chipContent}>
          {chips.map((c, index) => {
            const on = cat === c.key;
            return (
              <Animated.View key={c.label} entering={FadeInDown.delay(index * 35).duration(280)} layout={LinearTransition.duration(250)}>
                <Pressable testID={`alerts-chip-${c.key ?? "todos"}`} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => pick(c.key)} style={[s.chip, on && s.chipOn]}>
                  {c.key ? <Icon name={CATEGORIES.find((item) => item.key === c.key)?.icon as any} size={15} color={on ? colors.brand : colors.onBrand} /> : null}
                  <Txt style={[s.chipText, on && { color: colors.brand }]}>{c.label}</Txt>
                </Pressable>
              </Animated.View>
            );
          })}
        </ScrollView>
      </View>
      <View style={{ paddingHorizontal: S.lg, paddingTop: online ? 0 : S.md }}><OfflineBanner online={online} /></View>
      {loading ? (
        <View style={s.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : error ? (
        <View style={s.center} testID="alerts-error">
          <Empty icon="cloud-offline" title="Não foi possível carregar os alertas." text={error} />
          <Btn testID="alerts-retry" label="Tentar novamente" variant="navy" onPress={() => { setLoading(true); load(); }} />
        </View>
      ) : (
        <FlatList
          testID="alerts-list"
          data={visibleItems}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: S.lg, gap: S.md, paddingBottom: bottomChrome + S.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
          ListHeaderComponent={<View style={{ gap: S.md }}><Txt variant="small">Relatos moderados das últimas 72h. Não identificamos pessoas — apenas situações de risco.</Txt><RiskChart alerts={items} /></View>}
          ListEmptyComponent={<Empty testID="alerts-empty" icon="sunny" title="Nenhuma ocorrência reportada" text="Nenhum alerta aprovado nesta categoria nas últimas 72 horas." />}
          renderItem={({ item, index }) => {
            const c = catOf(item.category);
            const tone = colors[c.color] as string;
            return (
              <View testID={`alert-card-${item.id}`} style={[s.card, { borderLeftColor: tone }]}>
                <View style={s.cardHead}>
                  <Animated.View entering={ZoomIn.delay(Math.min(index, 8) * 35).duration(320)} style={[s.catIcon, { backgroundColor: tone }]}>
                    <Icon name={c.icon as any} size={18} color={colors.onError} />
                  </Animated.View>
                  <Txt style={s.catLabel}>{c.label}</Txt>
                  <Txt variant="small">{timeAgo(item.created_at)}</Txt>
                </View>
                <Txt style={{ marginVertical: S.md }}>{item.description}</Txt>
                {item.is_mine ? <Txt testID={`alert-mine-${item.id}`} variant="small">Seu relato · {item.confirmations} confirmação(ões)</Txt> : <View style={s.actions}>
                  <Pressable testID={`alert-confirm-${item.id}`} disabled={item.confirmed_by_me} onPress={() => confirm(item)} style={[s.act, item.confirmed_by_me && s.actOn]}>
                    <Icon name="checkmark-done" size={18} color={item.confirmed_by_me ? colors.onBrand : colors.brand} />
                    <Txt style={[s.actText, item.confirmed_by_me && { color: colors.onBrand }]}>Ainda ativo ({item.confirmations})</Txt>
                  </Pressable>
                  <Pressable testID={`alert-flag-${item.id}`} disabled={item.flagged_by_me} onPress={() => setFlagging(item)} style={[s.act, item.flagged_by_me && { opacity: 0.5 }]}>
                    <Icon name="flag" size={18} color={colors.muted} />
                    <Txt style={[s.actText, { color: colors.muted }]}>{item.flagged_by_me ? "Denunciado" : "Denunciar"}</Txt>
                  </Pressable>
                </View>}
              </View>
            );
          }}
        />
      )}
      <Sheet visible={!!flagging} onClose={() => setFlagging(null)} testID="flag-sheet">
        <Txt variant="h2">Denunciar alerta</Txt>
        <Txt style={{ marginVertical: S.sm }}>Alertas com 3 denúncias voltam para revisão da moderação.</Txt>
        {FLAG_REASONS.map((r) => (
          <Pressable key={r.key} testID={`flag-reason-${r.key}`} onPress={() => flag(r.key)} style={s.reason}>
            <Txt variant="label" style={{ marginBottom: 0 }}>{r.label}</Txt>
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: { backgroundColor: c.brand },
  headRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: S.xl, paddingBottom: S.sm },
  title: { flex: 1, fontFamily: F.black, fontSize: 26, color: c.onBrand },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.brandPrimary, borderRadius: R.pill, paddingHorizontal: S.lg, minHeight: 44 },
  newText: { fontFamily: F.bold, fontSize: 14, color: c.onBrandPrimary },
  chipRow: { height: 56, flexGrow: 0 },
  chipContent: { gap: S.sm, paddingHorizontal: S.lg, alignItems: "center" },
  chip: { height: 36, flexShrink: 0, paddingHorizontal: S.lg, borderRadius: R.pill, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.35)", alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: c.surface, borderColor: c.surface },
  chipText: { fontFamily: F.semibold, fontSize: 14, color: c.onBrand },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: S.xl },
  card: { backgroundColor: c.surface, borderRadius: R.md, padding: S.lg, borderLeftWidth: 6, borderWidth: 1, borderColor: c.border },
  cardHead: { flexDirection: "row", alignItems: "center", gap: S.sm },
  catIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  catLabel: { flex: 1, fontFamily: F.bold, fontSize: 16, color: c.onSurface },
  actions: { flexDirection: "row", gap: S.sm },
  act: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: S.md, borderRadius: R.sm + 4, backgroundColor: c.surfaceSecondary },
  actOn: { backgroundColor: c.brand },
  actText: { fontFamily: F.semibold, fontSize: 13, color: c.brand },
  reason: { minHeight: 56, justifyContent: "center", paddingHorizontal: S.lg, borderRadius: R.md, backgroundColor: c.surfaceSecondary, marginTop: S.sm },
}));
