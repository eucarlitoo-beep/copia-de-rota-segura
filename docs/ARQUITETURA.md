# ROTA SEGURA — Arquitetura, instalação e publicação

> Sua segurança em primeiro lugar. App brasileiro e independente (sem integração com Uber, 99 ou inDrive).

## 1. Arquitetura

```
[App Expo (React Native + TypeScript)]  --HTTPS/JSON-->  [API FastAPI /api/*]  -->  [MongoDB]
        |                                                     |-> Stripe Checkout (assinaturas em BRL)
        |-- tel: 190/192/193 (discador do aparelho)            |-> E-mail transacional (SOS)
        |-- WhatsApp / SMS (mensagem pronta, usuário confirma) |-> Página pública de localização (OpenStreetMap)
        |-- Geocodificação de cidade escolhida                   |-> Nominatim / OpenStreetMap
```

- **Camada de dados isolada**: todas as telas usam `src/api.ts`. Para migrar ao Supabase, basta reimplementar as funções desse cliente (ou trocar a API por Edge Functions) sem mexer nas telas.
- **IDs UUID em texto** e documentos "planos" (sem aninhamento profundo) — mapeiam 1:1 para tabelas Postgres.

### Tabelas equivalentes (Supabase/Postgres)
| Coleção | Campos principais |
|---|---|
| users | id uuid, name, email unique, password_hash, phone, driver_type, vehicle, city, role, plan, plan_expires_at, blocked, lgpd_consent_at, location_consent |
| contacts | id, user_id → users, name, phone, email, relation |
| incidents | id, user_id, type='sos', lat, lng, accuracy, status, actions jsonb |
| alerts | id, reporter_id (nulo se conta excluída), category, description, lat/lng arredondados, status (pendente/aprovado/rejeitado), confirmations, flags |
| shares | id, token unique, user_id, lat, lng, expires_at, active |
| notifications | id, user_id, title, body, kind, read |
| plans | id, name, price_cents, interval, features jsonb, active |
| payment_transactions | id, session_id unique, user_id, plan_id, amount_cents, payment_status |
| feedback | id, user_id, category, message, status, created_at |
| authorities | id, name, keyword_hash, integration_status, created_at, updated_at |

No Supabase, ative **RLS**: `user_id = auth.uid()` em contacts/incidents/shares/notifications; `alerts` só leitura pública quando `status='aprovado'` e sem expor `reporter_id`.

## 2. Estrutura de pastas
```
backend/
  server.py           # rotas: auth, perfil, contatos, SOS, compartilhamento, alertas, notificações, planos, pagamentos, admin
  email_service.py    # envio de e-mail com verificações anti-abuso
frontend/
  app/                # rotas (expo-router)
    (tabs)/index.tsx  # Início + botão SOS
    (tabs)/mapa.tsx   # mapa colaborativo
    (tabs)/alertas.tsx
    (tabs)/perfil.tsx
    login.tsx register.tsx contacts.tsx share.tsx report.tsx history.tsx
    notifications.tsx plans.tsx privacy.tsx profile-edit.tsx admin.tsx feedback.tsx keyword.tsx
  src/
    api.ts auth.tsx location.ts net.ts constants.ts theme.ts time.ts
    components/ (ui.tsx, SosSheet.tsx, RiskMap.tsx, RiskMap.web.tsx, PrivacyText.tsx)
```

## 3. Dependências principais
expo-router, expo-location, expo-speech-recognition, react-native-maps, expo-sms, expo-clipboard, expo-web-browser, @react-native-community/netinfo, react-native-reanimated, react-native-keyboard-controller, @react-native-vector-icons/ionicons, date-fns. Backend: fastapi, motor, bcrypt, PyJWT, stripe, httpx.

## 4. Segurança, privacidade e moderação
- Senhas com bcrypt; JWT 7 dias; bloqueio de 15 min após 5 tentativas de login.
- SOS **nunca** envia nada sozinho: o motorista confirma e escolhe ligar, abrir WhatsApp/SMS (ele aperta enviar) ou disparar e-mail pelo servidor (limite 3/hora).
- Alertas: moderação prévia; bloqueio de placas, CPF, telefones e termos acusatórios; limite 5/dia; coordenadas arredondadas (~100 m); 3 denúncias devolvem o alerta à moderação; autor nunca exibido.
- LGPD: consentimento no cadastro, preferência de localização, exportação dos dados e exclusão da conta.
- Palavra-chave: armazenada no cofre seguro do aparelho; escuta apenas quando iniciada pelo usuário e enquanto a tela está aberta. Requer build nativo com `expo-speech-recognition`; não funciona no Expo Go sem rebuild e não oferece monitoramento em segundo plano. As palavras-chave de autoridades são guardadas com hash e ainda não encaminham alertas: integração oficial precisa ser contratada/autorizada.
- Sugestões: dados ligados à conta e visíveis apenas no painel admin.
- Seleção manual de cidade: busca Nominatim com limitação de frequência; localização do dispositivo usa GPS e geocodificação reversa do sistema quando disponível. Não existe coordenada padrão fixa.
- Sem internet: banner de aviso; ligações e SMS continuam disponíveis.

## 5. Rodar no Windows (desenvolvimento local)
1. Instale **Node.js LTS**, **Python 3.11+**, **Git** e **MongoDB Community** (ou MongoDB Atlas gratuito).
2. Backend (PowerShell):
   ```powershell
   cd backend
   python -m venv .venv; .venv\Scripts\activate
   pip install -r requirements.txt
   # crie backend\.env com MONGO_URL, DB_NAME, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
   # Stripe só é necessário para pagamentos Premium; e-mail usa EMERGENT_EMAIL_KEY (opcional localmente)
   uvicorn server:app --host 0.0.0.0 --port 8001 --reload
   ```
3. Frontend:
   ```powershell
   cd frontend
   npm i -g yarn; yarn install
   # frontend\.env: EXPO_PUBLIC_BACKEND_URL=http://SEU_IP_LOCAL:8001
   npx expo start
   ```
4. Libere a porta 8001 no Firewall do Windows. No celular, use o IP da rede local (não `localhost`).

## 6. Testar no Android
- Instale o **Expo Go** (Play Store) e leia o QR code. Mapa, GPS, SOS, SMS e WhatsApp funcionam no Expo Go. O reconhecimento de voz precisa de build de desenvolvimento/produção com o plugin nativo configurado.
- Teste: negar a permissão de localização (deve aparecer "Abrir Configurações"), desligar o GPS, ativar modo avião (banner offline), cartão de teste Stripe `4242 4242 4242 4242`.

## 7. Publicação nas lojas
- Pela Emergent: botão **Publish** (canto superior direito) e depois gere os builds Android/iOS.
- Identificador do app: `com.emergent.sosrota.lnw5zv` (não altere).
- Para builds de produção no Android, o mapa precisa de uma **chave Google Maps SDK** (gratuita dentro da cota).
- **Atenção às regras das lojas**: assinaturas que liberam funções digitais dentro do app podem exigir a cobrança da Apple/Google (In‑App Purchase). Avalie antes de publicar; alternativa: vender a assinatura pelo site.
- Publique uma Política de Privacidade (texto base em `PrivacyText.tsx`) e preencha a seção de Segurança de Dados (Play) / Privacidade (App Store).

## 8. Próximas etapas sugeridas
Atualização de localização em segundo plano (exige build instalado), notificações push, webhook Stripe para renovações/cancelamentos, migração para Supabase.
