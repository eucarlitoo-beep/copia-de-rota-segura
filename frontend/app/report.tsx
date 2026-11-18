import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errMsg } from "@/src/api";
import { CATEGORIES, F, R, S } from "@/src/constants";
import { Banner, Btn, Card, Field, Icon, ScreenHeader, Txt, useToast } from "@/src/components/ui";
import { FAILURE_TEXT, getCurrentCoords, LocFailure, useLocationPermission } from "@/src/location";
import { useOnline } from "@/src/net";
import { makeStyles, useTheme } from "@/src/theme";

type LocationSuggestion = { neighborhood: string | null; street: string | null; locality: string | null; region: string | null; needs_confirmation: true; attribution: string };

export default function Report() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const perm = useLocationPermission();
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const hasMapPoint = !!params.lat && !!params.lng;
  const [source, setSource] = useState<"gps" | "map">(hasMapPoint ? "map" : "gps");
  const [category, setCategory] = useState<string | null>(null);
  const [engagedCategory, setEngagedCategory] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [street, setStreet] = useState("");
  const [locality, setLocality] = useState("");
  const [region, setRegion] = useState("");
  const [suggestion, setSuggestion] = useState<LocationSuggestion | null>(null);
  const [suggestionError, setSuggestionError] = useState("");
  const [suggestionBusy, setSuggestionBusy] = useState(false);
  const [suggestionApplied, setSuggestionApplied] = useState(false);
  const [error, setError] = useState("");
  const [gpsErr, setGpsErr] = useState<LocFailure | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedCoords = async () => {
    if (source === "map") {
      const lat = Number(params.lat), lng = Number(params.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        setGpsErr("error");
        return null;
      }
      return { lat, lng };
    }
    if (!perm.granted && perm.canAskAgain && !(await perm.request())) {
      setGpsErr("denied");
      return null;
    }
    const r = await getCurrentCoords();
    if (!r.ok) {
      setGpsErr(r.reason);
      return null;
    }
    return { lat: r.coords.lat, lng: r.coords.lng };
  };

  const suggestLocation = async () => {
    setSuggestionError("");
    setSuggestionBusy(true);
    const coords = await selectedCoords();
    if (!coords) {
      setSuggestionBusy(false);
      return;
    }
    try {
      const result = await api<LocationSuggestion>("/location/reverse-geocode", { method: "POST", body: coords });
      setSuggestion(result);
      setSuggestionApplied(false);
    } catch (e) {
      setSuggestionError(errMsg(e));
    } finally {
      setSuggestionBusy(false);
    }
  };

  const applySuggestion = () => {
    if (!suggestion) return;
    if (suggestion.neighborhood) setNeighborhood(suggestion.neighborhood);
    if (suggestion.street) setStreet(suggestion.street);
    if (suggestion.locality) setLocality(suggestion.locality);
    if (suggestion.region) setRegion(suggestion.region);
    setSuggestionApplied(true);
    setSuggestion(null);
  };

  const changeSource = (next: "gps" | "map") => {
    if (next !== source && suggestionApplied) {
      setNeighborhood("");
      setStreet("");
      setLocality("");
      setRegion("");
    }
    setSuggestion(null);
    setSuggestionApplied(false);
    setSource(next);
  };

  const submit = async () => {
    setError("");
    if (!category) return setError("Escolha o tipo de risco.");
    if (description.trim().length < 10) return setError("Descreva a situação (mínimo 10 caracteres).");
    setBusy(true);
    const coords = await selectedCoords();
    if (!coords) {
      setBusy(false);
      return;
    }
    try {
      await api("/alerts", { method: "POST", body: { category, description: description.trim(), neighborhood: neighborhood.trim() || null, street: street.trim() || null, locality: locality.trim() || null, region: region.trim() || null, lat: coords.lat, lng: coords.lng } });
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
                <Pressable
                  key={c.key}
                  testID={`report-category-${c.key}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setCategory(c.key)}
                  onPressIn={() => setEngagedCategory(c.key)}
                  onPressOut={() => setEngagedCategory(null)}
                  onHoverIn={() => setEngagedCategory(c.key)}
                  onHoverOut={() => setEngagedCategory(null)}
                  style={({ pressed }) => [s.cat, on && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }, pressed && { opacity: 0.92 }]}
                >
                  <RiskCategoryIcon category={c.key} active={engagedCategory === c.key} name={c.icon} size={22} color={colors[c.color] as string} />
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
        <View style={{ gap: S.sm }}>
          <Txt variant="label">Localização da ocorrência</Txt>
          <Txt variant="small">Você pode buscar uma sugestão aproximada ou preencher os campos. Confira e corrija o resultado antes de enviar.</Txt>
          <Txt variant="small">Ao pedir a sugestão, enviamos coordenadas arredondadas (~100 m) ao OpenStreetMap. A identificação pode estar incorreta. © OpenStreetMap contributors.</Txt>
          <Btn testID="report-location-suggest" label="Sugerir pelo mapa" icon="locate" variant="outline" onPress={suggestLocation} loading={suggestionBusy} disabled={!online || busy} />
          {suggestion ? <Card testID="report-location-suggestion" style={{ gap: S.sm }}>
            <Txt variant="label">Sugestão aproximada — confira antes de usar</Txt>
            <Txt variant="small">{[suggestion.neighborhood, suggestion.street, suggestion.locality, suggestion.region].filter(Boolean).join(" · ")}</Txt>
            <Btn testID="report-location-apply" label="Usar e revisar sugestão" icon="checkmark" variant="navy" onPress={applySuggestion} />
          </Card> : null}
          {suggestionApplied ? <Txt testID="report-location-confirmed" variant="small" style={{ color: colors.success }}>Sugestão aplicada. Revise ou edite os campos antes de enviar.</Txt> : null}
          {suggestionError ? <Txt testID="report-location-suggestion-error" variant="small" style={{ color: colors.error }}>{suggestionError}</Txt> : null}
          <Field testID="report-neighborhood-input" label="Bairro (opcional)" value={neighborhood} onChangeText={(t) => { setNeighborhood(t.slice(0, 80)); setSuggestionApplied(false); }} maxLength={80} placeholder="Ex.: Centro" autoCapitalize="words" />
          <Field testID="report-street-input" label="Rua (opcional; sem número)" value={street} onChangeText={(t) => { setStreet(t.slice(0, 100)); setSuggestionApplied(false); }} maxLength={100} placeholder="Ex.: Avenida Central" autoCapitalize="words" />
          <Field testID="report-locality-input" label="Localidade ou município (opcional)" value={locality} onChangeText={(t) => { setLocality(t.slice(0, 100)); setSuggestionApplied(false); }} maxLength={100} placeholder="Ex.: Salvador" autoCapitalize="words" />
          <Field testID="report-region-input" label="Região ou estado (opcional)" value={region} onChangeText={(t) => { setRegion(t.slice(0, 100)); setSuggestionApplied(false); }} maxLength={100} placeholder="Ex.: Bahia" autoCapitalize="words" />
          <Txt variant="small">Rua é exibida nas estatísticas somente quando existem pelo menos 3 relatos aprovados naquele local. Nenhum número de imóvel é salvo pela sugestão automática.</Txt>
        </View>
        <View>
          <Txt variant="label">Local do relato</Txt>
          <View style={s.src}>
            <Pressable testID="report-source-gps" onPress={() => changeSource("gps")} style={[s.srcBtn, source === "gps" && s.srcOn]}>
              <Icon name="locate" size={18} color={source === "gps" ? colors.onBrand : colors.brand} />
              <Txt style={[s.srcText, source === "gps" && { color: colors.onBrand }]}>Minha posição</Txt>
            </Pressable>
            {hasMapPoint ? (
              <Pressable testID="report-source-map" onPress={() => changeSource("map")} style={[s.srcBtn, source === "map" && s.srcOn]}>
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

function RiskCategoryIcon({ category, active, name, size, color }: { category: string; active: boolean; name: string; size: number; color: string }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => {
    const amount = reduceMotion ? 0 : progress.value;
    switch (category) {
      case "assalto":
      case "via_perigosa":
        return { transform: [{ rotate: `${interpolate(amount, [0, 1], [0, category === "assalto" ? -7 : 7])}deg` }] };
      case "roubo_veiculo":
        return { transform: [{ translateX: interpolate(amount, [0, 1], [0, 3]) }] };
      case "acidente":
      case "sem_iluminacao":
        return { transform: [{ scale: interpolate(amount, [0, 1], [1, category === "acidente" ? 1.12 : 1.1]) }] };
      case "alagamento":
        return { transform: [{ translateY: interpolate(amount, [0, 1], [0, -3]) }, { scaleX: interpolate(amount, [0, 1], [1, 1.08]) }] };
      default:
        return { transform: [{ rotate: `${interpolate(amount, [0, 1], [0, 10])}deg` }] };
    }
  }, [category, reduceMotion]);
  useEffect(() => {
    progress.value = withSpring(!reduceMotion && active ? 1 : 0, { damping: 13, stiffness: 240, mass: 0.55 });
  }, [active, progress, reduceMotion]);

  return (
    <Animated.View
      accessible={false}
      style={animatedStyle}
    >
      <Icon name={name as any} size={size} color={color} />
    </Animated.View>
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
