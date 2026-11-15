import { useRouter } from "expo-router";
import { useState } from "react";
import { Share, Switch, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { F, S } from "@/src/constants";
import { PrivacyText } from "@/src/components/PrivacyText";
import { Btn, Card, Field, ScreenHeader, Sheet, Txt, useToast } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export default function Privacy() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user, refresh, logout } = useAuth();
  const [consent, setConsent] = useState(!!user?.location_consent);
  const [exporting, setExporting] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  const toggle = async (v: boolean) => {
    setConsent(v);
    try {
      await api("/privacy/consent", { method: "PUT", body: { location_consent: v } });
      refresh();
    } catch (e) {
      setConsent(!v);
      toast(errMsg(e), "error");
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const data = await api("/privacy/export");
      await Share.share({ message: JSON.stringify(data, null, 2), title: "Meus dados - ROTA SEGURA" });
    } catch (e) {
      toast(errMsg(e), "error");
    }
    setExporting(false);
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api("/privacy/account", { method: "DELETE" });
      await logout();
      router.replace("/login");
    } catch (e) {
      toast(errMsg(e), "error");
      setDeleting(false);
    }
  };

  return (
    <View style={s.root}>
      <ScreenHeader title="Privacidade e LGPD" />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: S.lg, gap: S.lg, paddingBottom: insets.bottom + S.xl }}>
        <Card>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Txt variant="label">Usar minha localização</Txt>
              <Txt variant="small">Controla o uso de GPS no mapa, navegação, SOS e compartilhamento. Desativar encerra links ativos; o SOS continua disponível sem enviar coordenadas. A permissão do aparelho também é necessária.</Txt>
            </View>
            <Switch testID="privacy-location-switch" value={consent} onValueChange={toggle} trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }} thumbColor={colors.surface} />
          </View>
        </Card>
        <Card><PrivacyText /></Card>
        <Card>
          <Txt variant="label">Seus dados</Txt>
          <Txt variant="small" style={{ marginBottom: S.md }}>Exporte uma cópia dos seus dados. Segredos de acesso, como tokens de dispositivos, pagamentos e links, são omitidos por segurança.</Txt>
          <Btn testID="privacy-export-button" label="Exportar meus dados" icon="download" variant="outline" onPress={exportData} loading={exporting} />
          <Btn testID="privacy-delete-button" label="Excluir minha conta" icon="trash" variant="danger" onPress={() => setDelOpen(true)} style={{ marginTop: S.md }} />
        </Card>
      </KeyboardAwareScrollView>
      <Sheet visible={delOpen} onClose={() => setDelOpen(false)} testID="delete-account-sheet">
        <Txt variant="h2">Excluir conta definitivamente</Txt>
        <Txt style={{ marginVertical: S.md }}>
          Seus contatos, histórico, mensagens e compartilhamentos serão apagados. Alertas publicados permanecem anônimos. A renovação de uma assinatura ativa será cancelada na Stripe antes da exclusão; o período já pago não será reembolsado e o acesso à conta termina agora. Se a Stripe não confirmar o cancelamento, a conta não será excluída e você poderá tentar novamente. Esta ação não pode ser desfeita.
        </Txt>
        <Field testID="delete-confirm-input" label='Digite EXCLUIR para confirmar' value={typed} onChangeText={setTyped} autoCapitalize="characters" />
        <Btn testID="delete-confirm-button" label="Excluir conta" variant="danger" onPress={remove} loading={deleting} disabled={typed.trim() !== "EXCLUIR"} />
        <Btn testID="delete-cancel-button" label="Cancelar" variant="ghost" onPress={() => setDelOpen(false)} style={{ marginTop: S.sm }} />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  row: { flexDirection: "row", alignItems: "center", gap: S.md },
  label: { fontFamily: F.bold, color: c.onSurface },
}));
