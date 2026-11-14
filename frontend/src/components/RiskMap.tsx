import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, Region } from "react-native-maps";

import { catOf } from "@/src/constants";
import { Icon } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

export type MapAlert = { id: string; category: string; description: string; lat: number; lng: number; created_at: string };
export type MapPosition = { latitude: number; longitude: number; heading: number | null };

export function RiskMap({
  alerts, region, onRegionChange, showUser, onSelect, cameraFollow = false, currentPosition = null, routeCoordinates = [], matchedCoordinates = [],
}: { alerts: MapAlert[]; region: Region; onRegionChange: (r: Region) => void; showUser: boolean; onSelect: (a: MapAlert) => void; cameraFollow?: boolean; currentPosition?: MapPosition | null; routeCoordinates?: { latitude: number; longitude: number }[]; matchedCoordinates?: { latitude: number; longitude: number }[] }) {
  const s = useStyles();
  const { colors } = useTheme();
  const mapRef = useRef<MapView>(null);
  const lastCenter = useRef({ latitude: region.latitude, longitude: region.longitude });

  // initialRegion só é lido na montagem. Recentralize quando GPS/cidade mudar.
  useEffect(() => {
    const previous = lastCenter.current;
    const moved = Math.abs(previous.latitude - region.latitude) > 0.00001 || Math.abs(previous.longitude - region.longitude) > 0.00001;
    lastCenter.current = { latitude: region.latitude, longitude: region.longitude };
    if (moved) mapRef.current?.animateToRegion(region, 450);
  }, [region]);

  useEffect(() => {
    if (!cameraFollow || !currentPosition) return;
    mapRef.current?.animateCamera({
      center: { latitude: currentPosition.latitude, longitude: currentPosition.longitude },
      heading: currentPosition.heading ?? 0,
      pitch: 52,
      zoom: 18,
    }, { duration: 500 });
  }, [cameraFollow, currentPosition]);

  const markers = useMemo(
    () =>
      alerts.filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng) && Math.abs(a.lat) <= 90 && Math.abs(a.lng) <= 180).map((a) => (
        <Marker
          key={a.id}
          testID={`map-marker-${a.id}`}
          coordinate={{ latitude: a.lat, longitude: a.lng }}
          title={catOf(a.category).label}
          description={a.description}
          anchor={{ x: 0.5, y: 0.88 }}
          onPress={() => onSelect(a)}
        >
          <View style={s.pinWrap}>
            <View style={[s.pin, { backgroundColor: colors[catOf(a.category).color] as string }]}>
              <Icon name={catOf(a.category).icon as any} size={19} color={colors.onError} />
            </View>
            <View style={[s.pinTail, { borderTopColor: colors[catOf(a.category).color] as string }]} />
          </View>
        </Marker>
      )),
    [alerts, colors, onSelect, s.pin, s.pinTail, s.pinWrap],
  );
  return (
    <MapView
      ref={mapRef}
      testID="risk-map"
      provider={PROVIDER_DEFAULT}
      style={StyleSheet.absoluteFill}
      initialRegion={region}
      onRegionChangeComplete={onRegionChange}
      showsUserLocation={showUser}
      showsMyLocationButton={false}
      showsCompass
      toolbarEnabled={false}
    >
      {routeCoordinates.length > 1 ? <Polyline coordinates={routeCoordinates} strokeColor={colors.brandSoft} strokeWidth={10} zIndex={1} /> : null}
      {routeCoordinates.length > 1 ? <Polyline coordinates={routeCoordinates} strokeColor={colors.brandPrimary} strokeWidth={6} zIndex={2} /> : null}
      {matchedCoordinates.length > 1 ? <Polyline coordinates={matchedCoordinates} strokeColor={colors.success} strokeWidth={5} zIndex={3} /> : null}
      {markers}
    </MapView>
  );
}

const useStyles = makeStyles((c) => ({
  pinWrap: { width: 44, height: 48, alignItems: "center", justifyContent: "flex-start" },
  pin: { width: 38, height: 38, borderRadius: 20, borderWidth: 3, borderColor: c.surface, alignItems: "center", justifyContent: "center", elevation: 5, shadowColor: c.brand, shadowOpacity: 0.32, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  pinTail: { position: "absolute", bottom: 0, width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 9, borderLeftColor: "transparent", borderRightColor: "transparent" },
}));
