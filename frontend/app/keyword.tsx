import { useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader, Field, Btn, Txt, useToast } from "@/src/components/ui";
import { SosSheet } from "@/src/components/SosSheet";
import { F, S } from "@/src/constants";
import { useAuth } from "@/src/auth";
import { storage } from "@/src/utils/storage";
import { makeStyles, useTheme } from "@/src/theme";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export default function Keyword() {
  const s = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const toast = useToast();
  const key = user ? `sos_keyword_${user.id}` : "sos_keyword";
  const insets = useSafeAreaInsets();
  const [word, setWord] = useState("");
  const [listening, setListening] = useState(false);
  const [available, setAvailable] = useState(true);
  const [sos, setSos] = useState(false);
  const triggered = useRef(false);
  const moduleRef = useRef<any>(null);
  const listeners = useRef<any[]>([]);
  const toastRef = useRef(toast);

  useEffect(() => {
    storage.secureGet(key, "" as string).then((v) => setWord(v ?? ""));
  }, [key]);

  useEffect(() => { toastRef.current = toast; }, [toast]);

  useEffect(() => {
    try {
      moduleRef.current = require("expo-speech-recognition").ExpoSpeechRecognitionModule;
      if (!moduleRef.current) setAvailable(false);
      else {
        listeners.current = [
          moduleRef.current.addListener("start", () => setListening(true)),
          moduleRef.current.addListener("end", () => setListening(false)),
          moduleRef.current.addListener("error", (event: any) => {
            setListening(false);
            if (event.error !== "aborted" && event.error !== "no-speech") toastRef.current("Reconhecimento de voz indisponível. Verifique a permissão e o serviço de voz do aparelho.", "error");
          }),
          moduleRef.current.addListener("result", (event: any) => {
            if (!event.isFinal || triggered.current) return;
            const target = normalize(wordRef.current);
            if (!target) return;
            const result = event.results?.[0];
            const confidence = result?.confidence;
            if (normalize(result?.transcript ?? "") === target && (confidence == null || confidence >= 0.75)) {
              triggered.current = true;
              moduleRef.current?.abort();
              setListening(false);
              setSos(true);
            }
          }),
        ];
      }
    } catch { setAvailable(false); }
    const appState = AppState.addEventListener("change", (state) => {
      if (state !== "active") { moduleRef.current?.abort?.(); setListening(false); }
    });
    return () => {
      moduleRef.current?.abort?.();
      listeners.current.forEach((listener) => listener?.remove?.());
      appState.remove();
    };
  }, []);

  const wordRef = useRef(word);
  useEffect(() => { wordRef.current = word; }, [word]);

  const save = async () => {
    const clean = word.trim().replace(/\s+/g, " ");
    if (normalize(clean).length < 4 || clean.length > 40) return toast("Escolha uma palavra ou frase entre 4 e 40 caracteres.", "error");
    if (!(await storage.secureSet(key, clean))) return toast("Não foi possível salvar a palavra-chave neste aparelho.", "error");
    setWord(clean);
    toast("Palavra-chave salva neste aparelho.", "success");
  };

  const start = async () => {
    const clean = wordRef.current.trim();
    if (!normalize(clean)) return toast("Cadastre sua palavra-chave primeiro.", "error");
    try {
      const permission = await moduleRef.current?.requestPermissionsAsync?.();
      if (!permission?.granted) return toast("Permita o microfone e o reconhecimento de voz para continuar.", "error");
      triggered.current = false;
      moduleRef.current.start({ lang: "pt-BR", interimResults: false, continuous: true, maxAlternatives: 1, contextualStrings: [clean], recordingOptions: { persist: false } });
      setListening(true);
    } catch { toast("Este aparelho precisa de uma compilação do Rota Segura com suporte a reconhecimento de voz.", "error"); }
  };

  const stop = () => { moduleRef.current?.abort?.(); setListening(false); };

  return (
    <View style={s.root}>
      <ScreenHeader title="Palavra-chave do SOS" />
      <View style={{ padding: S.xl, paddingBottom: insets.bottom + S.xl, gap: S.md }}>
        <Txt>Escolha uma palavra ou frase pessoal. No Android e iOS ela fica no armazenamento seguro do aparelho e não é enviada ao servidor. Na versão web, fica no armazenamento local do navegador.</Txt>
        <Txt variant="small">O reconhecimento só começa quando você tocar em “Iniciar monitoramento”. O microfone permanece ativo apenas com esta tela aberta. O sistema de voz do aparelho pode processar áudio conforme as configurações do fabricante. Não há gravação salva. O app para de ouvir quando sai desta tela ou vai para segundo plano.</Txt>
        <Field testID="keyword-input" label="Sua palavra-chave" value={word} onChangeText={setWord} maxLength={40} placeholder="Ex.: preciso de ajuda" editable={!listening} />
        <Btn testID="keyword-save" label="Salvar palavra-chave" onPress={save} disabled={listening} />
        {!available ? <Txt style={{ color: colors.error }}>Reconhecimento de voz indisponível nesta versão. Instale uma compilação nativa do app com suporte de voz.</Txt> : null}
        {listening ? <Txt testID="keyword-listening" style={{ color: colors.success, fontFamily: F.bold }}>Monitoramento ativo nesta tela. Fale sua palavra-chave.</Txt> : null}
        <Btn testID="keyword-start" label="Iniciar monitoramento" icon="mic" onPress={start} disabled={listening || !available} />
        {listening ? <Btn testID="keyword-stop" label="Parar monitoramento" variant="ghost" onPress={stop} /> : null}
        <Txt variant="small">Ao reconhecer exatamente a frase, o app abre a confirmação do SOS para reduzir acionamentos acidentais. Você ainda escolhe como avisar seus contatos. Não há acionamento confiável em segundo plano.</Txt>
      </View>
      <SosSheet visible={sos} onClose={() => { setSos(false); triggered.current = false; }} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface } }));
