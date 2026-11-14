import { useState } from "react";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errMsg } from "@/src/api";
import { F, R, S } from "@/src/constants";
import { Btn, Field, ScreenHeader, Txt, useToast } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";

const OPTIONS = [
  ["sugestao", "Sugestão"],
  ["problema", "Problema encontrado"],
  ["funcionalidade", "Nova funcionalidade"],
] as const;

export default function Feedback() {
  const s = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<(typeof OPTIONS)[number][0]>("sugestao");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (message.trim().length < 5) return toast("Escreva pelo menos 5 caracteres.", "error");
    setBusy(true);
    try {
      await api("/feedback", { method: "POST", body: { category, message: message.trim() } });
      setSent(true);
      setMessage("");
      toast("Contribuição enviada. Obrigado!", "success");
    } catch (e) { toast(errMsg(e), "error"); }
    setBusy(false);
  };

  return (
    <View style={s.root}>
      <ScreenHeader title="Sugestões e melhorias" />
      <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: S.xl, gap: S.md, paddingBottom: insets.bottom + S.xl }}>
        <Txt>Ajude a melhorar o Rota Segura. Sua contribuição será visível apenas à equipe administrativa.</Txt>
        <Txt variant="label">Tipo de contribuição</Txt>
        <View style={s.options}>
          {OPTIONS.map(([value, label]) => <Pressable key={value} testID={`feedback-type-${value}`} onPress={() => setCategory(value)} style={[s.option, category === value && s.optionOn]}><Txt style={{ color: category === value ? colors.onBrand : colors.onSurface, fontFamily: F.semibold }}>{label}</Txt></Pressable>)}
        </View>
        <Field testID="feedback-message" label={category === "problema" ? "Descreva o problema" : category === "funcionalidade" ? "Descreva a funcionalidade" : "Sua sugestão"} value={message} onChangeText={(v) => { setMessage(v); setSent(false); }} placeholder="Conte o que aconteceu ou o que poderia melhorar" multiline maxLength={2000} textAlignVertical="top" style={s.input} />
        {sent ? <Txt testID="feedback-success" style={{ color: colors.success, fontFamily: F.semibold }}>Contribuição recebida. Obrigado por ajudar.</Txt> : null}
        <Btn testID="feedback-submit" label="Enviar contribuição" icon="send" onPress={submit} loading={busy} />
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  options: { gap: S.sm },
  option: { minHeight: 48, borderRadius: R.md, borderWidth: 1.5, borderColor: c.border, justifyContent: "center", paddingHorizontal: S.md, backgroundColor: c.surfaceSecondary },
  optionOn: { backgroundColor: c.brand, borderColor: c.brand },
  input: { minHeight: 160, paddingTop: S.md },
}));
