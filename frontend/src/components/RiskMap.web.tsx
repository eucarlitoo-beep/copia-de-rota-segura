// Web map: OSM base layer with interactive alert pins and nearby-point clusters.
import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { catOf, F, R, S } from "@/src/constants";
import { Icon, Txt } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export type MapAlert = { id: string; category: string; description: string; lat: number; lng: number; created_at: string };
type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
type Pin = { latitude: number; longitude: number; alerts: MapAlert[]; x: number; y: number };
type MapPosition = { latitude: number; longitude: number; heading: number | null };
type Coordinate = { latitude: number; longitude: number };

const mercatorY = (latitude: number) => {
  const safeLat = Math.max(-85, Math.min(85, latitude));
  const radians = (safeLat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
};

export function RiskMap({ alerts, region, onSelect, cameraFollow = false, currentPosition = null, travelMode = "driving", routeCoordinates = [], matchedCoordinates = [] }: { alerts: MapAlert[]; region: Region; onRegionChange: (r: Region) => void; showUser: boolean; onSelect: (a: MapAlert) => void; cameraFollow?: boolean; currentPosition?: MapPosition | null; travelMode?: "driving" | "walking"; routeCoordinates?: Coordinate[]; matchedCoordinates?: Coordinate[] }) {
  const s = useStyles();
  const { colors } = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ latitude: region.latitude, longitude: region.longitude });
  const lastFollowAt = useRef(0);
  const latSpan = 0.06 / zoom;
  const minY = mercatorY(center.latitude - latSpan / 2);
  const maxY = mercatorY(center.latitude + latSpan / 2);
  const ySpan = maxY - minY;
  const lonSpan = size.height > 0 ? (ySpan * (size.width / size.height) * 180) / Math.PI : 0.1 / zoom;
  const bbox = `${center.longitude - lonSpan / 2},${center.latitude - latSpan / 2},${center.longitude + lonSpan / 2},${center.latitude + latSpan / 2}`;

  useEffect(() => {
    if (!cameraFollow || !currentPosition || Date.now() - lastFollowAt.current < 8000) return;
    lastFollowAt.current = Date.now();
    setCenter({ latitude: currentPosition.latitude, longitude: currentPosition.longitude });
    setZoom(7);
  }, [cameraFollow, currentPosition]);

  const vehiclePoint = currentPosition && size.width && size.height ? {
    x: ((currentPosition.longitude - (center.longitude - lonSpan / 2)) / lonSpan) * size.width,
    y: (1 - (mercatorY(currentPosition.latitude) - mercatorY(center.latitude - latSpan / 2)) /
      (mercatorY(center.latitude + latSpan / 2) - mercatorY(center.latitude - latSpan / 2))) * size.height,
  } : null;

  const pins = useMemo(() => {
    if (!size.width || !size.height) return [] as Pin[];
    const minLon = center.longitude - lonSpan / 2;
    const boundsMinY = mercatorY(center.latitude - latSpan / 2);
    const boundsYSpan = mercatorY(center.latitude + latSpan / 2) - boundsMinY;
    const result: Pin[] = [];
    for (const alert of alerts) {
      const x = ((alert.lng - minLon) / lonSpan) * size.width;
      const y = (1 - (mercatorY(alert.lat) - boundsMinY) / boundsYSpan) * size.height;
      if (x < 0 || x > size.width || y < 0 || y > size.height) continue;
      const nearby = result.find((pin) => Math.hypot(pin.x - x, pin.y - y) < 34);
      if (nearby) {
        nearby.alerts.push(alert);
        nearby.x = nearby.alerts.reduce((sum, item) => sum + ((item.lng - minLon) / lonSpan) * size.width, 0) / nearby.alerts.length;
        nearby.y = nearby.alerts.reduce((sum, item) => sum + (1 - (mercatorY(item.lat) - boundsMinY) / boundsYSpan) * size.height, 0) / nearby.alerts.length;
        nearby.latitude = nearby.alerts.reduce((sum, item) => sum + item.lat, 0) / nearby.alerts.length;
        nearby.longitude = nearby.alerts.reduce((sum, item) => sum + item.lng, 0) / nearby.alerts.length;
      } else {
        result.push({ latitude: alert.lat, longitude: alert.lng, alerts: [alert], x, y });
      }
    }
    return result;
  }, [alerts, center.latitude, center.longitude, latSpan, lonSpan, size.height, size.width]);

  const onMapLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  const lineSegments = (coordinates: Coordinate[], color: string, thickness: number) => {
    if (coordinates.length < 2 || !size.width || !size.height) return null;
    const minLon = center.longitude - lonSpan / 2;
    const minYValue = mercatorY(center.latitude - latSpan / 2);
    const ySpanValue = mercatorY(center.latitude + latSpan / 2) - minYValue;
    const project = (point: Coordinate) => ({
      x: ((point.longitude - minLon) / lonSpan) * size.width,
      y: (1 - (mercatorY(point.latitude) - minYValue) / ySpanValue) * size.height,
    });
    const stride = coordinates.length > 300 ? Math.ceil(coordinates.length / 300) : 1;
    const sampled = coordinates.filter((_, index) => index % stride === 0 || index === coordinates.length - 1);
    return sampled.slice(1).map((point, index) => {
      const first = project(sampled[index]);
      const last = project(point);
      const dx = last.x - first.x;
      const dy = last.y - first.y;
      const length = Math.hypot(dx, dy);
      if (!Number.isFinite(length) || length < 1 || length > Math.max(size.width, size.height) * 1.5) return null;
      return <View key={`${index}-${thickness}`} pointerEvents="none" style={{ position: "absolute", left: (first.x + last.x) / 2 - length / 2, top: (first.y + last.y) / 2 - thickness / 2, width: length, height: thickness, borderRadius: thickness / 2, backgroundColor: color, transform: [{ rotateZ: `${Math.atan2(dy, dx)}rad` }] }} />;
    });
  };

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceTertiary }]} testID="risk-map">
      <View style={s.mapArea} onLayout={onMapLayout}>
        <iframe title="Mapa de alertas da Rota Segura" style={{ border: 0, width: "100%", height: "100%", pointerEvents: "none" }} src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${center.latitude},${center.longitude}`} />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {lineSegments(routeCoordinates, colors.surface, 10)}
          {lineSegments(routeCoordinates, colors.brandPrimary, 6)}
          {lineSegments(matchedCoordinates, colors.success, 4)}
        </View>
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {pins.map((pin, index) => {
            const first = pin.alerts[0];
            const category = catOf(first.category);
            const color = colors[category.color] as string;
            const clustered = pin.alerts.length > 1;
            return (
              <Pressable
                key={first.id}
                testID={clustered ? `map-cluster-${index}` : `map-web-marker-${first.id}`}
                accessibilityRole="button"
                accessibilityLabel={clustered ? `${pin.alerts.length} alertas próximos` : `${category.label}: ${first.description}`}
                onPress={() => {
                  if (clustered) {
                    setCenter({ latitude: pin.latitude, longitude: pin.longitude });
                    setZoom((value) => Math.min(value * 1.8, 16));
                  } else onSelect(first);
                }}
                style={[s.pin, clustered ? s.clusterPin : { backgroundColor: color }, { left: pin.x - (clustered ? 20 : 15), top: pin.y - (clustered ? 20 : 30) }]}
              >
                {clustered ? <Txt style={s.clusterCount}>{pin.alerts.length}</Txt> : <Icon name={category.icon as any} size={17} color={colors.onError} />}
              </Pressable>
            );
          })}
        </View>
        {cameraFollow && currentPosition && vehiclePoint && vehiclePoint.x >= 0 && vehiclePoint.x <= size.width && vehiclePoint.y >= 0 && vehiclePoint.y <= size.height ? <View pointerEvents="none" style={[s.vehicleHalo, { left: vehiclePoint.x - 27, top: vehiclePoint.y - 27 }]}><View style={s.vehicleMarker}><View style={{ transform: [{ rotate: `${currentPosition.heading ?? 0}deg` }] }}><Icon name={travelMode === "driving" ? "car-sport" : "walk"} size={23} color={colors.brand} /></View></View></View> : null}
        <View style={s.navigation}>
          <Pressable testID="map-pan-north" accessibilityLabel="Mover mapa para o norte" onPress={() => setCenter((point) => ({ ...point, latitude: point.latitude + latSpan * 0.3 }))} style={s.zoomButton}><Icon name="chevron-up" size={20} color={colors.brand} /></Pressable>
          <View style={s.navigationRow}>
            <Pressable testID="map-pan-west" accessibilityLabel="Mover mapa para o oeste" onPress={() => setCenter((point) => ({ ...point, longitude: point.longitude - lonSpan * 0.3 }))} style={s.zoomButton}><Icon name="chevron-back" size={20} color={colors.brand} /></Pressable>
            <View style={s.zoomControl}>
              <Pressable testID="map-web-zoom-in" accessibilityLabel="Aumentar zoom" onPress={() => setZoom((value) => Math.min(value * 1.5, 16))} style={s.zoomButton}><Txt style={s.zoomText}>+</Txt></Pressable>
              <Pressable testID="map-web-zoom-out" accessibilityLabel="Reduzir zoom" onPress={() => setZoom((value) => Math.max(value / 1.5, 0.5))} style={s.zoomButton}><Txt style={s.zoomText}>−</Txt></Pressable>
            </View>
            <Pressable testID="map-pan-east" accessibilityLabel="Mover mapa para o leste" onPress={() => setCenter((point) => ({ ...point, longitude: point.longitude + lonSpan * 0.3 }))} style={s.zoomButton}><Icon name="chevron-forward" size={20} color={colors.brand} /></Pressable>
          </View>
          <Pressable testID="map-pan-south" accessibilityLabel="Mover mapa para o sul" onPress={() => setCenter((point) => ({ ...point, latitude: point.latitude - latSpan * 0.3 }))} style={s.zoomButton}><Icon name="chevron-down" size={20} color={colors.brand} /></Pressable>
        </View>
        <View style={s.mapCount}><Txt style={s.mapCountText}>{alerts.length} alerta(s) no mapa</Txt></View>
      </View>
      <ScrollView style={s.list} contentContainerStyle={{ padding: S.md, gap: S.sm }}>
        {alerts.length === 0 ? <Txt variant="small">Nenhum alerta corresponde aos filtros selecionados.</Txt> : alerts.map((a) => (
          <Pressable key={a.id} testID={`map-list-${a.id}`} onPress={() => onSelect(a)} style={s.item}>
            <Icon name={catOf(a.category).icon as any} size={20} color={colors[catOf(a.category).color] as string} />
            <Txt style={s.itemText} numberOfLines={1}>{catOf(a.category).label}: {a.description}</Txt>
            <Pressable accessibilityLabel="Abrir localização no Google Maps" onPress={() => Linking.openURL(`https://maps.google.com/?q=${a.lat},${a.lng}`)} hitSlop={8}>
              <Icon name="open-outline" size={18} color={colors.brand} />
            </Pressable>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  mapArea: { flex: 1, position: "relative" },
  list: { maxHeight: 220, backgroundColor: c.surface, borderTopLeftRadius: R.md, borderTopRightRadius: R.md },
  item: { flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: 44, paddingHorizontal: S.md, borderRadius: R.sm, backgroundColor: c.surfaceSecondary },
  itemText: { flex: 1, fontFamily: F.medium, fontSize: 14, color: c.onSurface },
  pin: { position: "absolute", width: 30, height: 30, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.surface, elevation: 5, shadowColor: c.brand, shadowOpacity: 0.3, shadowRadius: 5 },
  clusterPin: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brand },
  clusterCount: { color: c.onBrand, fontFamily: F.bold, fontSize: 13 },
  navigation: { position: "absolute", right: S.md, top: S.md, alignItems: "center", gap: S.xs },
  navigationRow: { flexDirection: "row", alignItems: "center", gap: S.xs },
  zoomControl: { gap: S.xs },
  zoomButton: { width: 40, height: 40, borderRadius: R.sm, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, elevation: 4 },
  zoomText: { fontFamily: F.bold, fontSize: 24, lineHeight: 28, color: c.brand },
  mapCount: { position: "absolute", left: S.md, bottom: S.md, backgroundColor: c.surface, borderRadius: R.pill, paddingHorizontal: S.md, paddingVertical: S.xs, elevation: 3 },
  mapCountText: { fontFamily: F.semibold, fontSize: 12, color: c.onSurface },
  vehicleHalo: { position: "absolute", width: 54, height: 54, borderRadius: 27, backgroundColor: "rgba(255,255,255,0.38)", alignItems: "center", justifyContent: "center" },
  vehicleMarker: { width: 42, height: 42, borderRadius: 21, borderWidth: 3, borderColor: "#FFFFFF", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", elevation: 7 },
}));
