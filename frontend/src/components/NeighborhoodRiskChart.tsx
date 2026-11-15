import Animated, { FadeInRight, FadeInUp, LinearTransition } from "react-native-reanimated";
import { Linking, Pressable, View } from "react-native";

import { catOf, F, R, S } from "@/src/constants";
import { Icon, Txt } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { sspVehicleStats2025 } from "@/src/data/sspVehicleStats2025";

export type NeighborhoodStats = { source: string; hours: number; neighborhoods: { neighborhood: string; total: number; categories: Record<string, number> }[] };

export function NeighborhoodRiskChart({ data }: { data: NeighborhoodStats | null }) {
  const s = useStyles();
  const { colors } = useTheme();
  const rows = data?.neighborhoods ?? [];
  const peak = Math.max(1, ...rows.map((row) => row.total));
  const officialRows = sspVehicleStats2025.neighborhoods.slice(0, 8);
  const officialPeak = Math.max(1, ...officialRows.map((row) => row.roubo + row.furto));
  return (
    <Animated.View entering={FadeInUp.duration(380)} style={s.card} testID="neighborhood-risk-chart">
      <View style={s.header}>
        <View style={{ flex: 1 }}><Txt style={s.title}>Ocorrências por bairro</Txt><Txt variant="small">Últimos {Math.round((data?.hours ?? 720) / 24)} dias</Txt></View>
        <Icon name="map" size={22} color={colors.brandPrimary} />
      </View>
      {rows.length ? rows.slice(0, 8).map((row, index) => {
        const width = `${Math.max(7, (row.total / peak) * 100)}%` as `${number}%`;
        return <Animated.View key={row.neighborhood} entering={FadeInRight.delay(index * 50).duration(320)} layout={LinearTransition.duration(400)} style={s.row} testID={`neighborhood-row-${index}`}>
          <View style={{ flex: 1, gap: 5 }}><View style={s.labelLine}><Txt style={s.name} numberOfLines={1}>{row.neighborhood}</Txt><Txt style={s.value}>{row.total}</Txt></View><View style={s.track}><Animated.View layout={LinearTransition.duration(450)} style={[s.bar, { width }]} /></View><View style={s.categoryList}>{Object.entries(row.categories).sort((a, b) => b[1] - a[1]).map(([key, count]) => { const category = catOf(key); return <View key={key} style={s.category}><Icon name={category.icon as any} size={12} color={colors[category.color] as string} /><Txt style={s.categoryText}>{category.label}: {count}</Txt></View>; })}</View></View>
        </Animated.View>;
      }) : <Txt style={s.empty}>Ainda não há relatos aprovados com bairro informado para este período.</Txt>}
      <Txt style={s.source}>Fonte: {data?.source ?? "relatos aprovados da comunidade"}. Indicador colaborativo; não representa estatística oficial nem taxa de criminalidade.</Txt>
      <View style={s.officialData} testID="official-vehicle-statistics">
        <View style={s.header}>
          <View style={{ flex: 1 }}><Txt style={s.title}>Salvador · dados oficiais de 2025</Txt><Txt variant="small">Roubo e furto de veículos por bairro</Txt></View>
          <Icon name="shield-checkmark" size={22} color={colors.success} />
        </View>
        <View style={s.legend}>
          <View style={s.category}><Icon name="car" size={13} color={colors.error} /><Txt style={s.categoryText}>Roubo</Txt></View>
          <View style={s.category}><Icon name="key" size={13} color={colors.warning} /><Txt style={s.categoryText}>Furto</Txt></View>
        </View>
        {officialRows.map((row, index) => {
          const total = row.roubo + row.furto;
          const width = `${Math.max(7, (total / officialPeak) * 100)}%` as `${number}%`;
          return <Animated.View key={row.neighborhood} entering={FadeInRight.delay(index * 45).duration(320)} layout={LinearTransition.duration(380)} style={s.row} testID={`official-neighborhood-row-${index}`}>
            <View style={{ flex: 1, gap: 5 }}>
              <View style={s.labelLine}><Txt style={s.name} numberOfLines={1}>{row.neighborhood}</Txt><Txt style={s.value}>{total}</Txt></View>
              <View style={s.track}><Animated.View layout={LinearTransition.duration(420)} style={[s.bar, { width }]} /></View>
              <View style={s.categoryList}><Txt style={s.categoryText}>Roubo: {row.roubo}</Txt><Txt style={s.categoryText}>Furto: {row.furto}</Txt></View>
            </View>
          </Animated.View>;
        })}
        <Txt style={s.source}>Fonte: SSP-BA, microdados de janeiro a dezembro de 2025; atualização publicada em 18/03/2026. A contagem cobre apenas registros de roubo/furto de veículos e não mede o risco geral do bairro.</Txt>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(sspVehicleStats2025.sourceUrl)} style={s.sourceLink}><Icon name="open-outline" size={15} color={colors.brand} /><Txt style={s.linkText}>Abrir microdados de veículos da SSP-BA</Txt></Pressable>
      </View>
      <View style={s.officialSources}>
        <Txt style={s.officialTitle}>Dados oficiais da Bahia</Txt>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL("https://www.ba.gov.br/ssp/informacoes-criminais-0")} style={s.sourceLink}><Icon name="open-outline" size={15} color={colors.brand} /><Txt style={s.linkText}>SSP-BA: estatísticas criminais e Anuário</Txt></Pressable>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL("https://www.ba.gov.br/ssp/estatistica")} style={s.sourceLink}><Icon name="open-outline" size={15} color={colors.brand} /><Txt style={s.linkText}>SSP-BA: microdados por ano</Txt></Pressable>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL("https://infovis.sei.ba.gov.br/segurancapublica/")} style={s.sourceLink}><Icon name="open-outline" size={15} color={colors.brand} /><Txt style={s.linkText}>SEI/SSP-BA: painel de segurança pública</Txt></Pressable>
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.surface, borderRadius: R.md, borderWidth: 1, borderColor: c.border, padding: S.lg, gap: S.md },
  header: { flexDirection: "row", alignItems: "center", gap: S.md },
  title: { fontFamily: F.bold, fontSize: 17, color: c.onSurface },
  row: { flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: 38 },
  labelLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.sm },
  name: { flex: 1, fontFamily: F.semibold, fontSize: 13, color: c.onSurface },
  value: { fontFamily: F.bold, fontSize: 13, color: c.onSurface },
  track: { height: 7, borderRadius: R.pill, overflow: "hidden", backgroundColor: c.surfaceTertiary },
  bar: { height: 7, borderRadius: R.pill, backgroundColor: c.error },
  categoryList: { flexDirection: "row", flexWrap: "wrap", gap: S.xs },
  category: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: R.pill, backgroundColor: c.surfaceSecondary, paddingHorizontal: S.xs, paddingVertical: 2 },
  categoryText: { fontFamily: F.medium, fontSize: 10, color: c.onSurfaceSecondary },
  source: { fontFamily: F.medium, fontSize: 11, lineHeight: 16, color: c.muted },
  officialSources: { gap: S.xs, paddingTop: S.sm, borderTopWidth: 1, borderTopColor: c.border },
  officialData: { gap: S.sm, paddingTop: S.md, borderTopWidth: 1, borderTopColor: c.border },
  legend: { flexDirection: "row", gap: S.md },
  officialTitle: { fontFamily: F.bold, fontSize: 12, color: c.onSurface },
  sourceLink: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: S.sm },
  linkText: { fontFamily: F.semibold, fontSize: 12, color: c.brand, textDecorationLine: "underline" },
  empty: { fontFamily: F.medium, fontSize: 12, color: c.muted },
}));
