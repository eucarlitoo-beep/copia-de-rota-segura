import { ScrollView } from "react-native";

import { S } from "@/src/constants";
import { Txt } from "@/src/components/ui";

const SECTIONS = [
  ["Quais dados coletamos", "Nome, e-mail, celular (opcional), tipo de motorista, contatos de confiança e contribuições que você enviar. Com permissão, usamos localização enquanto o mapa está aberto e quando você aciona o SOS, compartilha sua rota ou relata um risco. A cidade digitada para busca manual é consultada pelo serviço OpenStreetMap/Nominatim. Se você tocar em Sugerir pelo mapa ao relatar um risco, coordenadas arredondadas (cerca de 100 m) são enviadas ao Nominatim para uma sugestão aproximada de bairro e rua; a sugestão não é considerada confirmada até você revisar e escolher usá-la."],
  ["Para que usamos", "Exclusivamente para sua segurança: centralizar o mapa, montar a mensagem de SOS, gerar o link de localização para quem você escolher e exibir alertas no mapa colaborativo."],
  ["Alertas da comunidade", "Relatos são moderados antes de aparecer. Não publicamos nomes, placas, telefones ou acusações contra pessoas. As coordenadas são arredondadas (cerca de 100 m) e o autor nunca é exibido. Bairro, município e região alimentam estatísticas agrupadas. Números de imóveis não são usados; uma rua só aparece nas estatísticas após pelo menos 3 relatos aprovados de pessoas diferentes nesse local."],
  ["Compartilhamento", "Não vendemos seus dados. Mensagens de SOS só são enviadas quando você confirma. Pagamentos são processados pela Stripe; não armazenamos dados de cartão."],
  ["Palavra-chave e áudio", "A palavra-chave pessoal fica no armazenamento seguro do aparelho em Android e iOS; na web, fica no armazenamento local do navegador. O reconhecimento de voz só começa após você iniciar o monitoramento e conceder as permissões. O ROTA SEGURA não salva nem envia gravações; o serviço de reconhecimento do sistema pode processar áudio conforme o aparelho. O monitoramento para quando você sai da tela ou o app vai para segundo plano."],
  ["Sugestões e problemas", "As contribuições enviadas ficam armazenadas na plataforma associadas à sua conta e são visíveis apenas a administradores autorizados."],
  ["Seus direitos (LGPD)", "Você pode acessar, exportar e excluir seus dados a qualquer momento em Perfil > Privacidade e LGPD, e revogar o consentimento de localização."],
  ["Aviso importante", "O ROTA SEGURA não substitui os serviços públicos de emergência. Em perigo, ligue 190. O app é independente e não tem vínculo com Uber, 99, inDrive ou outras plataformas."],
];

export function PrivacyText() {
  return (
    <ScrollView style={{ maxHeight: 460 }} testID="privacy-text">
      <Txt variant="h2" style={{ marginBottom: S.md }}>Política de Privacidade</Txt>
      {SECTIONS.map(([t, b]) => (
        <Txt key={t} style={{ marginBottom: S.md }}>
          <Txt variant="label">{t}: </Txt>
          {b}
        </Txt>
      ))}
    </ScrollView>
  );
}
