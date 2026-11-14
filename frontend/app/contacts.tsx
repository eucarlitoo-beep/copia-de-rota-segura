import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errMsg } from "@/src/api";
import { F, R, S } from "@/src/constants";
import { Btn, ConfirmSheet, Empty, Field, Icon, ScreenHeader, Sheet, Txt, useToast } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

type Contact = { id: string; name: string; phone: string; email?: string | null; relation: string };
const EMPTY = { name: "", phone: "", email: "", relation: "" };

export default function Contacts() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [items, setItems] = useState<Contact[]>([]);
  const [limit, setLimit] = useState(3);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [del, setDel] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: Contact[]; limit: number }>("/contacts");
      setItems(r.items);
      setLimit(r.limit);
    } catch (e) {
      toast(errMsg(e), "error");
    }
    setLoaded(true);
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const open = (c?: Contact) => {
    setError("");
    setEditing(c?.id ?? null);
    setForm(c ? { name: c.name, phone: c.phone, email: c.email ?? "", relation: c.relation } : EMPTY);
  };

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) return setError("Informe o nome.");
    if (form.phone.replace(/\D/g, "").length < 10) return setError("Informe o celular com DDD.");
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) return setError("E-mail inválido.");
    setSaving(true);
    try {
      const body = { ...form, email: form.email.trim() || null };
      await api(editing ? `/contacts/${editing}` : "/contacts", { method: editing ? "PUT" : "POST", body });
      setForm(null);
      toast("Contato salvo.", "success");
      load();
    } catch (e) {
      setError(errMsg(e));
    }
    setSaving(false);
  };

  const remove = async () => {
    if (!del) return;
    await api(`/contacts/${del.id}`, { method: "DELETE" }).catch(() => {});
    setDel(null);
    load();
  };

  const set = (k: keyof typeof EMPTY) => (v: string) => setForm((p) => (p ? { ...p, [k]: v } : p));

  return (
    <View style={s.root}>
      <ScreenHeader title="Contatos de emergência" />
      <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.md, paddingBottom: insets.bottom + S.xl }}>
        <Txt variant="small">
          Eles recebem sua mensagem de SOS quando você confirmar o envio. Peça autorização antes de cadastrar alguém. {items.length}/{limit} no seu plano.
        </Txt>
        {loaded && items.length === 0 ? <Empty testID="contacts-empty" icon="people-outline" title="Nenhum contato ainda" text="Adicione familiares ou colegas de confiança." /> : null}
        {items.map((c) => (
          <View key={c.id} testID={`contact-card-${c.id}`} style={s.card}>
            <View style={s.avatar}><Txt style={s.avatarText}>{c.name[0]?.toUpperCase()}</Txt></View>
            <View style={{ flex: 1 }}>
              <Txt variant="label" style={{ marginBottom: 0 }}>{c.name}{c.relation ? ` · ${c.relation}` : ""}</Txt>
              <Txt variant="small">{c.phone}{c.email ? ` · ${c.email}` : ""}</Txt>
            </View>
            <Pressable testID={`contact-call-${c.id}`} accessibilityLabel={`Ligar para ${c.name}`} onPress={() => Linking.openURL(`tel:${c.phone}`)} style={s.iconBtn}>
              <Icon name="call" size={20} color={colors.success} />
            </Pressable>
            <Pressable testID={`contact-edit-${c.id}`} accessibilityLabel="Editar" onPress={() => open(c)} style={s.iconBtn}>
              <Icon name="pencil" size={20} color={colors.brand} />
            </Pressable>
            <Pressable testID={`contact-delete-${c.id}`} accessibilityLabel="Excluir" onPress={() => setDel(c)} style={s.iconBtn}>
              <Icon name="trash" size={20} color={colors.error} />
            </Pressable>
          </View>
        ))}
        <Btn testID="contacts-add-button" label="Adicionar contato" icon="person-add" onPress={() => open()} disabled={items.length >= limit} />
        {items.length >= limit ? <Txt variant="small" style={{ textAlign: "center" }}>Limite atingido. O Premium permite até 10 contatos.</Txt> : null}
      </ScrollView>
      <Sheet visible={!!form} onClose={() => setForm(null)} testID="contact-form-sheet">
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled">
          <Txt variant="h2" style={{ marginBottom: S.lg }}>{editing ? "Editar contato" : "Novo contato"}</Txt>
          {form ? (
            <>
              <Field testID="contact-name-input" label="Nome" value={form.name} onChangeText={set("name")} placeholder="Ex.: Maria" />
              <Field testID="contact-phone-input" label="Celular com DDD" value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" placeholder="(11) 99999-9999" />
              <Field testID="contact-email-input" label="E-mail (para alerta automático)" value={form.email} onChangeText={set("email")} autoCapitalize="none" keyboardType="email-address" placeholder="opcional" />
              <Field testID="contact-relation-input" label="Parentesco / relação" value={form.relation} onChangeText={set("relation")} placeholder="Ex.: Esposa, irmão" />
            </>
          ) : null}
          {error ? <Txt testID="contact-form-error" style={{ color: colors.error, fontFamily: F.semibold, marginBottom: S.md }}>{error}</Txt> : null}
          <Btn testID="contact-save-button" label="Salvar contato" onPress={save} loading={saving} />
        </KeyboardAwareScrollView>
      </Sheet>
      <ConfirmSheet testID="contact-delete-sheet" visible={!!del} title="Excluir contato?" message={`${del?.name ?? ""} deixará de receber seus pedidos de SOS.`} confirmLabel="Excluir" danger onClose={() => setDel(null)} onConfirm={remove} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  card: { flexDirection: "row", alignItems: "center", gap: S.sm, backgroundColor: c.surface, borderRadius: R.md, padding: S.md, borderWidth: 1, borderColor: c.border },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: F.bold, fontSize: 18, color: c.onBrand },
  iconBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
}));
