import * as Clipboard from "expo-clipboard";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, BACKEND_URL, errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { F, R, S } from "@/src/constants";
import { Banner, Btn, Card, Icon, PermissionCard, ScreenHeader, Txt, useToast } from "@/src/components/ui";
import { FAILURE_TEXT, getCurrentCoords, LocFailure, useLocationPermission } from "@/src/location";
import { useOnline } from "@/src/net";
import { makeStyles, useTheme } from "@/src/theme";
import { fmtDate } from "@/src/time";

type ShareT = { id: string; token: string; expires_at: string; updated_at: string };

export default function ShareScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const router = useRouter();
  const online = useOnline();
  const { user } = useAuth();
  const perm = useLocationPermission();
  const [share, setShare] = useState<ShareT | null>(null);
  const [hours, setHours] = useState(1);
  const [busy, setBusy] = useState(false);
  const [gpsErr, setGpsErr] = useState<LocFailure | null>(null);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const watch = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    if (!user?.location_consent) return;
    api<ShareT | Record<string, never>>("/share/active").then((r) => ("id" in r ? setShare(r as ShareT) : null)).catch(() => {});
  }, [user?.location_consent]);

  const stopWatch = () => {
    watch.current?.remove();
    watch.current = null;
  };

  // Atualiza a posição enquanto a tela estiver aberta (primeiro plano).
  const startWatch = useCallback(async (sh: ShareT) => {
    stopWatch();
    try {
      watch.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 15000, distanceInterval: 25 },
        (pos) => {
          api(`/share/${sh.id}/location`, { method: "PUT", body: { lat: pos.coords.latitude, lng: pos.coords.longitude } })
            .then(() => setLastSent(new Date().toISOString()))
            .catch((e) => {
              if (e.status === 410 || e.status === 403) {
                setShare(null);
                stopWatch();
              }
            });
        },
      );
    } catch {
      setGpsErr("error");
    }
  }, []);

  useEffect(() => {
    if (!user?.location_consent) {
      stopWatch();
      setShare(null);
      return stopWatch;
    }
    if (share && perm.granted) startWatch(share);
    return stopWatch;
  }, [share, perm.granted, user?.location_consent, startWatch]);

  // A fragment is not sent in the HTTP request, keeping the bearer token out
  // of routine server/proxy access logs and referrer headers.
  const link = share ? `${BACKEND_URL}/api/public/share#${share.token}` : "";

  const start = async () => {
    if (!user?.location_consent) {
      setGpsErr("consent_required");
      return;
    }
    setBusy(true);
    setGpsErr(null);
    const r = await getCurrentCoords();
    if (!r.ok) {
      setGpsErr(r.reason);
      setBusy(false);
      return;
    }
    try {
      const sh = await api<ShareT>("/share", { method: "POST", body: { lat: r.coords.lat, lng: r.coords.lng, hours } });
      setShare(sh);
      setLastSent(sh.updated_at);
      toast("Link criado. Envie para quem você confia.", "success");
    } catch (e) {
      toast(errMsg(e), "error");
    }
    setBusy(false);
  };

  const stop = async () => {
    if (!share) return;
    stopWatch();
    await api(`/share/${share.id}`, { method: "DELETE" }).catch(() => {});
    setShare(null);
    toast("Compartilhamento encerrado.", "info");
  };

  const send = () =>
    Share.share({ message: `${user?.name.split(" ")[0]} está compartilhando a localização em tempo real pelo ROTA SEGURA: ${link}` }).catch(() => {});

  const copy = async () => {
    await Clipboard.setStringAsync(link);
    toast("Link copiado.", "success");
  };

  const options = user?.is_premium ? [1, 2, 4, 8] : [1];

  return (
    <View style={s.root}>
      <ScreenHeader title="Compartilhar localização" />
      <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.lg, paddingBottom: insets.bottom + S.xl }}>
        {!online ? <Banner testID="share-offline-banner" text="Sem internet. O link não será atualizado até a conexão voltar." /> : null}
        {!user?.location_consent ? (
          <Card testID="share-consent-card">
            <Txt variant="h2">Consentimento necessário</Txt>
            <Txt style={{ marginVertical: S.md }}>O compartilhamento envia sua localização precisa para quem receber o link. Ative essa finalidade em Privacidade e LGPD antes de continuar.</Txt>
            <Btn testID="share-consent-settings" label="Abrir Privacidade" icon="shield-checkmark" onPress={() => router.push("/privacy")} />
          </Card>
        ) : !perm.loaded ? null : !perm.granted ? (
          <PermissionCard
            testID="share-permission-card"
            title="Permitir localização"
            text="Para gerar um link de acompanhamento em tempo real, o ROTA SEGURA precisa da sua localização enquanto esta tela estiver aberta. Ela só é vista por quem receber o link."
            canAskAgain={perm.canAskAgain}
            onAllow={perm.request}
          />
        ) : share ? (
          <Card testID="share-active-card" style={{ borderColor: colors.success, borderWidth: 2 }}>
            <View style={s.live}><View style={s.dot} /><Txt style={s.liveText}>COMPARTILHANDO AGORA</Txt></View>
            <View style={s.linkBox}><Txt testID="share-link" style={s.link}>{link}</Txt></View>
            <Txt variant="small">Expira em {fmtDate(share.expires_at)}</Txt>
            {lastSent ? <Txt variant="small">Última atualização enviada: {fmtDate(lastSent)}</Txt> : null}
            <View style={{ gap: S.sm, marginTop: S.lg }}>
              <Btn testID="share-send-button" label="Enviar link" icon="share-social" onPress={send} />
              <Btn testID="share-copy-button" label="Copiar link" icon="copy" variant="outline" onPress={copy} />
              <Btn testID="share-stop-button" label="Parar de compartilhar" icon="stop-circle" variant="danger" onPress={stop} />
            </View>
            <Txt variant="small" style={{ marginTop: S.md }}>
              Mantenha esta tela aberta para atualizar a posição. A atualização em segundo plano estará disponível na versão instalada (próxima etapa).
            </Txt>
          </Card>
        ) : (
          <Card testID="share-start-card">
            <Icon name="navigate-circle" size={48} color={colors.brandPrimary} />
            <Txt variant="h2" style={{ marginTop: S.sm }}>Acompanhamento em tempo real</Txt>
            <Txt style={{ marginVertical: S.sm }}>Gere um link seguro que mostra sua posição em um mapa. Quem recebe não precisa ter o app.</Txt>
            <Txt variant="label">Duração</Txt>
            <View style={s.opts}>
              {options.map((h) => (
                <Pressable key={h} testID={`share-hours-${h}`} onPress={() => setHours(h)} style={[s.opt, hours === h && s.optOn]}>
                  <Txt style={[s.optText, hours === h && { color: colors.onBrand }]}>{h}h</Txt>
                </Pressable>
              ))}
            </View>
            {!user?.is_premium ? <Txt variant="small" style={{ marginBottom: S.md }}>Plano gratuito: até 1 hora. Premium: até 8 horas.</Txt> : null}
            {gpsErr ? <View style={{ marginBottom: S.md }}><Banner testID="share-gps-banner" kind="error" text={FAILURE_TEXT[gpsErr]} /></View> : null}
            <Btn testID="share-start-button" label="Iniciar compartilhamento" icon="play" onPress={start} loading={busy} disabled={!online} />
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  live: { flexDirection: "row", alignItems: "center", gap: S.sm, marginBottom: S.md },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.success },
  liveText: { fontFamily: F.black, fontSize: 13, color: c.success, letterSpacing: 1 },
  linkBox: { backgroundColor: c.brandSoft, padding: S.md, borderRadius: R.sm, marginBottom: S.sm },
  link: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: c.brand },
  opts: { flexDirection: "row", gap: S.sm, marginVertical: S.sm },
  opt: { flex: 1, minHeight: 48, borderRadius: R.sm + 4, borderWidth: 1.5, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  optOn: { backgroundColor: c.brand, borderColor: c.brand },
  optText: { fontFamily: F.bold, fontSize: 15, color: c.onSurface },
}));
