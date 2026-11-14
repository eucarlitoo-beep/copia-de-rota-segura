import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, TextInput, View } from "react-native";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { CATEGORIES, catOf, F, R, S } from "@/src/constants";
import { MapAlert, MapPosition, RiskMap } from "@/src/components/RiskMap";
import { Banner, Btn, Field, Icon, Sheet, Txt, useToast } from "@/src/components/ui";
import { FAILURE_TEXT, getCurrentCoords, LocFailure, useLocationPermission } from "@/src/location";
import { usesNativeTabs } from "@/src/navigation";
import { useOnline } from "@/src/net";
import { makeStyles, useTheme } from "@/src/theme";
import { timeAgo } from "@/src/time";

const REGION = { latitudeDelta: 0.08, longitudeDelta: 0.08 };
const PERIODS = [{ hours: 24, label: "24 h" }, { hours: 72, label: "3 dias" }, { hours: 168, label: "7 dias" }, { hours: 720, label: "30 dias" }];

export default function Mapa() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const online = useOnline();
  const toast = useToast();
  const perm = useLocationPermission();
  const [alerts, setAlerts] = useState<MapAlert[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [hours, setHours] = useState(72);
  const [alertsBusy, setAlertsBusy] = useState(false);
  const [alertsError, setAlertsError] = useState(false);
  const [alertsUpdatedAt, setAlertsUpdatedAt] = useState<Date | null>(null);
  const [region, setRegion] = useState<{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null>(null);
  const [mapCenter, setMapCenter] = useState({ latitude: 0, longitude: 0 });
  const [place, setPlace] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [placeBusy, setPlaceBusy] = useState(false);
  const [selectingCity, setSelectingCity] = useState(false);
  const [gpsErr, setGpsErr] = useState<LocFailure | null>(null);
  const [selected, setSelected] = useState<MapAlert | null>(null);
  const [askLoc, setAskLoc] = useState(false);
  const [navigationSheet, setNavigationSheet] = useState(false);
  const [destination, setDestination] = useState("");
  const [navigationBusy, setNavigationBusy] = useState(false);
  const [navigationMode, setNavigationMode] = useState(false);
  const [travelMode, setTravelMode] = useState<"driving" | "walking">("driving");
  const [currentPosition, setCurrentPosition] = useState<MapPosition | null>(null);
  const [matchedGeometry, setMatchedGeometry] = useState<[number, number][]>([]);
  const [routeInfo, setRouteInfo] = useState<{ geometry: [number, number][]; distance: number; duration: number; steps: { name: string; type: string; modifier: string; distance: number }[] } | null>(null);
  const gpsWatch = useRef<Location.LocationSubscription | null>(null);
  const gpsTrace = useRef<{ lat: number; lng: number; timestamp: number; accuracy: number }[]>([]);
  const lastMatchAt = useRef(0);
  const center = useRef({ latitude: 0, longitude: 0, ...REGION });
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const stopNavigation = useCallback(() => {
    gpsWatch.current?.remove();
    gpsWatch.current = null;
    gpsTrace.current = [];
    setNavigationMode(false);
    setCurrentPosition(null);
    setRouteInfo(null);
    setMatchedGeometry([]);
  }, []);

  const startNavigation = async () => {
    if (destination.trim().length < 3) return toast("Informe um destino para calcular a rota.", "error");
    setNavigationBusy(true);
    try {
      if (!perm.granted && !(await perm.request())) {
        setNavigationBusy(false);
        return setGpsErr("denied");
      }
      const current = await getCurrentCoords();
      if (!current.ok) {
        setGpsErr(current.reason);
        setNavigationBusy(false);
        return;
      }
      const placeResult = await api<{ lat: number; lng: number; city: string; state: string }>("/location/geocode", {
        method: "POST", body: { query: destination.trim() },
      });
      const route = await api<{ geometry: [number, number][]; distance: number; duration: number; steps: { name: string; type: string; modifier: string; distance: number }[] }>("/navigation/route", {
        method: "POST", body: { origin: { lat: current.coords.lat, lng: current.coords.lng, timestamp: Math.floor(Date.now() / 1000), accuracy: current.coords.accuracy ?? 25 }, destination_lat: placeResult.lat, destination_lng: placeResult.lng, mode: travelMode },
      });
      setRouteInfo(route);
      setMatchedGeometry([]);
      setNavigationSheet(false);
      setNavigationMode(true);
      setCurrentPosition({ latitude: current.coords.lat, longitude: current.coords.lng, heading: null });
      center.current = { ...REGION, latitude: current.coords.lat, longitude: current.coords.lng };
      setRegion(center.current);
      gpsTrace.current = [];
      lastMatchAt.current = 0;
      gpsWatch.current?.remove();
      gpsWatch.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2500, distanceInterval: 5 },
        (position) => {
          const timestamp = Math.floor(position.timestamp / 1000);
          const previous = gpsTrace.current[gpsTrace.current.length - 1];
          const point = { lat: position.coords.latitude, lng: position.coords.longitude, timestamp: Math.max(timestamp, (previous?.timestamp ?? 0) + 1), accuracy: position.coords.accuracy ?? 25 };
          gpsTrace.current = [...gpsTrace.current, point].slice(-50);
          setCurrentPosition({ latitude: point.lat, longitude: point.lng, heading: position.coords.heading ?? null });
          if (gpsTrace.current.length >= 3 && point.timestamp - lastMatchAt.current >= 20) {
            lastMatchAt.current = point.timestamp;
            api<{ geometry: [number, number][]; matched: boolean }>("/navigation/match", { method: "POST", body: { points: gpsTrace.current.slice(-20), mode: travelMode } })
              .then((match) => {
                if (match.matched && match.geometry.length > 1) setMatchedGeometry(match.geometry);
              })
              .catch(() => {});
          }
        },
      );
      setPlaceName(`${placeResult.city} - ${placeResult.state}`);
    } catch (e) {
      stopNavigation();
      toast(e instanceof Error ? e.message : "Não foi possível iniciar a navegação.", "error");
    } finally {
      setNavigationBusy(false);
    }
  };

  const refreshAlerts = useCallback(async () => {
    setAlertsBusy(true);
    try {
      const items = await api<MapAlert[]>("/alerts?hours=720");
      setAlerts(items.filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng) && Math.abs(a.lat) <= 90 && Math.abs(a.lng) <= 180));
      setAlertsUpdatedAt(new Date(Date.now()));
      setAlertsError(false);
    } catch {
      setAlertsError(true);
    } finally {
      setAlertsBusy(false);
    }
  }, []);

  const visibleAlerts = alerts.filter((a) => {
    const createdAt = Date.parse(a.created_at);
    const referenceTime = alertsUpdatedAt?.getTime() ?? 0;
    return (!category || a.category === category) && Number.isFinite(createdAt) && referenceTime - createdAt <= hours * 60 * 60 * 1000;
  });
  const locationError = gpsErr ?? (perm.loaded && !perm.granted ? "denied" : null);

  const locate = useCallback(async () => {
    const r = await getCurrentCoords();
    if (r.ok) {
      const reg = { ...REGION, latitude: r.coords.lat, longitude: r.coords.lng };
      center.current = reg;
      setMapCenter(reg);
      setRegion(reg);
      setGpsErr(null);
      setSelectingCity(false);
      try {
        const address = await Location.reverseGeocodeAsync({ latitude: r.coords.lat, longitude: r.coords.lng });
        const a = address[0];
        setPlaceName([a?.city || a?.subregion, a?.region].filter(Boolean).join(" - "));
      } catch { setPlaceName(""); }
    } else {
      setGpsErr(r.reason);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshAlerts();
      if (perm.granted) locate();
      return stopNavigation;
    }, [perm.granted, locate, refreshAlerts, stopNavigation]),
  );

  const report = () => {
    if (!region) return toast("Permita a localização ou selecione uma cidade no mapa.", "error");
    const c = center.current;
    router.push({ pathname: "/report", params: { lat: String(c.latitude), lng: String(c.longitude) } });
  };

  const chooseCity = async () => {
    if (place.trim().length < 2) return toast("Informe cidade e estado.", "error");
    setPlaceBusy(true);
    try {
      const r = await api<{ lat: number; lng: number; city: string; state: string }>("/location/geocode", { method: "POST", body: { query: place.trim() } });
      const reg = { ...REGION, latitude: r.lat, longitude: r.lng };
      center.current = reg;
      setMapCenter(reg);
      setRegion(reg);
      setPlaceName(`${r.city} - ${r.state}`);
      setGpsErr(null);
      setPlace("");
      setSelectingCity(false);
    } catch (e) { toast(e instanceof Error ? e.message : "Cidade não encontrada.", "error"); }
    setPlaceBusy(false);
  };

  return (
    <View style={s.root}>
      {region ? (
        <RiskMap key={`${region.latitude.toFixed(5)}:${region.longitude.toFixed(5)}`} alerts={visibleAlerts} region={region} onRegionChange={(r) => { center.current = r; setMapCenter(r); }} showUser={perm.granted && !navigationMode} onSelect={setSelected} cameraFollow={navigationMode} currentPosition={currentPosition} travelMode={travelMode} routeCoordinates={routeInfo?.geometry.map(([lng, lat]) => ({ latitude: lat, longitude: lng })) ?? []} matchedCoordinates={matchedGeometry.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))} />
      ) : (
        <View style={s.loading}><ActivityIndicator color={colors.brand} size="large" /><Txt>Carregando mapa...</Txt></View>
      )}
      <View style={[s.top, { top: insets.top + S.sm }]} pointerEvents="box-none">
        {!navigationMode ? <View style={s.titleCard}>
          <Icon name="map" size={20} color={colors.brandPrimary} />
          <Txt style={s.title}>Mapa de riscos</Txt>
          <Txt testID="map-alert-count" style={s.count}>{visibleAlerts.length} alerta(s)</Txt>
        </View> : null}
        {!navigationMode ? <View style={s.filterCard}>
          <View style={s.filterHeader}>
            <Txt style={s.filterTitle}>Período</Txt>
            <Pressable testID="map-refresh-button" accessibilityRole="button" accessibilityLabel="Atualizar alertas" onPress={refreshAlerts} disabled={alertsBusy} style={s.refresh}>
              {alertsBusy ? <ActivityIndicator size="small" color={colors.brand} /> : <Icon name="refresh" size={16} color={colors.brand} />}
              <Txt style={s.refreshText}>{alertsUpdatedAt ? "Atualizar" : "Carregar"}</Txt>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {PERIODS.map((p) => <Pressable key={p.hours} testID={`map-period-${p.hours}`} accessibilityRole="button" accessibilityState={{ selected: hours === p.hours }} onPress={() => setHours(p.hours)} style={[s.chip, hours === p.hours && s.chipActive]}><Txt style={[s.chipText, hours === p.hours && s.chipTextActive]}>{p.label}</Txt></Pressable>)}
          </ScrollView>
          <Txt style={s.filterTitle}>Tipo de alerta</Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            <Pressable testID="map-category-all" accessibilityRole="button" accessibilityState={{ selected: category === null }} onPress={() => setCategory(null)} style={[s.chip, category === null && s.chipActive]}><Txt style={[s.chipText, category === null && s.chipTextActive]}>Todos</Txt></Pressable>
            {CATEGORIES.map((item) => <Pressable key={item.key} testID={`map-category-${item.key}`} accessibilityRole="button" accessibilityState={{ selected: category === item.key }} onPress={() => setCategory(item.key)} style={[s.chip, category === item.key && s.chipActive]}><Txt style={[s.chipText, category === item.key && s.chipTextActive]}>{item.label}</Txt></Pressable>)}
          </ScrollView>
          {alertsError ? <View style={s.alertError}><Txt style={s.alertErrorText}>Não foi possível atualizar. Exibindo os dados disponíveis.</Txt><Pressable onPress={refreshAlerts}><Txt style={s.retryText}>Tentar novamente</Txt></Pressable></View> : alertsUpdatedAt ? <Txt style={s.updatedAt}>Atualizado {timeAgo(alertsUpdatedAt.toISOString())}</Txt> : null}
        </View> : null}
        {navigationMode && routeInfo ? (
          <View testID="map-navigation-active" style={s.turnHud}>
            <Icon name={routeInfo.steps[0]?.modifier?.includes("left") ? "arrow-undo" : routeInfo.steps[0]?.modifier?.includes("right") ? "arrow-redo" : "arrow-up"} size={34} color="#FFFFFF" />
            <View style={{ flex: 1 }}><Txt style={s.hudDistance}>{Math.max(20, Math.round(routeInfo.steps[0]?.distance ?? routeInfo.distance))} m</Txt><Txt style={s.hudStreet} numberOfLines={1}>{routeInfo.steps[0]?.name || (travelMode === "driving" ? "Siga em frente" : "Continue a pé")}</Txt></View>
            <Pressable testID="map-navigation-stop" onPress={stopNavigation} style={s.hudClose}><Icon name="close" size={20} color="#FFFFFF" /></Pressable>
          </View>
        ) : (
          <Pressable testID="map-navigation-open" accessibilityRole="button" onPress={() => setNavigationSheet(true)} style={s.navOpen}>
            <Icon name="navigate-circle" size={21} color={colors.onBrandPrimary} /><Txt style={s.navOpenText}>Traçar rota e seguir GPS</Txt><Icon name="chevron-forward" size={18} color={colors.onBrandPrimary} />
          </Pressable>
        )}
        {placeName ? <Txt testID="map-place" style={s.place}>{placeName} · coordenadas {mapCenter.latitude.toFixed(4)}, {mapCenter.longitude.toFixed(4)}</Txt> : null}
        {region && !selectingCity ? <Pressable testID="map-change-city" onPress={() => setSelectingCity(true)}><Txt style={s.changeCity}>Escolher outra cidade</Txt></Pressable> : null}
        {!region || selectingCity ? <View style={s.manual}><Txt style={s.manualTitle}>{region ? "Alterar cidade do mapa" : "Escolha sua cidade para abrir o mapa"}</Txt><Field testID="map-city-input" label="Cidade e estado" value={place} onChangeText={setPlace} placeholder="Ex.: Salvador, BA" /><Btn testID="map-city-submit" label="Mostrar cidade" onPress={chooseCity} loading={placeBusy} />{region ? <Btn testID="map-city-cancel" label="Cancelar" variant="ghost" onPress={() => setSelectingCity(false)} /> : null}<Txt variant="small">Busca aproximada de cidades no Brasil via OpenStreetMap.</Txt></View> : null}
        {!online ? <Banner testID="map-offline-banner" text="Sem internet. Alertas podem estar desatualizados." /> : null}
        {locationError ? (
          <Banner
            testID="map-gps-banner"
            kind="error"
            text={locationError === "denied" ? "Localização desativada. Permita o acesso ou escolha sua cidade manualmente." : FAILURE_TEXT[locationError]}
            action={
              <Pressable testID="map-gps-fix" onPress={() => (locationError === "denied" ? setAskLoc(true) : locate())} hitSlop={8}>
                <Txt style={s.bannerAction}>{locationError === "denied" ? "Ativar" : "Tentar"}</Txt>
              </Pressable>
            }
          />
        ) : null}
      </View>
      {navigationMode && routeInfo ? <View testID="map-navigation-summary" style={[s.routeSummary, { bottom: bottomChrome + S.lg }]}>
        <View style={s.summaryTop}><Icon name={travelMode === "driving" ? "car-sport" : "walk"} size={22} color={colors.brand} /><Txt style={s.summaryLabel}>{travelMode === "driving" ? "De carro" : "A pé"}</Txt><View style={{ flex: 1 }} /><Txt style={s.summaryDistance}>{(routeInfo.distance / 1000).toFixed(1)} km</Txt></View>
        <View style={s.summaryBottom}><Txt style={s.summaryEta}>{Math.max(1, Math.round(routeInfo.duration / 60))} min</Txt><Txt style={s.summaryText}>estimados · rota destacada</Txt><Pressable testID="map-navigation-stop-bottom" onPress={stopNavigation}><Txt style={s.routeStop}>Encerrar</Txt></Pressable></View>
      </View> : null}
      {!navigationMode ? <View style={[s.fabs, { bottom: bottomChrome + S.lg }]}>
        {perm.granted ? (
          <Pressable testID="map-locate-button" accessibilityLabel="Minha localização" onPress={locate} style={s.fabSmall}>
            <Icon name="locate" size={24} color={colors.brand} />
          </Pressable>
        ) : null}
        <Pressable testID="map-report-button" onPress={report} style={s.fab}>
          <Icon name="add-circle" size={26} color={colors.onBrandPrimary} />
          <Txt style={s.fabText}>Relatar risco aqui</Txt>
        </Pressable>
      </View> : null}
      <Sheet visible={!!selected} onClose={() => setSelected(null)} testID="map-alert-sheet">
        {selected ? (
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
              <Icon name={catOf(selected.category).icon as any} size={26} color={colors[catOf(selected.category).color] as string} />
              <Txt variant="h2">{catOf(selected.category).label}</Txt>
            </View>
            <Txt style={{ marginVertical: S.md }}>{selected.description}</Txt>
            <Txt variant="small">{timeAgo(selected.created_at)} · local aproximado (~100 m) · moderado</Txt>
            <Btn testID="map-sheet-close" label="Fechar" variant="navy" onPress={() => setSelected(null)} style={{ marginTop: S.lg }} />
          </View>
        ) : null}
      </Sheet>
      <Sheet visible={navigationSheet} onClose={() => setNavigationSheet(false)} testID="map-navigation-sheet">
        <Txt variant="h2">Traçar rota GPS</Txt>
        <Txt style={{ marginVertical: S.md }}>Digite o destino. Para calcular e ajustar a rota à via, o GPS de origem, o destino e os pontos do trajeto com horários serão enviados ao backend e ao serviço de rotas configurado. A pé, é necessário configurar um serviço compatível no servidor. O compartilhamento não começa automaticamente.</Txt>
        <TextInput testID="map-destination-input" value={destination} onChangeText={setDestination} placeholder="Endereço ou cidade de destino" placeholderTextColor={colors.muted} style={s.destinationInput} returnKeyType="done" />
        <View style={s.modeRow}>
          {([{ key: "driving", label: "De carro", icon: "car-sport" }, { key: "walking", label: "A pé", icon: "walk" }] as const).map((mode) => <Pressable key={mode.key} testID={`map-mode-${mode.key}`} accessibilityRole="button" accessibilityState={{ selected: travelMode === mode.key }} onPress={() => setTravelMode(mode.key)} style={[s.modeButton, travelMode === mode.key && s.modeButtonSelected]}><Icon name={mode.icon as any} size={18} color={travelMode === mode.key ? colors.onBrand : colors.brand} /><Txt style={[s.modeText, travelMode === mode.key && { color: colors.onBrand }]}>{mode.label}</Txt></Pressable>)}
        </View>
        <Btn testID="map-navigation-start" label="Concordar e calcular rota" icon="navigate" onPress={startNavigation} loading={navigationBusy} disabled={destination.trim().length < 3} />
        <Btn testID="map-navigation-cancel" label="Cancelar" variant="ghost" onPress={() => setNavigationSheet(false)} style={{ marginTop: S.sm }} />
      </Sheet>
      <Sheet visible={askLoc} onClose={() => setAskLoc(false)} testID="map-permission-sheet">
        <Txt variant="h2">Ver riscos perto de você</Txt>
        <Txt style={{ marginVertical: S.md }}>Usamos sua localização apenas enquanto o app está aberto, para centralizar o mapa. Ela não é publicada.</Txt>
        {perm.canAskAgain ? (
          <Btn testID="map-permission-allow" label="Permitir localização" icon="location" onPress={async () => { setAskLoc(false); if (await perm.request()) locate(); }} />
        ) : (
          <Btn testID="map-permission-settings" label="Abrir Configurações" icon="settings" variant="navy" onPress={() => { setAskLoc(false); Linking.openSettings(); }} />
        )}
        <Btn testID="map-permission-later" label="Agora não" variant="ghost" onPress={() => setAskLoc(false)} style={{ marginTop: S.sm }} />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceTertiary },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: S.md },
  manual: { backgroundColor: c.surface, borderRadius: R.md, padding: S.md, gap: S.sm },
  manualTitle: { fontFamily: F.semibold, fontSize: 14, color: c.onSurface },
  place: { alignSelf: "flex-start", backgroundColor: c.surface, borderRadius: R.pill, paddingHorizontal: S.md, paddingVertical: S.sm, fontFamily: F.semibold, color: c.brand, fontSize: 12 },
  changeCity: { alignSelf: "flex-end", backgroundColor: c.surface, borderRadius: R.pill, paddingHorizontal: S.md, paddingVertical: S.sm, fontFamily: F.bold, color: c.brand, fontSize: 13 },
  top: { position: "absolute", left: S.lg, right: S.lg, gap: S.sm },
  titleCard: { flexDirection: "row", alignItems: "center", gap: S.sm, backgroundColor: c.surface, borderRadius: R.md, paddingHorizontal: S.lg, minHeight: 52, shadowColor: c.brand, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  filterCard: { backgroundColor: c.surface, borderRadius: R.md, padding: S.sm, gap: S.xs, shadowColor: c.brand, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  filterHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.xs },
  filterTitle: { fontFamily: F.semibold, fontSize: 12, color: c.muted },
  chips: { flexDirection: "row", gap: S.xs, paddingVertical: 2 },
  chip: { paddingHorizontal: S.md, paddingVertical: S.xs, borderRadius: R.pill, backgroundColor: c.surfaceSecondary, minHeight: 32, justifyContent: "center" },
  chipActive: { backgroundColor: c.brand },
  chipText: { fontFamily: F.semibold, fontSize: 12, color: c.onSurface },
  chipTextActive: { color: c.onBrand },
  refresh: { flexDirection: "row", alignItems: "center", gap: S.xs, paddingHorizontal: S.sm, paddingVertical: S.xs },
  refreshText: { fontFamily: F.bold, fontSize: 12, color: c.brand },
  updatedAt: { fontFamily: F.medium, fontSize: 11, color: c.muted, paddingHorizontal: S.xs },
  alertError: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.xs, paddingHorizontal: S.xs },
  alertErrorText: { flex: 1, fontFamily: F.medium, fontSize: 11, color: c.error },
  retryText: { fontFamily: F.bold, fontSize: 11, color: c.brand, textDecorationLine: "underline" },
  navOpen: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.sm, backgroundColor: c.success, minHeight: 46, borderRadius: R.md, paddingHorizontal: S.md },
  navOpenText: { flex: 1, textAlign: "center", fontFamily: F.bold, fontSize: 13, color: c.onSuccess },
  turnHud: { flexDirection: "row", alignItems: "center", gap: S.lg, backgroundColor: "#101820", borderRadius: R.md, minHeight: 88, paddingHorizontal: S.lg, paddingVertical: S.md, shadowColor: "#000000", shadowOpacity: 0.28, shadowRadius: 12, elevation: 8 },
  hudDistance: { fontFamily: F.black, fontSize: 25, color: "#FFFFFF" },
  hudStreet: { fontFamily: F.bold, fontSize: 17, color: "#55D6F5" },
  hudClose: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  routeSummary: { position: "absolute", left: S.lg, right: S.lg, minHeight: 92, borderRadius: R.md, padding: S.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, shadowColor: "#000000", shadowOpacity: 0.2, shadowRadius: 12, elevation: 8, gap: S.sm },
  summaryTop: { flexDirection: "row", alignItems: "center", gap: S.sm },
  summaryLabel: { fontFamily: F.bold, fontSize: 14, color: c.onSurface },
  summaryDistance: { fontFamily: F.bold, fontSize: 14, color: c.brand },
  summaryBottom: { flexDirection: "row", alignItems: "center", gap: S.sm },
  summaryEta: { fontFamily: F.black, fontSize: 22, color: c.onSurface },
  summaryText: { flex: 1, fontFamily: F.medium, fontSize: 12, color: c.muted },
  modeRow: { flexDirection: "row", gap: S.sm, marginBottom: S.md },
  modeButton: { flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.sm, borderRadius: R.md, borderWidth: 1.5, borderColor: c.brand, backgroundColor: c.surface },
  modeButtonSelected: { backgroundColor: c.brand },
  modeText: { fontFamily: F.bold, fontSize: 14, color: c.brand },
  routeCard: { backgroundColor: c.surface, borderRadius: R.md, borderWidth: 1.5, borderColor: c.success, padding: S.md, gap: S.xs, shadowColor: c.brand, shadowOpacity: 0.14, shadowRadius: 8, elevation: 4 },
  routeStats: { flexDirection: "row", alignItems: "center", gap: S.sm },
  routeDistance: { fontFamily: F.black, fontSize: 18, color: c.onSurface, flex: 1 },
  routeDuration: { fontFamily: F.bold, fontSize: 14, color: c.success },
  routeNext: { fontFamily: F.medium, fontSize: 12, color: c.onSurfaceSecondary },
  routeStop: { alignSelf: "flex-end", fontFamily: F.bold, fontSize: 12, color: c.error, paddingTop: S.xs },
  destinationInput: { minHeight: 50, borderWidth: 1, borderColor: c.borderStrong, borderRadius: R.md, paddingHorizontal: S.md, color: c.onSurface, fontFamily: F.medium, marginBottom: S.lg },
  title: { fontFamily: F.bold, fontSize: 16, color: c.brand, flex: 1 },
  count: { fontFamily: F.semibold, fontSize: 13, color: c.muted },
  bannerAction: { fontFamily: F.bold, color: c.onError, textDecorationLine: "underline" },
  fabs: { position: "absolute", right: S.lg, left: S.lg, flexDirection: "row", justifyContent: "flex-end", gap: S.md },
  fab: { flexDirection: "row", alignItems: "center", gap: S.sm, backgroundColor: c.brandPrimary, minHeight: 56, paddingHorizontal: S.xl, borderRadius: R.pill, shadowColor: c.brandSecondary, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 },
  fabText: { fontFamily: F.bold, fontSize: 16, color: c.onBrandPrimary },
  fabSmall: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: c.brand, shadowOpacity: 0.15, shadowRadius: 10 },
}));
