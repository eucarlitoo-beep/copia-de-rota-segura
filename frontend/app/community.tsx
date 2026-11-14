import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errMsg } from "@/src/api";
import { F, R, S } from "@/src/constants";
import { Banner, Icon, Txt, useToast } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { timeAgo } from "@/src/time";

type Message = { id: string; author: string; message: string; created_at: string; is_mine: boolean };

export default function CommunityChat() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setMessages(await api<Message[]>("/community/messages"));
      setError("");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
    const timer = setInterval(refresh, 6000);
    return () => clearInterval(timer);
  }, [refresh]));

  const send = async () => {
    const message = draft.trim();
    if (message.length < 2 || sending) return;
    setSending(true);
    try {
      const created = await api<Message>("/community/messages", { method: "POST", body: { message } });
      setMessages((current) => [...current.filter((item) => item.id !== created.id), created].slice(-100));
      setDraft("");
      setError("");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setSending(false);
    }
  };

  const report = async (message: Message) => {
    try {
      await api(`/community/messages/${message.id}/report`, { method: "POST", body: { reason: "outro" } });
      toast("Mensagem enviada para revisão da comunidade.", "success");
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };

  const ordered = [...messages].reverse();

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[s.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => router.back()} style={s.back}><Icon name="chevron-back" size={24} color={colors.onBrand} /></Pressable>
        <View style={{ flex: 1 }}><Txt style={s.title}>Comunidade SOS</Txt><Txt style={s.subtitle}>Apoio colaborativo com atualização automática</Txt></View>
        <Icon name="people" size={24} color={colors.onBrand} />
      </View>
      <View style={s.safety}><Icon name="shield-checkmark" size={18} color={colors.success} /><Txt style={s.safetyText}>Não envie endereço, telefone, placas ou dados pessoais. Em emergência, ligue 190.</Txt></View>
      {error ? <View style={s.error}><Banner kind="error" text="Não foi possível atualizar o chat. Verifique a conexão." /><Pressable onPress={refresh}><Txt style={s.retry}>Tentar novamente</Txt></Pressable></View> : null}
      {loading ? <View style={s.loading}><ActivityIndicator color={colors.brand} /><Txt>Carregando conversa...</Txt></View> : (
        <FlatList
          testID="community-message-list"
          inverted
          data={ordered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<View style={s.empty}><Icon name="chatbubbles" size={34} color={colors.brandPrimary} /><Txt variant="label">Seja a primeira pessoa a oferecer apoio.</Txt></View>}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInUp.delay(Math.min(index, 5) * 35).duration(280)} style={[s.messageRow, item.is_mine && s.mineRow]}>
              <View style={[s.avatar, item.is_mine && s.mineAvatar]}><Txt style={[s.avatarText, item.is_mine && s.mineAvatarText]}>{item.author.slice(0, 1).toUpperCase()}</Txt></View>
              <View style={[s.bubble, item.is_mine && s.mineBubble]}>
                {!item.is_mine ? <Txt style={s.author}>{item.author}</Txt> : null}
                <Txt style={[s.message, item.is_mine && s.mineMessage]}>{item.message}</Txt>
                <View style={s.meta}><Txt style={[s.time, item.is_mine && s.mineTime]}>{timeAgo(item.created_at)}</Txt>{!item.is_mine ? <Pressable accessibilityLabel="Denunciar mensagem" onPress={() => report(item)}><Txt style={s.report}>Denunciar</Txt></Pressable> : null}</View>
              </View>
            </Animated.View>
          )}
        />
      )}
      <View style={[s.composer, { paddingBottom: Math.max(insets.bottom, S.sm) }]}>
        <TextInput
          testID="community-message-input"
          value={draft}
          onChangeText={setDraft}
          placeholder="Escreva uma mensagem de apoio..."
          placeholderTextColor={colors.muted}
          multiline
          maxLength={500}
          returnKeyType="send"
          blurOnSubmit
          onSubmitEditing={send}
          style={s.input}
        />
        <Pressable testID="community-send-button" accessibilityRole="button" accessibilityLabel="Enviar mensagem" disabled={sending || draft.trim().length < 2} onPress={send} style={[s.send, (sending || draft.trim().length < 2) && s.sendDisabled]}>
          {sending ? <ActivityIndicator size="small" color={colors.onBrandPrimary} /> : <Icon name="send" size={20} color={colors.onBrandPrimary} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.lg, paddingBottom: S.md, backgroundColor: c.brand },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: F.bold, fontSize: 18, color: c.onBrand },
  subtitle: { fontFamily: F.medium, fontSize: 12, color: c.brandTertiary },
  safety: { flexDirection: "row", alignItems: "center", gap: S.sm, backgroundColor: c.surface, paddingHorizontal: S.lg, paddingVertical: S.sm, borderBottomWidth: 1, borderBottomColor: c.border },
  safetyText: { flex: 1, fontFamily: F.medium, fontSize: 11, lineHeight: 16, color: c.onSurfaceSecondary },
  error: { paddingHorizontal: S.md, paddingTop: S.sm },
  retry: { alignSelf: "flex-end", fontFamily: F.bold, color: c.brand, padding: S.sm },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: S.md },
  list: { flexGrow: 1, paddingHorizontal: S.md, paddingVertical: S.lg, gap: S.md },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: S.md, padding: S.xl },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: S.sm, marginBottom: S.md },
  mineRow: { flexDirection: "row-reverse" },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c.brandSoft },
  mineAvatar: { backgroundColor: c.brandPrimary },
  avatarText: { fontFamily: F.bold, color: c.brand },
  mineAvatarText: { color: c.onBrandPrimary },
  bubble: { maxWidth: "82%", backgroundColor: c.surface, borderRadius: R.md, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: c.border, padding: S.md, gap: S.xs },
  mineBubble: { backgroundColor: c.brand, borderBottomLeftRadius: R.md, borderBottomRightRadius: 4, borderColor: c.brand },
  author: { fontFamily: F.bold, fontSize: 12, color: c.brand },
  message: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: c.onSurface },
  mineMessage: { color: c.onBrand },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.md, marginTop: 2 },
  time: { fontFamily: F.medium, fontSize: 10, color: c.muted },
  mineTime: { color: c.brandTertiary },
  report: { fontFamily: F.semibold, fontSize: 10, color: c.error },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: S.sm, padding: S.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border },
  input: { flex: 1, maxHeight: 112, minHeight: 46, borderWidth: 1, borderColor: c.borderStrong, borderRadius: R.lg, paddingHorizontal: S.lg, paddingTop: 12, paddingBottom: 10, fontFamily: F.regular, fontSize: 14, color: c.onSurface, backgroundColor: c.surfaceSecondary },
  send: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: c.brandPrimary },
  sendDisabled: { opacity: 0.48 },
}));
