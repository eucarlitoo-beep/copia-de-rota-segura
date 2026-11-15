import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errMsg } from "@/src/api";
import { useAuth } from "@/src/auth";
import { brl, catOf, F, R, S } from "@/src/constants";
import { Btn, Empty, Field, Icon, ScreenHeader, Sheet, Txt, useToast } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { fmtDate } from "@/src/time";

type Tab = "moderacao" | "forum" | "usuarios" | "planos" | "autoridades" | "sugestoes";
type A = { id: string; category: string; description: string; created_at: string; flags: number; lat: number; lng: number; flag_reasons?: string[] };
type U = { id: string; name: string; email: string; role: string; is_premium: boolean; blocked: boolean };
type P = { id: string; name: string; price_cents: number; interval: string };
type Authority = { id: string; name: string; integration_status: string; created_at: string };
type Feedback = { id: string; category: "sugestao" | "problema" | "funcionalidade"; message: string; status: string; created_at: string };
type ForumPost = { id: string; author: string; message: string; topic?: string; reports: number; hidden: boolean; report_reasons?: string[]; created_at: string };

export default function Admin() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("moderacao");
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [alerts, setAlerts] = useState<A[] | null>(null);
  const [users, setUsers] = useState<U[] | null>(null);
  const [plans, setPlans] = useState<P[] | null>(null);
  const [authorities, setAuthorities] = useState<Authority[] | null>(null);
  const [authorityName, setAuthorityName] = useState("");
  const [authorityKeyword, setAuthorityKeyword] = useState("");
  const [editingAuthorityId, setEditingAuthorityId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback[] | null>(null);
  const [forumPosts, setForumPosts] = useState<ForumPost[] | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<A | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    api("/admin/stats").then(setStats).catch(() => {});
    api<A[]>("/admin/alerts?status=pendente").then(setAlerts).catch((e) => toast(errMsg(e), "error"));
    api<U[]>("/admin/users").then(setUsers).catch(() => {});
    api<P[]>("/plans").then((p) => {
      setPlans(p);
      setPrices(Object.fromEntries(p.map((x) => [x.id, (x.price_cents / 100).toFixed(2).replace(".", ",")])));
    }).catch(() => {});
    api<Authority[]>("/admin/authorities").then(setAuthorities).catch(() => {});
    api<Feedback[]>("/admin/feedback").then(setFeedback).catch(() => {});
    api<ForumPost[]>("/admin/community/messages").then(setForumPosts).catch(() => {});
  }, [toast]);
  useEffect(load, [load]);

  if (user?.role !== "admin") return <View style={s.root}><ScreenHeader title="Admin" /><Empty icon="lock-closed" title="Acesso restrito" /></View>;

  const moderate = async (a: A, decision: "aprovado" | "rejeitado", why = "") => {
    try {
      await api(`/admin/alerts/${a.id}/moderate`, { method: "POST", body: { decision, reason: why } });
      setAlerts((p) => p?.filter((x) => x.id !== a.id) ?? null);
      toast(decision === "aprovado" ? "Alerta publicado." : "Alerta rejeitado.", "success");
      api("/admin/stats").then(setStats).catch(() => {});
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };

  const moderateForumPost = async (post: ForumPost, decision: "manter" | "ocultar") => {
    try {
      await api(`/admin/community/messages/${post.id}/moderate`, { method: "POST", body: { decision } });
      setForumPosts((items) => items?.filter((item) => item.id !== post.id) ?? []);
      toast(decision === "manter" ? "Publicação mantida no fórum." : "Publicação ocultada do fórum.", "success");
    } catch (e) { toast(errMsg(e), "error"); }
  };

  const block = async (u: U) => {
    try {
      await api(`/admin/users/${u.id}/block`, { method: "POST", body: { blocked: !u.blocked } });
      setUsers((p) => p?.map((x) => (x.id === u.id ? { ...x, blocked: !u.blocked } : x)) ?? null);
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };

  const savePrice = async (p: P) => {
    const cents = Math.round(parseFloat((prices[p.id] ?? "0").replace(/\./g, "").replace(",", ".")) * 100);
    if (Number.isNaN(cents) || cents < 0) return toast("Valor inválido.", "error");
    try {
      await api(`/admin/plans/${p.id}`, { method: "PUT", body: { price_cents: cents, name: p.name } });
      toast(`Preço atualizado: ${brl(cents)}`, "success");
      load();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };

  const saveAuthority = async () => {
    if (authorityName.trim().length < 2 || authorityKeyword.trim().length < 3) return toast("Informe o nome e a palavra-chave da autoridade.", "error");
    try {
      await api(editingAuthorityId ? `/admin/authorities/${editingAuthorityId}` : "/admin/authorities", { method: editingAuthorityId ? "PUT" : "POST", body: { name: authorityName.trim(), keyword: authorityKeyword.trim() } });
      setAuthorityName(""); setAuthorityKeyword(""); setEditingAuthorityId(null);
      setAuthorities(await api<Authority[]>("/admin/authorities"));
      toast(editingAuthorityId ? "Configuração atualizada." : "Autoridade cadastrada. Integração ainda não configurada.", "success");
    } catch (e) { toast(errMsg(e), "error"); }
  };

  const removeAuthority = async (a: Authority) => {
    try {
      await api(`/admin/authorities/${a.id}`, { method: "DELETE" });
      setAuthorities((items) => items?.filter((item) => item.id !== a.id) ?? []);
      toast("Autoridade removida.", "success");
    } catch (e) { toast(errMsg(e), "error"); }
  };

  const STATS = [
    ["usuarios", "Usuários", "people"], ["premium", "Premium", "star"], ["alertas_pendentes", "Pendentes", "hourglass"],
    ["alertas_aprovados", "Publicados", "checkmark-done"], ["sos_total", "SOS", "alert-circle"],
  ];

  return (
    <View style={s.root}>
      <ScreenHeader title="Painel administrativo" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.stats}>
        {STATS.map(([k, l, i]) => (
          <View key={k} testID={`admin-stat-${k}`} style={s.stat}>
            <Icon name={i as any} size={18} color={colors.brandPrimary} />
            <Txt style={s.statNum}>{stats ? stats[k] : "–"}</Txt>
            <Txt variant="small">{l}</Txt>
          </View>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.seg}>
        {(["moderacao", "forum", "usuarios", "planos", "autoridades", "sugestoes"] as Tab[]).map((t) => (
          <Pressable key={t} testID={`admin-tab-${t}`} onPress={() => setTab(t)} style={[s.segBtn, tab === t && s.segOn]}>
            <Txt style={[s.segText, tab === t && { color: colors.onBrand }]}>{({ moderacao: "Alertas", forum: "Fórum", usuarios: "Usuários", planos: "Planos", autoridades: "Autoridades", sugestoes: "Sugestões" } as Record<Tab, string>)[t]}</Txt>
          </Pressable>
        ))}
      </ScrollView>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: S.lg, gap: S.md, paddingBottom: insets.bottom + S.xl }}>
        {tab === "forum" ? (
          !forumPosts ? <ActivityIndicator color={colors.brand} /> : forumPosts.length === 0 ? <Empty testID="admin-forum-empty" icon="checkmark-circle-outline" title="Nenhuma publicação sinalizada" text="Denúncias da comunidade aparecerão aqui para revisão." /> : forumPosts.map((post) => (
            <View key={post.id} testID={`admin-forum-post-${post.id}`} style={s.card}>
              <View style={s.head}><Icon name="chatbubbles" size={20} color={colors.brandPrimary} /><Txt style={s.title}>{post.author} · {post.topic ?? "geral"}</Txt><Txt style={{ color: colors.error, fontFamily: F.bold }}>{post.reports} denúncia(s)</Txt></View>
              <Txt>{post.message}</Txt><Txt variant="small">{fmtDate(post.created_at)}{post.report_reasons?.length ? ` · ${post.report_reasons.join(", ")}` : ""}{post.hidden ? " · Ocultada automaticamente" : ""}</Txt>
              <View style={{ flexDirection: "row", gap: S.sm }}><Btn testID={`admin-forum-keep-${post.id}`} small label="Manter" icon="checkmark" variant="navy" onPress={() => moderateForumPost(post, "manter")} style={{ flex: 1 }} /><Btn testID={`admin-forum-hide-${post.id}`} small label="Ocultar" icon="eye-off" variant="danger" onPress={() => moderateForumPost(post, "ocultar")} style={{ flex: 1 }} /></View>
            </View>
          ))
        ) : tab === "moderacao" ? (
          !alerts ? <ActivityIndicator color={colors.brand} /> : alerts.length === 0 ? <Empty testID="admin-no-pending" icon="checkmark-circle-outline" title="Nada para moderar" /> :
          alerts.map((a) => (
            <View key={a.id} testID={`admin-alert-${a.id}`} style={s.card}>
              <View style={s.head}>
                <Icon name={catOf(a.category).icon as any} size={20} color={colors[catOf(a.category).color] as string} />
                <Txt style={s.title}>{catOf(a.category).label}</Txt>
                {a.flags ? <Txt style={{ color: colors.error, fontFamily: F.bold, fontSize: 12 }}>{a.flags} denúncia(s)</Txt> : null}
              </View>
              <Txt>{a.description}</Txt>
              <Txt variant="small">{fmtDate(a.created_at)} · {a.lat}, {a.lng}{a.flag_reasons?.length ? ` · Motivos: ${a.flag_reasons.join(", ")}` : ""}</Txt>
              <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.sm }}>
                <Btn testID={`admin-approve-${a.id}`} small label="Aprovar" icon="checkmark" variant="navy" onPress={() => moderate(a, "aprovado")} style={{ flex: 1 }} />
                <Btn testID={`admin-reject-${a.id}`} small label="Rejeitar" icon="close" variant="danger" onPress={() => { setReason(""); setRejecting(a); }} style={{ flex: 1 }} />
              </View>
            </View>
          ))
        ) : tab === "usuarios" ? (
          !users ? <ActivityIndicator color={colors.brand} /> : users.map((u) => (
            <View key={u.id} testID={`admin-user-${u.id}`} style={[s.card, s.head]}>
              <View style={{ flex: 1 }}>
                <Txt style={s.title}>{u.name}{u.role === "admin" ? " (admin)" : ""}</Txt>
                <Txt variant="small">{u.email} · {u.is_premium ? "Premium" : "Gratuito"}{u.blocked ? " · BLOQUEADO" : ""}</Txt>
              </View>
              {u.role !== "admin" ? <Btn testID={`admin-block-${u.id}`} small label={u.blocked ? "Desbloquear" : "Bloquear"} variant={u.blocked ? "outline" : "danger"} onPress={() => block(u)} /> : null}
            </View>
          ))
        ) : tab === "autoridades" ? (
          <>
            <Txt variant="small">Cadastre a autoridade e sua palavra-chave protegida. Nenhuma autoridade recebe alertas até existir uma integração oficial e autorizada.</Txt>
            <Field testID="admin-authority-name" label="Nome da autoridade" value={authorityName} onChangeText={setAuthorityName} placeholder="Ex.: Defesa Civil Municipal" />
            <Field testID="admin-authority-keyword" label="Palavra-chave da autoridade" value={authorityKeyword} onChangeText={setAuthorityKeyword} secureTextEntry placeholder="Não será exibida após salvar" />
            <Btn testID="admin-authority-save" label="Cadastrar autoridade" icon="add" onPress={saveAuthority} />
            {!authorities ? <ActivityIndicator color={colors.brand} /> : authorities.length === 0 ? <Empty icon="business" title="Nenhuma autoridade cadastrada" /> : authorities.map((a) => (
              <View key={a.id} testID={`admin-authority-${a.id}`} style={s.card}>
                <Txt style={s.title}>{a.name}</Txt>
                <Txt variant="small">Integração: não configurada · Palavra-chave armazenada com hash</Txt>
                <View style={{ flexDirection: "row", gap: S.sm }}>
                  <Btn testID={`admin-authority-edit-${a.id}`} small label="Alterar palavra-chave" variant="outline" onPress={() => { setEditingAuthorityId(a.id); setAuthorityName(a.name); setAuthorityKeyword(""); }} />
                  <Btn testID={`admin-authority-remove-${a.id}`} small label="Remover" variant="danger" onPress={() => removeAuthority(a)} />
                </View>
              </View>
            ))}
          </>
        ) : tab === "sugestoes" ? (
          !feedback ? <ActivityIndicator color={colors.brand} /> : feedback.length === 0 ? <Empty icon="chatbox-ellipses" title="Nenhuma contribuição recebida" /> : feedback.map((item) => (
            <View key={item.id} testID={`admin-feedback-${item.id}`} style={s.card}>
              <Txt style={s.title}>{({ sugestao: "Sugestão", problema: "Problema", funcionalidade: "Nova funcionalidade" } as Record<Feedback["category"], string>)[item.category]}</Txt>
              <Txt>{item.message}</Txt>
              <Txt variant="small">{fmtDate(item.created_at)} · {item.status}</Txt>
            </View>
          ))
        ) : !plans ? <ActivityIndicator color={colors.brand} /> : (
          <>
            <Txt variant="small">Preços em reais (R$). Novos valores valem para novas assinaturas; assinantes atuais mantêm o preço contratado.</Txt>
            {plans.filter((p) => p.price_cents > 0 || p.id !== "gratuito").map((p) => (
              <View key={p.id} testID={`admin-plan-${p.id}`} style={s.card}>
                <Txt style={s.title}>{p.name} ({p.interval === "year" ? "anual" : "mensal"})</Txt>
                <View style={s.head}>
                  <Txt style={s.rs}>R$</Txt>
                  <TextInput testID={`admin-plan-price-${p.id}`} value={prices[p.id]} onChangeText={(v) => setPrices((x) => ({ ...x, [p.id]: v }))} keyboardType="decimal-pad" style={s.priceInput} />
                  <Btn testID={`admin-plan-save-${p.id}`} small label="Salvar" onPress={() => savePrice(p)} />
                </View>
              </View>
            ))}
          </>
        )}
      </KeyboardAwareScrollView>
      <Sheet visible={!!rejecting} onClose={() => setRejecting(null)} testID="admin-reject-sheet">
        <Txt variant="h2" style={{ marginBottom: S.md }}>Motivo da rejeição</Txt>
        <Field testID="admin-reject-reason" label="Será enviado ao autor" value={reason} onChangeText={setReason} placeholder="Ex.: contém acusação não verificada" />
        <Btn testID="admin-reject-confirm" label="Rejeitar alerta" variant="danger" onPress={() => { if (rejecting) moderate(rejecting, "rejeitado", reason); setRejecting(null); }} />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  stats: { gap: S.sm, padding: S.lg, paddingBottom: 0 },
  stat: { width: 100, backgroundColor: c.surface, borderRadius: R.md, padding: S.md, borderWidth: 1, borderColor: c.border, flexShrink: 0 },
  statNum: { fontFamily: F.black, fontSize: 22, color: c.brand },
  seg: { flexDirection: "row", margin: S.lg, marginBottom: 0, backgroundColor: c.surfaceTertiary, borderRadius: R.md, padding: 4, gap: 4 },
  segBtn: { minWidth: 96, minHeight: 44, paddingHorizontal: S.md, alignItems: "center", justifyContent: "center", borderRadius: R.sm + 4 },
  segOn: { backgroundColor: c.brand },
  segText: { fontFamily: F.semibold, fontSize: 14, color: c.onSurface },
  card: { backgroundColor: c.surface, borderRadius: R.md, padding: S.lg, gap: S.sm, borderWidth: 1, borderColor: c.border },
  head: { flexDirection: "row", alignItems: "center", gap: S.sm },
  title: { flex: 1, fontFamily: F.bold, fontSize: 15, color: c.onSurface },
  rs: { fontFamily: F.bold, fontSize: 18, color: c.brand },
  priceInput: { flex: 1, minWidth: 0, minHeight: 48, borderRadius: R.sm + 4, borderWidth: 1.5, borderColor: c.border, paddingHorizontal: S.md, fontFamily: F.bold, fontSize: 18, color: c.onSurface, backgroundColor: c.surfaceSecondary },
}));
