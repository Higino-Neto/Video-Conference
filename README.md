# UFMG Video Conference

Aplicação web de videoconferência com criação de salas, áudio, vídeo, compartilhamento de tela e moderação de participantes.

## Tecnologias

- React, TypeScript, Vite e Tailwind CSS
- Node.js e Fastify
- LiveKit Cloud

## Como executar

1. Instale as dependências:

```bash
npm install
```

2. Copie `.env.example` para `.env` e informe as credenciais do LiveKit:

```env
LIVEKIT_URL=wss://seu-projeto.livekit.cloud
LIVEKIT_API_KEY=sua-chave
LIVEKIT_API_SECRET=seu-segredo
```

Em desenvolvimento, as perguntas são persistidas em `.data/questions.json`. Em produção,
configure `DATABASE_URL` com uma conexão PostgreSQL e a tabela necessária é criada de forma
idempotente pelo backend.

3. Inicie o projeto:

```bash
npm run dev
```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:3001`

## Para nerds

### Fluxo de uso

A entrada na chamada funciona assim:

1. Home cria uma sala via POST /api/rooms ou navega para uma sala existente.
2. Lobby coleta nome, câmera, microfone, alto-falante e faz preflight de servidor/rede.
3. App.join() chama requestJoinToken().
4. Backend valida sala/participante, resolve papel admin ou participant, gera token LiveKit e credencial de retomada.
5. CallPage cria uma instância Room, conecta no LiveKit e publica microfone/câmera conforme preferências.

### Rotas

```GET /api/health: saúde do sistema.
GET /api/config: configuração do frontend.
POST /api/rooms: cria código de sala e credencial privada do criador (owner).
GET /api/rooms/:roomName/status: verifica se a sala existe.
GET /api/rooms/:roomName/admissions: lista pedidos pendentes para o admin.
POST /api/rooms/:roomName/admissions/:participantIdentity: aprova ou nega entrada.
POST /api/rooms/:roomName/participants/:participantIdentity/actions: ações da moderação.
GET /api/rooms/:roomName/questions/active: pergunta visível para quem está na sala.
GET /api/rooms/:roomName/questions: fila e histórico completos para administradores.
POST /api/rooms/:roomName/questions: adiciona uma pergunta à fila.
PATCH /api/rooms/:roomName/questions/:questionId: edita pergunta e autoria.
POST /api/rooms/:roomName/questions/:questionId/actions: exibe, responde, refila ou arquiva.
PUT /api/rooms/:roomName/questions/order: altera a ordem das perguntas na fila.
POST /api/token: emite token LiveKit.
```

Todas as alterações da fila usam uma revisão otimista. Se dois administradores agirem ao mesmo
tempo, o backend rejeita a operação baseada em estado antigo e o cliente recarrega a versão mais
recente. O PostgreSQL ou o arquivo local é a fonte de verdade; mensagens de dados do LiveKit apenas
avisam os clientes sobre atualizações, com polling periódico como recuperação.

### Estrutura do projeto V1.0.0

````
Video-Conferencia-UFMG/
│
├── api/
│   └── [...path].ts
│       → Adapta o servidor Fastify para funcionar como serverless function da Vercel.
│
├── apps/
│   │
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   │   → Inicializa o servidor e começa a escutar requisições.
│   │   │   │
│   │   │   ├── app.ts
│   │   │   │   → Monta o Fastify, middlewares, rotas e tratamento de erros.
│   │   │   │
│   │   │   └── services/
│   │   │       ├── tokenService.ts
│   │   │       │   → Emite tokens para o usuário entrar no LiveKit.
│   │   │       │
│   │   │       ├── sessionCredentials.ts
│   │   │       │   → Cria e valida credenciais de dono e de reconexão.
│   │   │       │
│   │   │       └── roomManagement.ts
│   │   │           → Gerencia salas, aprovação, participantes e moderação.
│   │   │
│   │   └── test/
│   │       → Testa as rotas e respostas da API.
│   │
│   └── web/
│       ├── src/
│       │   ├── main.tsx
│       │   │   → Ponto inicial da aplicação no Frontend.
│       │   │
│       │   ├── app/
│       │   │   └── App.tsx
│       │   │       → Controla navegação, entrada e retomada de chamadas.
│       │   │
│       │   ├── pages/
│       │   │   ├── HomePage.tsx
│       │   │   │   → Tela para criar uma sala ou entrar com um código.
│       │   │   ├── LobbyPage.tsx
│       │   │   │   → Tela de preparação de câmera, microfone e rede.
│       │   │   └── CallPage.tsx
│       │   │       → Conecta ao LiveKit e monta a experiência da chamada.
│       │   │
│       │   ├── components/
│       │   │   ├── lobby/
│       │   │   │   ├── CameraPreview.tsx
│       │   │   │   │   → Exibe a imagem da câmera antes da chamada.
│       │   │   │   ├── DeviceSelect.tsx
│       │   │   │   │   → Permite escolher câmera, microfone e alto-falante.
│       │   │   │   └── PreflightChecklist.tsx
│       │   │   │       → Mostra as verificações feitas antes da entrada.
│       │   │   │
│       │   │   ├── call/
│       │   │   │   ├── VideoStage.tsx
│       │   │   │   │   → Organiza vídeo principal e miniaturas.
│       │   │   │   ├── ParticipantVideo.tsx
│       │   │   │   │   → Renderiza o vídeo e estado de cada participante.
│       │   │   │   ├── CallControls.tsx
│       │   │   │   │   → Controles de câmera, microfone, tela e saída.
│       │   │   │   ├── DeviceSettings.tsx
│       │   │   │   │   → Configura dispositivos e layout durante a chamada.
│       │   │   │   ├── ParticipantManagement.tsx
│       │   │   │   │   → Aprovação e moderação feita pelos administradores.
│       │   │   │   ├── ConnectionNotice.tsx
│       │   │   │   │   → Exibe conexão, reconexão e desconexão.
│       │   │   │   └── CallToast.tsx
│       │   │   │       → Exibe mensagens temporárias da chamada.
│       │   │   │
│       │   │   ├── diagnostics/
│       │   │   │   └── DiagnosticsPanel.tsx
│       │   │   │       → Exibe RTT, perda, bitrate, codec e transporte.
│       │   │   │
│       │   │   └── ui/
│       │   │       └── Button.tsx
│       │   │           → Botão reutilizável da interface.
│       │   │
│       │   ├── hooks/
│       │   │   ├── useMediaDevices.ts
│       │   │   │   → Controla dispositivos, permissões e preview local.
│       │   │   ├── useCallConnection.ts
│       │   │   │   → Traduz os eventos do LiveKit em estados da interface.
│       │   │   ├── useNetworkStats.ts
│       │   │   │   → Coleta estatísticas WebRTC durante a chamada.
│       │   │   ├── usePreflightNetwork.ts
│       │   │   │   → Verifica backend e latência antes da chamada.
│       │   │   ├── useMicrophoneLevel.ts
│       │   │   │   → Mede o volume capturado pelo microfone.
│       │   │   └── useKeyboardShortcuts.ts
│       │   │       → Controla atalhos de teclado.
│       │   │
│       │   ├── lib/
│       │   │   ├── api/client.ts
│       │   │   │   → Centraliza as requisições feitas ao backend.
│       │   │   ├── livekit/createRoom.ts
│       │   │   │   → Cria e configura a instância da sala LiveKit.
│       │   │   ├── webrtc/stats.ts
│       │   │   │   → Interpreta os relatórios técnicos do WebRTC.
│       │   │   ├── webrtc/callMedia.ts
│       │   │   │   → Trata troca de dispositivos e compartilhamento.
│       │   │   ├── webrtc/capabilities.ts
│       │   │   │   → Detecta recursos suportados pelo navegador.
│       │   │   ├── webrtc/mediaErrors.ts
│       │   │   │   → Converte erros de mídia em mensagens amigáveis.
│       │   │   ├── webrtc/testSpeaker.ts
│       │   │   │   → Reproduz um som para testar o alto-falante.
│       │   │   ├── storage.ts
│       │   │   │   → Salva preferências e sessões no localStorage.
│       │   │   └── logger.ts
│       │   │       → Registra eventos sem expor informações sensíveis.
│       │   │
│       │   ├── styles/index.css
│       │   │   → Estilos globais e configuração visual do Tailwind.
│       │   └── types/diagnostics.ts
│       │       → Tipos usados nas informações de diagnóstico.
│       │
│       └── test/
│           → Testes dos componentes, hooks, storage, API e WebRTC.
│
└── packages/
    ├── config/
    │   └── src/index.ts
    │       → Constantes compartilhadas de mídia e armazenamento.
    │
    └── shared/
        ├── src/index.ts
        │   → Tipos compartilhados e classificação da qualidade da rede.
        └── test/networkQuality.test.ts
            → Testa a classificação de qualidade da conexão.```
````
