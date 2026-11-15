import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { CATEGORIES, F, R, S } from "@/src/constants";
import { Banner, Btn, Card, Field, Icon, ScreenHeader, Txt, useToast } from "@/src/components/ui";
import { FAILURE_TEXT, getCurrentCoords, LocFailure, useLocationPermission } from "@/src/location";
import { useOnline } from "@/src/net";
import { makeStyles, useTheme } from "@/src/theme";

export default function Report() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const { user } = useAuth();
  const perm = useLocationPermission();
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const hasMapPoint = !!params.lat && !!params.lng;
  const [source, setSource] = useState<"gps" | "map">(hasMapPoint ? "map" : "gps");
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [error, setError] = useState("");
  const [gpsErr, setGpsErr] = useState<LocFailure | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    if (!category) return setError("Escolha o tipo de risco.");
    if (description.trim().length < 10) return setError("Descreva a situação (mínimo 10 caracteres).");
    setBusy(true);
    let lat: number, lng: number;
    if (source === "gps") {
      if (!user?.location_consent) {
        setGpsErr("consent_required");
        setBusy(false);
        return;
      }
      if (!perm.granted && perm.canAskAgain) await perm.request();
      const r = await getCurrentCoords();
      if (!r.ok) {
        setGpsErr(r.reason);
        setBusy(false);
        return;
      }
      lat = r.coords.lat;
      lng = r.coords.lng;
    } else {
      lat = Number(params.lat);
      lng = Number(params.lng);
    }
    try {
      await api("/alerts", { method: "POST", body: { category, description: description.trim(), neighborhood: neighborhood.trim() || undefined, lat, lng } });
      toast("Relato enviado para moderação. Avisaremos quando for analisado.", "success");
      router.back();
    } catch (e) {
      setError(errMsg(e));
    }
    setBusy(false);
  };

  return (
    <View style={s.root}>
      <ScreenHeader title="Relatar risco" />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: S.lg, gap: S.lg, paddingBottom: insets.bottom + S.xl }}>
        {!online ? <Banner testID="report-offline-banner" text="Sem internet. Envie o relato quando a conexão voltar." /> : null}
        <Card style={{ backgroundColor: colors.brandSoft, borderColor: colors.brandSoft }}>
          <View style={{ flexDirection: "row", gap: S.sm }}>
            <Icon name="information-circle" size={22} color={colors.brand} />
            <Txt variant="label" style={{ flex: 1 }}>Regras da comunidade</Txt>
          </View>
          <Txt variant="small">
            Descreva apenas a situação de risco no local. Não informe nomes, placas, telefones ou acusações contra pessoas. Todo relato passa por moderação antes de ser publicado e o autor nunca é exibido.
          </Txt>
        </Card>
        <View>
          <Txt variant="label">Tipo de risco</Txt>
          <View style={s.grid}>
            {CATEGORIES.map((c) => {
              const on = category === c.key;
              return (
                <Pressable key={c.key} testID={`report-category-${c.key}`} onPress={() => setCategory(c.key)} style={[s.cat, on && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}>
                  <Icon name={c.icon as any} size={22} color={colors[c.color] as string} />
                  <Txt style={s.catText}>{c.label}</Txt>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Field
          testID="report-description-input"
          label={`Descrição (${description.length}/280)`}
          value={description}
          onChangeText={(t) => setDescription(t.slice(0, 280))}
          multiline
          placeholder="Ex.: Trecho escuro com relatos de abordagem perto do viaduto."
        />
        <Field testID="report-neighborhood-input" label="Bairro (opcional)" value={neighborhood} onChangeText={(value) => setNeighborhood(value.slice(0, 80))} placeholder="Ex.: Centro" />
        <Txt variant="small">O bairro informado ajuda a montar estatísticas colaborativas. Não é uma estatística oficial de segurança pública.</Txt>
        <View>
          <Txt variant="label">Local do relato</Txt>
          <View style={s.src}>
            <Pressable testID="report-source-gps" onPress={() => setSource("gps")} style={[s.srcBtn, source === "gps" && s.srcOn]}>
              <Icon name="locate" size={18} color={source === "gps" ? colors.onBrand : colors.brand} />
              <Txt style={[s.srcText, source === "gps" && { color: colors.onBrand }]}>Minha posição</Txt>
            </Pressable>
            {hasMapPoint ? (
              <Pressable testID="report-source-map" onPress={() => setSource("map")} style={[s.srcBtn, source === "map" && s.srcOn]}>
                <Icon name="map" size={18} color={source === "map" ? colors.onBrand : colors.brand} />
                <Txt style={[s.srcText, source === "map" && { color: colors.onBrand }]}>Centro do mapa</Txt>
              </Pressable>
            ) : null}
          </View>
          <Txt variant="small" style={{ marginTop: S.sm }}>A posição é arredondada (~100 m) antes de ser publicada.</Txt>
        </View>
        {gpsErr ? <Banner testID="report-gps-banner" kind="error" text={gpsErr === "denied" ? "Permissão de localização negada. Use o centro do mapa ou ative nas configurações." : FAILURE_TEXT[gpsErr]} /> : null}
        {error ? <Txt testID="report-error" style={{ color: colors.error, fontFamily: F.semibold }}>{error}</Txt> : null}
        <Btn testID="report-submit-button" label="Enviar para moderação" icon="send" onPress={submit} loading={busy} disabled={!online} />
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: S.sm },
  cat: { width: "48%", flexGrow: 1, minHeight: 56, flexDirection: "row", alignItems: "center", gap: S.sm, paddingHorizontal: S.md, borderRadius: R.md, borderWidth: 2, borderColor: c.border, backgroundColor: c.surface },
  catText: { flex: 1, fontFamily: F.semibold, fontSize: 14, color: c.onSurface },
  src: { flexDirection: "row", gap: S.sm },
  srcBtn: { flex: 1, minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: R.md, borderWidth: 1.5, borderColor: c.brand, backgroundColor: c.surface },
  srcOn: { backgroundColor: c.brand },
  srcText: { fontFamily: F.semibold, fontSize: 14, color: c.brand },
}));
