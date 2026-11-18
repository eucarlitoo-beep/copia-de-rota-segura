import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api, errMsg } from "@/src/api";
import { CATEGORIES, F, R, S } from "@/src/constants";
import { Card, Empty, Icon, ScreenHeader, Txt } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

type Granularity = "day" | "week" | "month";
type Statistics = {
  days: number;
  granularity: Granularity;
  total: number;
  categories: { category: string; total: number }[];
  neighborhoods: { neighborhood: string; total: number; categories: Record<string, number> }[];
  neighborhoodOptions: { neighborhood: string; total: number }[];
  localities: { locality: string; region: string | null; total: number; categories: Record<string, number> }[];
  localityOptions: { locality: string; total: number }[];
  regions: { region: string; total: number; categories: Record<string, number> }[];
  regionOptions: { region: string; total: number }[];
  streets: { street: string; neighborhood: string | null; locality: string | null; region: string | null; total: number }[];
  timeline: { period: string; category: string; total: number }[];
};

const PERIODS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
  { days: 365, label: "1 ano" },
] as const;
const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: "day", label: "Dia" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mês" },
];

export default function StatisticsScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState(30);
  const [category, setCategory] = useState<string | null>(null);
  const [neighborhood, setNeighborhood] = useState<string | null>(null);
  const [locality, setLocality] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const queryKey = useMemo(() => ["alert-statistics", days, category, neighborhood, locality, region, granularity], [days, category, neighborhood, locality, region, granularity]);
  const query = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams({ days: String(days), granularity });
      if (category) params.set("category", category);
      if (neighborhood) params.set("neighborhood", neighborhood);
      if (locality) params.set("locality", locality);
      if (region) params.set("region", region);
      return api<Statistics>(`/alerts/statistics?${params.toString()}`);
    },
    staleTime: 30_000,
  });
  useFocusEffect(useCallback(() => { void query.refetch(); }, [query.refetch]));

  const data = query.data;
  const categoryRows = useMemo(() => CATEGORIES.map((item) => ({ ...item, total: data?.categories.find((row) => row.category === item.key)?.total ?? 0 }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR")), [data?.categories]);
  const maxCategory = Math.max(1, ...categoryRows.map((row) => row.total));
  const maxNeighborhood = Math.max(1, ...(data?.neighborhoods.map((row) => row.total) ?? []));
  const trendTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of data?.timeline ?? []) totals.set(row.period, (totals.get(row.period) ?? 0) + row.total);
    return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, total]) => ({ period, total }));
  }, [data?.timeline]);
  const maxTrend = Math.max(1, ...trendTotals.map((row) => row.total));
  const options = data?.neighborhoodOptions ?? [];
  const localityOptions = data?.localityOptions ?? [];
  const regionOptions = data?.regionOptions ?? [];

  return (
    <View style={s.root} testID="statistics-screen">
      <ScreenHeader title="Estatísticas" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + S.xl }]}>
        <Card style={s.hero}>
          <View style={s.heroTop}>
            <View style={s.heroIcon}><Icon name="analytics" size={22} color={colors.onBrandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Txt variant="small" style={{ color: colors.onBrand }}>Registros aprovados pela comunidade</Txt>
              <Txt style={s.heroValue} testID="statistics-total">{query.isLoading ? "—" : data?.total ?? 0}</Txt>
            </View>
          </View>
          <Txt variant="small" style={{ color: colors.onBrand }}>Os números vêm dos relatos moderados no banco. Locais não informados ficam fora dos respectivos agrupamentos; endereços não são exibidos.</Txt>
        </Card>

        <Card style={s.section}>
          <Txt variant="h2">Período</Txt>
          <View style={s.chips}>
            {PERIODS.map((item) => <FilterChip key={item.days} label={item.label} active={days === item.days} testID={`statistics-period-${item.days}`} onPress={() => setDays(item.days)} />)}
          </View>
          <Txt variant="h2" style={s.filterTitle}>Tipo de ocorrência</Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.horizontalChips}>
            <FilterChip label="Todos" active={!category} testID="statistics-category-all" onPress={() => setCategory(null)} />
            {CATEGORIES.map((item) => <FilterChip key={item.key} label={item.label} active={category === item.key} testID={`statistics-category-${item.key}`} onPress={() => setCategory(category === item.key ? null : item.key)} />)}
          </ScrollView>
          <Txt variant="h2" style={s.filterTitle}>Região ou estado</Txt>
          {regionOptions.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.horizontalChips}>
            <FilterChip label="Todas" active={!region} testID="statistics-region-all" onPress={() => setRegion(null)} />
            {regionOptions.map((item) => <FilterChip key={item.region} label={`${item.region} · ${item.total}`} active={region === item.region} testID={`statistics-region-${item.region}`} onPress={() => setRegion(region === item.region ? null : item.region)} />)}
          </ScrollView> : <Txt variant="small">Sem regiões informadas neste período.</Txt>}
          <Txt variant="h2" style={s.filterTitle}>Localidade ou município</Txt>
          {localityOptions.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.horizontalChips}>
            <FilterChip label="Todas" active={!locality} testID="statistics-locality-all" onPress={() => setLocality(null)} />
            {localityOptions.map((item) => <FilterChip key={item.locality} label={`${item.locality} · ${item.total}`} active={locality === item.locality} testID={`statistics-locality-${item.locality}`} onPress={() => setLocality(locality === item.locality ? null : item.locality)} />)}
          </ScrollView> : <Txt variant="small">Sem localidades informadas neste período.</Txt>}
          <Txt variant="h2" style={s.filterTitle}>Bairro</Txt>
          {options.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.horizontalChips}>
            <FilterChip label="Todos" active={!neighborhood} testID="statistics-neighborhood-all" onPress={() => setNeighborhood(null)} />
            {options.map((item) => <FilterChip key={item.neighborhood} label={`${item.neighborhood} · ${item.total}`} active={neighborhood === item.neighborhood} testID={`statistics-neighborhood-${item.neighborhood}`} onPress={() => setNeighborhood(neighborhood === item.neighborhood ? null : item.neighborhood)} />)}
          </ScrollView> : <Txt variant="small">Sem bairros informados neste período.</Txt>}
        </Card>

        {query.isLoading ? <View style={s.loading}><ActivityIndicator size="large" color={colors.brandPrimary} /></View> : null}
        {query.isError ? <Card style={s.section} testID="statistics-error"><Empty icon="cloud-offline" title="Não foi possível carregar as estatísticas" text={errMsg(query.error)} /></Card> : null}

        {!query.isLoading && !query.isError && data?.total === 0 ? <Card style={s.section} testID="statistics-empty"><Empty icon="analytics" title="Ainda não há ocorrências aprovadas" text="Ajuste os filtros ou volte quando novos relatos forem aprovados. Nenhum dado de demonstração é exibido." /></Card> : null}

        {!query.isLoading && !query.isError && (data?.total ?? 0) > 0 ? <>
          <Card style={s.section} testID="statistics-category-chart">
            <SectionTitle title="Tipos de risco" subtitle="Distribuição percentual dos registros filtrados" />
            <View style={s.distribution} accessibilityLabel="Distribuição percentual por tipo de risco">
              {data!.categories.map((row) => {
                const item = CATEGORIES.find((entry) => entry.key === row.category);
                const color = item ? colors[item.color] as string : colors.muted;
                return <View key={row.category} style={{ flex: row.total, height: 12, backgroundColor: color }} />;
              })}
            </View>
            {categoryRows.map((item) => {
              const count = item.total;
              if (count === 0 && category !== item.key) return null;
              const pct = data!.total ? Math.round((count / data!.total) * 100) : 0;
              return <Pressable key={item.key} testID={`statistics-type-row-${item.key}`} onPress={() => setCategory(category === item.key ? null : item.key)} style={s.chartRow}>
                <View style={[s.dot, { backgroundColor: colors[item.color] as string }]} />
                <Txt style={s.rowLabel} numberOfLines={1}>{item.label}</Txt>
                <View style={s.typeTrack}><View style={[s.typeBar, { backgroundColor: colors[item.color] as string, width: `${count ? Math.max(3, (count / maxCategory) * 100) : 0}%` as `${number}%` }]} /></View>
                <Txt style={s.rowValue}>{count} · {pct}%</Txt>
              </Pressable>;
            })}
          </Card>

          <Card style={s.section} testID="statistics-neighborhood-chart">
            <SectionTitle title="Ranking e comparação por bairro" subtitle="Contagem de relatos aprovados, sem estimar taxa de risco" />
            {data!.neighborhoods.length ? data!.neighborhoods.slice(0, 12).map((row, index) => <Pressable key={row.neighborhood} testID={`statistics-rank-${index}`} onPress={() => setNeighborhood(neighborhood === row.neighborhood ? null : row.neighborhood)} style={s.rankRow}>
              <Txt style={s.rankNumber}>{String(index + 1).padStart(2, "0")}</Txt>
              <View style={s.rankBody}>
                <View style={s.rankLabels}><Txt style={s.rowLabel} numberOfLines={1}>{row.neighborhood}</Txt><Txt style={s.rowValue}>{row.total}</Txt></View>
                <View style={s.track}><View style={[s.rankBar, { width: `${Math.max(4, (row.total / maxNeighborhood) * 100)}%` as `${number}%` }]} /></View>
              </View>
            </Pressable>) : <Txt variant="small">Ainda não existem relatos com bairro informado.</Txt>}
          </Card>

          <Card style={s.section} testID="statistics-geographic-breakdown">
            <SectionTitle title="Regiões e localidades" subtitle="Agrupamento das localidades informadas nos relatos aprovados" />
            {data!.regions.length ? data!.regions.slice(0, 8).map((row, index) => <View key={row.region} testID={`statistics-region-row-${index}`} style={s.rankRow}>
              <View style={s.rankBody}><View style={s.rankLabels}><Txt style={s.rowLabel}>{row.region}</Txt><Txt style={s.rowValue}>{row.total}</Txt></View></View>
            </View>) : <Txt variant="small">Ainda não há regiões informadas.</Txt>}
            {data!.localities.length ? data!.localities.slice(0, 8).map((row, index) => <View key={`${row.locality}-${row.region}`} testID={`statistics-locality-row-${index}`} style={s.rankRow}>
              <View style={s.rankBody}><View style={s.rankLabels}><View style={{ flex: 1 }}><Txt style={s.rowLabel}>{row.locality}</Txt><Txt variant="small">{row.region || "Região não informada"}</Txt></View><Txt style={s.rowValue}>{row.total}</Txt></View></View>
            </View>) : <Txt variant="small">Ainda não há localidades informadas.</Txt>}
          </Card>

          <Card style={s.section} testID="statistics-timeline-chart">
            <SectionTitle title="Evolução das ocorrências" subtitle="Total por intervalo no período selecionado" />
            <View style={s.chips}>{GRANULARITIES.map((item) => <FilterChip key={item.key} label={item.label} active={granularity === item.key} testID={`statistics-granularity-${item.key}`} onPress={() => setGranularity(item.key)} />)}</View>
            {trendTotals.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.timeline}>
              {trendTotals.map((row) => <View key={row.period} style={s.timelineColumn} testID={`statistics-period-row-${row.period}`}>
                <Txt style={s.timelineValue}>{row.total}</Txt>
                <View style={s.timelineTrack}><View style={[s.timelineBar, { height: `${Math.max(5, (row.total / maxTrend) * 100)}%` as `${number}%` }]} /></View>
                <Txt style={s.timelineLabel} numberOfLines={1}>{row.period}</Txt>
              </View>)}
            </ScrollView> : <Txt variant="small">Não há registros neste intervalo.</Txt>}
          </Card>

          <Card style={s.section} testID="statistics-streets">
            <SectionTitle title="Ruas e localidades" subtitle="Exibidas quando foram informadas no relato" />
            {data!.streets.length ? data!.streets.slice(0, 12).map((row, index) => {
              return <View key={`${row.street}-${row.neighborhood}-${row.locality}-${row.region}`} testID={`statistics-street-row-${index}`} style={s.streetRow}>
                <View style={s.streetIcon}><Icon name="location" size={17} color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}><Txt style={s.rowLabel}>{row.street}</Txt><Txt variant="small">{[row.neighborhood, row.locality, row.region].filter(Boolean).join(" · ") || "Área não informada"}</Txt></View>
                <Txt style={s.rowValue}>{row.total}</Txt>
              </View>;
            }) : <Txt variant="small">Ruas aparecem quando há pelo menos 3 relatos aprovados de pessoas diferentes neste filtro. Nenhuma rua atende a esse limite agora.</Txt>}
          </Card>
        </> : null}
        <Txt variant="small" style={s.footnote}>Dados colaborativos baseados em relatos aprovados. Eles representam quantidade de registros e não medem a probabilidade de ocorrência em cada local.</Txt>
      </ScrollView>
    </View>
  );
}

function FilterChip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[s.chip, active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}>
    <Txt style={[s.chipText, active && { color: colors.onBrandTertiary }]} numberOfLines={1}>{label}</Txt>
  </Pressable>;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  const s = useStyles();
  return <View style={{ gap: S.xs }}><Txt variant="h2">{title}</Txt><Txt variant="small" style={s.subtitle}>{subtitle}</Txt></View>;
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  content: { padding: S.lg, gap: S.md },
  hero: { backgroundColor: c.brand, borderColor: c.brand, gap: S.md },
  heroTop: { flexDirection: "row", alignItems: "center", gap: S.md },
  heroIcon: { width: 48, height: 48, borderRadius: R.md, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  heroValue: { color: c.onBrand, fontFamily: F.black, fontSize: 34 },
  section: { gap: S.md },
  filterTitle: { marginTop: S.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: S.sm },
  horizontalChips: { gap: S.sm, paddingVertical: 2 },
  chip: { minHeight: 36, maxWidth: 240, justifyContent: "center", paddingHorizontal: S.md, borderRadius: R.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  chipText: { fontFamily: F.semibold, fontSize: 12, color: c.onSurfaceSecondary },
  loading: { padding: S.xl },
  subtitle: { color: c.muted },
  distribution: { height: 12, flexDirection: "row", borderRadius: R.pill, overflow: "hidden", backgroundColor: c.surfaceTertiary },
  chartRow: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: S.sm },
  dot: { width: 9, height: 9, borderRadius: R.pill },
  rowLabel: { flex: 1, fontFamily: F.semibold, fontSize: 13, color: c.onSurface },
  typeTrack: { width: 64, height: 7, borderRadius: R.pill, overflow: "hidden", backgroundColor: c.surfaceTertiary },
  typeBar: { height: 7, borderRadius: R.pill },
  rowValue: { minWidth: 58, textAlign: "right", fontFamily: F.bold, fontSize: 12, color: c.onSurface },
  rankRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: S.md },
  rankNumber: { width: 26, color: c.muted, fontFamily: F.bold, fontSize: 12 },
  rankBody: { flex: 1, gap: 5 },
  rankLabels: { flexDirection: "row", alignItems: "center", gap: S.md },
  track: { height: 8, borderRadius: R.pill, overflow: "hidden", backgroundColor: c.surfaceTertiary },
  rankBar: { height: 8, borderRadius: R.pill, backgroundColor: c.error },
  timeline: { alignItems: "flex-end", gap: S.sm, paddingTop: S.md },
  timelineColumn: { width: 44, height: 142, alignItems: "center", justifyContent: "flex-end", gap: 5 },
  timelineValue: { fontFamily: F.bold, fontSize: 10, color: c.onSurfaceSecondary },
  timelineTrack: { width: 20, height: 104, justifyContent: "flex-end", borderRadius: R.pill, overflow: "hidden", backgroundColor: c.surfaceTertiary },
  timelineBar: { width: 20, borderRadius: R.pill, backgroundColor: c.brandPrimary },
  timelineLabel: { width: 44, textAlign: "center", fontSize: 9, fontFamily: F.medium, color: c.muted },
  streetRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: S.md, borderBottomWidth: 1, borderBottomColor: c.divider, paddingVertical: S.xs },
  streetIcon: { width: 34, height: 34, borderRadius: R.sm, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  footnote: { color: c.muted, lineHeight: 17, paddingHorizontal: S.xs },
}));
