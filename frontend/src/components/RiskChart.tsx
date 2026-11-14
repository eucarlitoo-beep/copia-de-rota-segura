import Animated, { FadeInRight, FadeInUp, LinearTransition } from "react-native-reanimated";
import { View } from "react-native";

import { CATEGORIES, F, R, S } from "@/src/constants";
import { Icon, Txt } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

type RiskDatum = { category: string };

export function RiskChart({ alerts }: { alerts: RiskDatum[] }) {
  const s = useStyles();
  const { colors } = useTheme();
  const counts = CATEGORIES.map((category) => ({ ...category, count: alerts.filter((alert) => alert.category === category.key).length }));
  const peak = Math.max(1, ...counts.map((item) => item.count));
  const leading = counts.reduce((best, item) => (item.count > best.count ? item : best), counts[0]);

  return (
    <Animated.View entering={FadeInUp.duration(380)} style={s.card} testID="risk-chart">
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Txt style={s.title}>Tipos de risco</Txt>
          <Txt variant="small">Distribuição dos alertas carregados</Txt>
        </View>
        <View style={s.total}>
          <Txt style={s.totalValue}>{alerts.length}</Txt>
          <Txt style={s.totalLabel}>total</Txt>
        </View>
      </View>
      {alerts.length > 0 ? (
        <View style={s.summary}>
          <Icon name={leading.icon as any} size={17} color={colors[leading.color] as string} />
          <Txt style={s.summaryText}>Mais frequente: {leading.label} ({leading.count})</Txt>
        </View>
      ) : null}
      <View style={{ gap: S.md }}>
        {counts.map((item, index) => {
          const width = `${item.count === 0 ? 0 : Math.max(7, (item.count / peak) * 100)}%` as `${number}%`;
          return (
            <Animated.View key={item.key} entering={FadeInRight.delay(index * 55).duration(360)} layout={LinearTransition.duration(420)} style={s.row} testID={`risk-chart-row-${item.key}`}>
              <View style={[s.icon, { backgroundColor: colors[item.color] as string }]}>
                <Icon name={item.icon as any} size={15} color={colors.onError} />
              </View>
              <View style={s.details}>
                <View style={s.labelLine}>
                  <Txt style={s.label} numberOfLines={1}>{item.label}</Txt>
                  <Txt style={s.value}>{item.count}</Txt>
                </View>
                <View style={s.track}>
                  <Animated.View layout={LinearTransition.duration(520)} style={[s.bar, { backgroundColor: colors[item.color] as string, width }]} />
                </View>
              </View>
              <Txt style={s.percent}>{alerts.length ? `${Math.round((item.count / alerts.length) * 100)}%` : "0%"}</Txt>
            </Animated.View>
          );
        })}
      </View>
      {alerts.length === 0 ? <Txt style={s.empty}>Ainda não há alertas para montar o gráfico.</Txt> : null}
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.surface, borderRadius: R.md, borderWidth: 1, borderColor: c.border, padding: S.lg, gap: S.md },
  header: { flexDirection: "row", alignItems: "center", gap: S.md },
  title: { fontFamily: F.bold, fontSize: 17, color: c.onSurface },
  total: { minWidth: 54, alignItems: "center", backgroundColor: c.brandSoft, borderRadius: R.sm, paddingHorizontal: S.sm, paddingVertical: S.xs },
  totalValue: { fontFamily: F.black, fontSize: 18, color: c.brand },
  totalLabel: { fontFamily: F.medium, fontSize: 10, color: c.muted },
  summary: { flexDirection: "row", alignItems: "center", gap: S.sm, borderRadius: R.sm, backgroundColor: c.surfaceSecondary, padding: S.sm },
  summaryText: { fontFamily: F.semibold, fontSize: 12, color: c.onSurface },
  row: { flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: 32 },
  icon: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  details: { flex: 1, gap: 5 },
  labelLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.sm },
  label: { flex: 1, fontFamily: F.medium, fontSize: 12, color: c.onSurface },
  value: { fontFamily: F.bold, fontSize: 12, color: c.onSurface },
  track: { height: 7, borderRadius: R.pill, overflow: "hidden", backgroundColor: c.surfaceTertiary },
  bar: { height: 7, borderRadius: R.pill },
  percent: { width: 34, textAlign: "right", fontFamily: F.semibold, fontSize: 11, color: c.muted },
  empty: { fontFamily: F.medium, fontSize: 12, color: c.muted },
}));
