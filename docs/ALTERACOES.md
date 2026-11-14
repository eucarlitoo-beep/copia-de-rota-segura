# Rota Segura — alterações desta versão

## Localização

- O centro fixo em São Paulo foi removido. O mapa usa a posição atual com permissão e não desenha uma localização presumida em caso de falha.
- O GPS anterior só pode ser usado como fallback por até dois minutos; coordenadas inválidas são descartadas.
- Sem permissão ou GPS, a pessoa pode informar cidade e estado, trocar a cidade depois e centralizar o mapa nas coordenadas encontradas.
- A cidade e o estado da posição do dispositivo são obtidos pelo geocodificador reverso do sistema quando disponível.
- A busca manual consulta Nominatim/OpenStreetMap, sem chave de API, limitada a uma solicitação por segundo por processo do backend.

## SOS por palavra-chave

- A configuração pessoal fica no armazenamento seguro de cada conta em Android/iOS; a web usa armazenamento local do navegador.
- A escuta só começa após ação explícita e permissões de microfone/reconhecimento de voz. O app não persiste gravações, não transmite áudio por conta própria e interrompe a escuta ao sair da tela ou entrar em segundo plano.
- O reconhecimento de fala usa o serviço disponível no dispositivo/navegador. Após correspondência exata, o fluxo existente abre a confirmação SOS para evitar disparos acidentais; contatos ainda escolhem e confirmam os meios de envio disponíveis.
- Requer rebuild nativo com `expo-speech-recognition`; não funciona no Expo Go sem uma build própria. Não há monitoramento em segundo plano.
- O cadastro administrativo de autoridades mantém nome e hash individual da palavra-chave. `integration_status` permanece `not_configured`: nenhuma autoridade recebe dados ou alertas por esta versão.

## Plano gratuito

- O plano gratuito e seus recursos existentes permanecem disponíveis. Nenhuma etapa de pagamento é solicitada para usar o plano gratuito; os planos Premium existentes continuam opcionais.

## Sugestões e melhorias

- A tela permite enviar sugestão, problema ou nova funcionalidade. O backend associa o registro autenticado à conta, limita o envio a dez contribuições por dia e fornece listagem apenas a administradores.
- As contribuições fazem parte da exportação e da exclusão de dados da conta.

## Validação

- `python -m compileall -q backend`: passou.
- JSON de `frontend/app.json`: passou na validação.
- Testes de integração/nativos não executados nesta cópia: a validação com MongoDB/API, GPS real, microfone e dispositivos requer serviços configurados e aparelhos com permissões autorizadas.

## Configuração externa

- Reconhecimento de voz: instalar dependência e gerar build nativo após conceder permissões de microfone e reconhecimento.
- Geocodificação manual: requer internet do backend e disponibilidade do Nominatim/OpenStreetMap.
- SOS por e-mail: depende do SMTP/Resend configurado na instalação. Ligações e apps de mensagens dependem do aparelho.
- Não existe integração oficial de alertas com autoridades cadastradas.
- Google Maps SDK continua necessário para os builds de produção, conforme a configuração original do projeto. Stripe só é usada se alguém escolher um plano Premium existente.
- O `backend/requirements.txt` foi reduzido às dependências importadas pelo backend e pelos testes. Dependências privadas da plataforma Emergent, que não eram usadas no código, foram removidas. A chave `EMERGENT_EMAIL_KEY` e `EMAIL_FROM_NAME` são opcionais para iniciar localmente; sem chave, o envio de e-mail retorna indisponível.

## Fórum, estatísticas por bairro e navegação

- A Comunidade SOS agora organiza publicações por assunto (apoio, trajetos, riscos e geral). Publicações denunciadas ou ocultadas automaticamente entram na fila de revisão em **Painel administrativo > Fórum**.
- O formulário de alerta aceita bairro opcional. O gráfico agrega apenas relatos aprovados que informaram bairro e exibe separadamente as categorias (assalto, roubo de veículo, via perigosa, acidente, alagamento, falta de iluminação e outros). É um indicador da comunidade, não uma estatística policial oficial; bairro digitado não é validado por geocodificação.
- Para Salvador, o gráfico oferece atalhos oficiais da SSP-BA/SEI. A SSP publica microdados de mortes violentas e veículos com campo de bairro, mas isso não cobre toda categoria de risco do app; os dados policiais também têm recortes e periodicidades próprios. Os valores oficiais não são misturados ao contador colaborativo.
- O mapa acompanha a posição em navegação com câmera inclinada, mapa escuro, instrução de manobra, rota, cartão de distância/tempo e marcador próprio de carro ou pessoa.
- Rotas de carro e ajuste GPS seguem `OSRM_BASE_URL`. Para rotas e ajuste a pé, configure `OSRM_FOOT_BASE_URL` no `backend/.env` para uma instância compatível com o perfil `walking`; sem ela, o app informa que a rota a pé não está disponível. Escolha o provedor respeitando disponibilidade, limites de uso e privacidade das coordenadas.
- Validação desta revisão: TypeScript (`tsc --noEmit`), sintaxe Python (`py_compile`) e `git diff --check` passaram. Não foi executado teste integrado com MongoDB ou aparelho GPS.
