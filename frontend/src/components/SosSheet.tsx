import * as Haptics from "expo-haptics";
import * as SMS from "expo-sms";
import { useEffect, useState } from "react";
import Animated, { ZoomIn } from "react-native-reanimated";
import { Linking, Platform, Pressable, ScrollView, View } from "react-native";

import { api, errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { EMERGENCY, F, intlPhone, R, S } from "@/src/constants";
import { Coords, FAILURE_TEXT, getCurrentCoords, LocFailure, mapsLink, useLocationPermission } from "@/src/location";
import { useOnline } from "@/src/net";
import { Banner, Btn, Icon, Sheet, Txt, useToast } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

type Contact = { id: string; name: string; phone: string; email?: string | null };

export function SosSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const online = useOnline();
  const toast = useToast();
  const perm = useLocationPermission();
  const [step, setStep] = useState<"confirm" | "actions">("confirm");
  const [busy, setBusy] = useState(false);
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locErr, setLocErr] = useState<LocFailure | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [done, setDone] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!visible) return;
    setStep("confirm");
    setIncidentId(null);
    setCoords(null);
    setLocErr(null);
    setDone({});
    api<{ items: Contact[] }>("/contacts").then((r) => setContacts(r.items)).catch(() => {});
  }, [visible]);

  const confirm = async () => {
    setBusy(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    if (!perm.granted && perm.canAskAgain) await perm.request();
    const loc = await getCurrentCoords();
    if (loc.ok) setCoords(loc.coords);
    else setLocErr(loc.reason);
    try {
      const inc = await api<{ id: string }>("/sos", {
        method: "POST",
        body: loc.ok ? { lat: loc.coords.lat, lng: loc.coords.lng, accuracy: loc.coords.accuracy } : {},
      });
      setIncidentId(inc.id);
    } catch {
      // sem internet: as ações locais (ligar/SMS) continuam funcionando
    }
    setBusy(false);
    setStep("actions");
  };

  const record = (action: string) => {
    if (incidentId) api(`/sos/${incidentId}/action`, { method: "POST", body: { action } }).catch(() => {});
  };

  const message = () => {
    const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const where = coords ? `Minha localização: ${mapsLink(coords)}` : "Não consegui obter minha localização.";
    return `SOS - ROTA SEGURA: ${user?.name ?? "Motorista"} precisa de ajuda (${time}). ${where} Se não conseguir falar comigo, ligue 190.`;
  };

  const call = (n: string, action: string) => {
    record(action);
    Linking.openURL(`tel:${n}`).catch(() => toast("Não foi possível abrir o discador.", "error"));
    setDone((d) => ({ ...d, [action]: "Discador aberto" }));
  };

  const whatsapp = (c: Contact) => {
    record("whatsapp");
    Linking.openURL(`https://wa.me/${intlPhone(c.phone)}?text=${encodeURIComponent(message())}`).catch(() =>
      toast("Não foi possível abrir o WhatsApp.", "error"),
    );
    setDone((d) => ({ ...d, [`wa-${c.id}`]: "WhatsApp aberto" }));
  };

  const sms = async () => {
    const phones = contacts.map((c) => c.phone);
    record("sms");
    if (Platform.OS !== "web" && (await SMS.isAvailableAsync())) {
      const r = await SMS.sendSMSAsync(phones, message());
      setDone((d) => ({ ...d, sms: r.result === "sent" ? "SMS enviado" : r.result === "cancelled" ? "SMS cancelado" : "SMS aberto no aparelho" }));
    } else {
      Linking.openURL(`sms:${phones.join(",")}?body=${encodeURIComponent(message())}`).catch(() => toast("SMS indisponível neste aparelho.", "error"));
      setDone((d) => ({ ...d, sms: "App de SMS aberto" }));
    }
  };

  const email = async () => {
    if (!incidentId) return toast("Sem conexão com o servidor. Use SMS ou ligue 190.", "error");
    setBusy(true);
    try {
      const r = await api<{ sent: number; total: number }>(`/sos/${incidentId}/email`, { method: "POST" });
      setDone((d) => ({ ...d, email: `E-mail enviado a ${r.sent} de ${r.total}` }));
      toast(`E-mail enviado a ${r.sent} contato(s).`, "success");
    } catch (e) {
      toast(errMsg(e), "error");
    }
    setBusy(false);
  };

  const finish = (action: "resolvido" | "cancelado") => {
    record(action);
    onClose();
    if (action === "resolvido") toast("Que bom que você está seguro.", "success");
  };

  const withEmail = contacts.filter((c) => !!c.email).length;

  return (
    <Sheet visible={visible} onClose={() => (step === "actions" ? finish("resolvido") : onClose())} testID="sos-sheet">
      {step === "confirm" ? (
        <View>
          <Animated.View entering={ZoomIn.duration(450)} style={s.confirmIcon}>
            <Icon name="alert" size={40} color={colors.onBrandPrimary} />
          </Animated.View>
          <Txt variant="title" style={{ textAlign: "center" }}>Acionar SOS?</Txt>
          <Txt style={{ textAlign: "center", marginVertical: S.md }}>
            Nada é enviado automaticamente. Na próxima tela você escolhe ligar para a emergência ou avisar seus contatos.
            Sua localização atual será incluída na mensagem.
          </Txt>
          <Btn testID="sos-confirm-button" label="Sim, preciso de ajuda" icon="alert-circle" onPress={confirm} loading={busy} style={{ minHeight: 64 }} />
          <Btn testID="sos-cancel-button" label="Cancelar" variant="ghost" onPress={onClose} style={{ marginTop: S.sm }} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <Txt variant="h2">Como você quer pedir ajuda?</Txt>
          {!online ? <View style={{ marginTop: S.md }}><Banner testID="sos-offline-banner" text="Sem internet: use as ligações ou SMS." /></View> : null}
          {locErr ? (
            <View style={{ marginTop: S.md }}>
              <Banner testID="sos-gps-banner" kind="error" text={`${FAILURE_TEXT[locErr]} A mensagem será enviada sem localização.`} />
            </View>
          ) : coords ? (
            <Txt testID="sos-location-ok" variant="small" style={{ marginTop: S.sm, color: colors.success }}>Localização obtida (precisão ~{Math.round(coords.accuracy ?? 0)} m)</Txt>
          ) : null}

          <Txt variant="label" style={s.section}>Serviços de emergência</Txt>
          <View style={s.row}>
            {EMERGENCY.map((e) => (
              <Pressable key={e.number} testID={`sos-call-${e.number}`} onPress={() => call(e.number, e.action)} style={({ pressed }) => [s.emg, pressed && { opacity: 0.8 }]}>
                <Icon name={e.icon as any} size={26} color={colors.onError} />
                <Txt style={s.emgNum}>{e.number}</Txt>
                <Txt style={s.emgLabel}>{e.label}</Txt>
              </Pressable>
            ))}
          </View>

          <Txt variant="label" style={s.section}>Contatos de confiança</Txt>
          {contacts.length === 0 ? (
            <Txt testID="sos-no-contacts" variant="small">Nenhum contato cadastrado. Adicione em Perfil {">"} Contatos de emergência.</Txt>
          ) : (
            <>
              {contacts.map((c) => (
                <Pressable key={c.id} testID={`sos-whatsapp-${c.id}`} onPress={() => whatsapp(c)} style={s.action}>
                  <Icon name="logo-whatsapp" size={24} color={colors.success} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="label" style={{ marginBottom: 0 }}>WhatsApp para {c.name}</Txt>
                    {done[`wa-${c.id}`] ? <Txt variant="small">{done[`wa-${c.id}`]} — confirme o envio no WhatsApp</Txt> : null}
                  </View>
                  <Icon name="chevron-forward" size={20} color={colors.muted} />
                </Pressable>
              ))}
              <Pressable testID="sos-sms-button" onPress={sms} style={s.action}>
                <Icon name="chatbubble-ellipses" size={24} color={colors.brand} />
                <View style={{ flex: 1 }}>
                  <Txt variant="label" style={{ marginBottom: 0 }}>SMS para todos ({contacts.length})</Txt>
                  {done.sms ? <Txt variant="small">{done.sms}</Txt> : null}
                </View>
                <Icon name="chevron-forward" size={20} color={colors.muted} />
              </Pressable>
              <Pressable testID="sos-email-button" onPress={email} disabled={busy || !!done.email || withEmail === 0} style={[s.action, (withEmail === 0 || !!done.email) && { opacity: 0.6 }]}>
                <Icon name="mail" size={24} color={colors.brandSecondary} />
                <View style={{ flex: 1 }}>
                  <Txt variant="label" style={{ marginBottom: 0 }}>E-mail automático ({withEmail})</Txt>
                  <Txt variant="small">{done.email ?? (withEmail ? "Enviado pelo servidor após seu toque" : "Nenhum contato com e-mail")}</Txt>
                </View>
              </Pressable>
            </>
          )}
          <Btn testID="sos-safe-button" label="Estou seguro — encerrar" variant="navy" icon="checkmark-circle" onPress={() => finish("resolvido")} style={{ marginTop: S.xl }} />
        </ScrollView>
      )}
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  confirmIcon: { alignSelf: "center", width: 80, height: 80, borderRadius: 40, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", marginBottom: S.md },
  section: { marginTop: S.xl, marginBottom: S.sm },
  row: { flexDirection: "row", gap: S.sm },
  emg: { flex: 1, minHeight: 100, borderRadius: R.md, backgroundColor: c.error, alignItems: "center", justifyContent: "center", padding: S.sm },
  emgNum: { fontFamily: F.black, fontSize: 24, color: c.onError },
  emgLabel: { fontFamily: F.semibold, fontSize: 12, color: c.onError, textAlign: "center" },
  action: { flexDirection: "row", alignItems: "center", gap: S.md, minHeight: 60, paddingHorizontal: S.lg, paddingVertical: S.sm, borderRadius: R.md, backgroundColor: c.surfaceSecondary, marginBottom: S.sm },
}));
