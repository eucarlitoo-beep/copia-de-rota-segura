import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, AppState, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { brl, F, R, S } from "@/src/constants";
import { Btn, Icon, ScreenHeader, Txt, useToast } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { fmtDate } from "@/src/time";
import { storage } from "@/src/utils/storage";

type Plan = { id: string; name: string; price_cents: number; interval: "month" | "year"; features: string[] };
const PENDING_KEY = "pending_checkout";

export default function Plans() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user, refresh } = useAuth();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const [trial, setTrial] = useState<{ eligible: boolean; days: number } | null>(null);

  useEffect(() => {
    api<Plan[]>("/plans").then(setPlans).catch((e) => { setPlans([]); toast(errMsg(e), "error"); });
    api<{ eligible: boolean; days: number }>("/payments/trial").then(setTrial).catch(() => {});
  }, [toast]);

  const check = useCallback(async () => {
    const sid = await storage.getItem(PENDING_KEY, null as string | null);
    if (!sid) return;
    setChecking(true);
    for (let i = 0; i < 5; i++) {
      try {
        const r = await api<{ status: string }>(`/payments/status/${sid}`);
        if (r.status === "pago") {
          await storage.removeItem(PENDING_KEY);
          await refresh();
          setTrial((t) => (t ? { ...t, eligible: false } : t));
          toast("Assinatura ativada! Obrigado.", "success");
          break;
        }
        if (r.status === "expirado") {
          await storage.removeItem(PENDING_KEY);
          break;
        }
      } catch {
        break;
      }
      await new Promise((res) => setTimeout(res, 2000));
    }
    setChecking(false);
  }, [refresh, toast]);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener("change", (st) => st === "active" && check());
    return () => sub.remove();
  }, [check]);

  const subscribe = async (p: Plan) => {
    setBusy(p.id);
    try {
      const r = await api<{ url: string; session_id: string }>("/payments/checkout", { method: "POST", body: { plan_id: p.id } });
      await storage.setItem(PENDING_KEY, r.session_id);
      await WebBrowser.openBrowserAsync(r.url);
      await check();
    } catch (e) {
      toast(errMsg(e), "error");
    }
    setBusy(null);
  };

  return (
    <View style={s.root}>
      <ScreenHeader title="Assinatura" />
      <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.lg, paddingBottom: insets.bottom + S.xl }}>
        <View testID="plans-current" style={s.current}>
          <Icon name={user?.is_premium ? "star" : "star-outline"} size={24} color={colors.brandPrimary} />
          <View style={{ flex: 1 }}>
            <Txt style={s.curTitle}>{user?.is_premium ? "Você é Premium" : "Você está no plano gratuito"}</Txt>
            {user?.plan_expires_at ? <Txt style={s.curSub}>Válido até {fmtDate(user.plan_expires_at)}</Txt> : <Txt style={s.curSub}>O SOS é sempre gratuito para todos.</Txt>}
          </View>
        </View>
        <Txt testID="plans-free-note" variant="small" style={{ textAlign: "center" }}>O plano gratuito funciona sem informar cartão. As assinaturas Premium são opcionais.</Txt>
        {trial?.eligible && !user?.is_premium ? (
          <View testID="plans-trial-banner" style={s.trial}>
            <Icon name="gift" size={24} color={colors.brandPrimary} />
            <Txt style={{ flex: 1 }}>
              <Txt style={{ fontFamily: F.bold }}>{trial.days} dias grátis no Premium.</Txt> Cadastre o cartão e só pague depois do período de teste. Cancele antes e não paga nada.
            </Txt>
          </View>
        ) : null}
        {checking ? <View style={s.checking}><ActivityIndicator color={colors.brand} /><Txt>Confirmando pagamento...</Txt></View> : null}
        {!plans ? <ActivityIndicator color={colors.brand} size="large" /> : plans.map((p) => {
          const isCurrent = (user?.plan ?? "gratuito") === p.id;
          const featured = p.id === "premium_anual";
          return (
            <View key={p.id} testID={`plan-card-${p.id}`} style={[s.card, featured && s.cardFeatured]}>
              {featured ? <View style={s.tag}><Txt style={s.tagText}>MELHOR VALOR</Txt></View> : null}
              <Txt style={s.planName}>{p.name}</Txt>
              <Txt testID={`plan-price-${p.id}`} style={s.price}>
                {p.price_cents === 0 ? "Grátis" : brl(p.price_cents)}
                {p.price_cents > 0 ? <Txt style={s.per}> /{p.interval === "year" ? "ano" : "mês"}</Txt> : null}
              </Txt>
              {p.features.map((f) => (
                <View key={f} style={s.feat}><Icon name="checkmark-circle" size={20} color={colors.success} /><Txt style={{ flex: 1 }}>{f}</Txt></View>
              ))}
              {p.price_cents > 0 ? (
                <Btn testID={`plan-subscribe-${p.id}`} label={isCurrent ? "Plano atual" : trial?.eligible && !user?.is_premium ? `Testar ${trial.days} dias grátis` : "Assinar com cartão"} icon="card" onPress={() => subscribe(p)} loading={busy === p.id} disabled={isCurrent || !!busy} style={{ marginTop: S.md }} />
              ) : null}
            </View>
          );
        })}
        <Txt variant="small" style={{ textAlign: "center" }}>
          Pagamento seguro processado pela Stripe. Não armazenamos dados do seu cartão. Cancele quando quiser.
        </Txt>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  current: { flexDirection: "row", gap: S.md, alignItems: "center", backgroundColor: c.brand, borderRadius: R.md, padding: S.lg },
  curTitle: { fontFamily: F.bold, fontSize: 16, color: c.onBrand },
  curSub: { fontFamily: F.medium, fontSize: 13, color: c.brandTertiary },
  trial: { flexDirection: "row", gap: S.md, alignItems: "center", backgroundColor: c.surface, borderRadius: R.md, padding: S.lg, borderWidth: 2, borderColor: c.brandPrimary },
  checking: { flexDirection: "row", gap: S.sm, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: c.surface, borderRadius: R.lg, padding: S.xl, gap: S.sm, borderWidth: 1, borderColor: c.border },
  cardFeatured: { borderColor: c.brandPrimary, borderWidth: 2 },
  tag: { alignSelf: "flex-start", backgroundColor: c.brandPrimary, borderRadius: R.pill, paddingHorizontal: S.md, paddingVertical: 4 },
  tagText: { fontFamily: F.black, fontSize: 11, color: c.onBrandPrimary, letterSpacing: 1 },
  planName: { fontFamily: F.bold, fontSize: 18, color: c.brand },
  price: { fontFamily: F.black, fontSize: 32, color: c.onSurface },
  per: { fontFamily: F.medium, fontSize: 16, color: c.muted },
  feat: { flexDirection: "row", gap: S.sm, alignItems: "center" },
}));
