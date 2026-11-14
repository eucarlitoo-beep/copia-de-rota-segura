import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errMsg } from "@/src/api";
import { catOf, F, R, S } from "@/src/constants";
import { Btn, Empty, Icon, ScreenHeader, Txt } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { fmtDate } from "@/src/time";

type Sos = { id: string; lat?: number; lng?: number; status: string; created_at: string; actions: { action: string; at: string }[] };
type Rep = { id: string; category: string; description: string; status: string; created_at: string; moderation_reason?: string };

const ACTION_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp aberto", sms: "SMS", email: "E-mail enviado", ligacao_190: "Ligação 190", ligacao_192: "Ligação 192",
  ligacao_193: "Ligação 193", resolvido: "Encerrado (seguro)", cancelado: "Cancelado",
};
const STATUS: Record<string, string> = { pendente: "Em moderação", aprovado: "Publicado", rejeitado: "Não publicado", aberto: "Aberto", resolvido: "Encerrado", cancelado: "Cancelado" };

export default function History() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"sos" | "reports">("sos");
  const [data, setData] = useState<{ sos: Sos[]; reports: Rep[] } | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    setError("");
    api("/incidents").then(setData).catch((e) => setError(errMsg(e)));
  };
  useEffect(load, []);

  const statusColor = (st: string) => (st === "aprovado" || st === "resolvido" ? colors.success : st === "rejeitado" ? colors.error : colors.warning);

  return (
    <View style={s.root}>
      <ScreenHeader title="Histórico" />
      <View style={s.seg}>
        {(["sos", "reports"] as const).map((k) => (
          <Pressable key={k} testID={`history-tab-${k}`} onPress={() => setTab(k)} style={[s.segBtn, tab === k && s.segOn]}>
            <Txt style={[s.segText, tab === k && { color: colors.onBrand }]}>{k === "sos" ? "Meus SOS" : "Meus relatos"}</Txt>
          </Pressable>
        ))}
      </View>
      {error ? (
        <View style={{ padding: S.xl }}><Empty icon="cloud-offline" title="Erro ao carregar" text={error} /><Btn testID="history-retry" label="Tentar novamente" variant="navy" onPress={load} /></View>
      ) : !data ? (
        <ActivityIndicator style={{ marginTop: S.xxl }} color={colors.brand} size="large" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.md, paddingBottom: insets.bottom + S.xl }}>
          {tab === "sos" ? (
            data.sos.length === 0 ? <Empty testID="history-sos-empty" icon="shield-checkmark-outline" title="Nenhum SOS acionado" /> :
            data.sos.map((i) => (
              <View key={i.id} testID={`history-sos-${i.id}`} style={s.card}>
                <View style={s.head}>
                  <Icon name="alert-circle" size={22} color={colors.brandPrimary} />
                  <Txt style={s.title}>SOS · {fmtDate(i.created_at)}</Txt>
                  <Txt style={[s.status, { color: statusColor(i.status) }]}>{STATUS[i.status] ?? i.status}</Txt>
                </View>
                {i.actions.length ? <Txt variant="small">{i.actions.map((a) => ACTION_LABEL[a.action] ?? a.action).join(" · ")}</Txt> : <Txt variant="small">Nenhuma ação registrada</Txt>}
                {i.lat != null ? (
                  <Pressable testID={`history-sos-map-${i.id}`} onPress={() => Linking.openURL(`https://maps.google.com/?q=${i.lat},${i.lng}`)}>
                    <Txt style={s.link}>Ver local no mapa</Txt>
                  </Pressable>
                ) : <Txt variant="small">Sem localização</Txt>}
              </View>
            ))
          ) : data.reports.length === 0 ? <Empty testID="history-reports-empty" icon="megaphone-outline" title="Nenhum relato enviado" /> :
            data.reports.map((r) => (
              <View key={r.id} testID={`history-report-${r.id}`} style={s.card}>
                <View style={s.head}>
                  <Icon name={catOf(r.category).icon as any} size={22} color={colors[catOf(r.category).color] as string} />
                  <Txt style={s.title}>{catOf(r.category).label}</Txt>
                  <Txt style={[s.status, { color: statusColor(r.status) }]}>{STATUS[r.status]}</Txt>
                </View>
                <Txt>{r.description}</Txt>
                <Txt variant="small">{fmtDate(r.created_at)}{r.moderation_reason ? ` · Motivo: ${r.moderation_reason}` : ""}</Txt>
              </View>
            ))}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  seg: { flexDirection: "row", margin: S.lg, marginBottom: 0, backgroundColor: c.surfaceTertiary, borderRadius: R.md, padding: 4 },
  segBtn: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: R.sm + 4 },
  segOn: { backgroundColor: c.brand },
  segText: { fontFamily: F.semibold, fontSize: 14, color: c.onSurface },
  card: { backgroundColor: c.surface, borderRadius: R.md, padding: S.lg, gap: S.sm, borderWidth: 1, borderColor: c.border },
  head: { flexDirection: "row", alignItems: "center", gap: S.sm },
  title: { flex: 1, fontFamily: F.bold, fontSize: 15, color: c.onSurface },
  status: { fontFamily: F.bold, fontSize: 12 },
  link: { fontFamily: F.bold, color: c.brandSecondary, fontSize: 14 },
}));
