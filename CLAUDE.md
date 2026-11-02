# Planner Semanal: instruções do projeto

Este arquivo é a fonte de verdade sobre o app. Leia inteiro no início de toda conversa e mantenha atualizado ao final de toda sessão de trabalho (ver seção "Como manter este arquivo vivo").

## Papel do Claude

Você é o desenvolvedor e designer do Planner Semanal. Desenvolve features, corrige bugs, faz build e deploy, cuida da qualidade visual e da UX, e sugere melhorias de performance e usabilidade.

- Português brasileiro, tom técnico e direto. O Xande entende de desenvolvimento web.
- Pedido de alteração claro: faça a mudança, build e deploy sem perguntar demais.
- Pedido ambíguo que muda o resultado: pergunte antes, de forma curta.
- Depois de cada deploy, lembre o Xande de fazer hard refresh (Cmd+Shift+R / Ctrl+Shift+R).
- Mudanças cirúrgicas. Nada de reescrever o App.jsx inteiro quando um trecho resolve.

## O que é o app

Planner semanal pessoal (PWA) usado pelo Xande e pela Déa para organizar tarefas da semana de vários projetos. Precisa funcionar bem no iPhone, no iPad e no computador.

- **URL canônica:** https://plannersemanal.com (guia do usuário em `/guia-usuario`)
- **Repositório:** github.com/alexandresette/planner-semanal (público; se ficar privado o GitHub Pages desliga)
- **Pasta local:** `/Users/alexandresette/Documents/Pessoal/planner-semanal`
- **Usuários:** `xande` (admin, desenvolvedor) e `dea` (usuária comum), mais quem for convidado. Dados isolados por usuário. Recursos de admin só para `xande` (const `ADMIN_USER`).

## Stack

- React 18 + Vite 5, estilos inline (CSS-in-JS), animações CSS para hover e transições
- Firebase 12: Firestore + Auth (anônimo + Google) + Cloud Functions v2 (região `southamerica-east1`)
- Projeto Firebase: `planner-semanal-7`
- Hospedagem: GitHub Pages servindo a branch `gh-pages` (raiz), domínio customizado, HTTPS forçado. O build sai em `docs/`, que também é versionado na `main`.
- E-mail: Resend (domínio plannersemanal.com) via Cloud Functions `sendInviteEmail` e `sendResetEmail` (ambas `onRequest`, chave via `defineSecret("RESEND_API_KEY")`, CORS com lista de origens). O front chama por `fetch` em `storage.js` (`callSendInviteEmail`, `callSendResetEmail`).
- Fontes: DM Sans (corpo, const `F`) e Inter (títulos, const `FS`). Syne foi abandonada.
- Tema dark padrão (`#0B1120` de fundo), com toggle light/dark (`useTheme`, chave `planner-theme`)
- Ambiente local verificado em 2026-11-02: Node 25 no Mac, build em ~1s, bundle único de ~810 kB (aviso do Vite de chunk > 500 kB)

## Estrutura

```
planner-semanal/
├── public/            copiado como está para docs/ no build
│   ├── CNAME, favicon.svg, logo.svg, logo-light.svg
│   ├── manifest.json, sw.js, apple-touch-icon.png, icon-192.png, icon-512.png
│   └── guia-usuario/index.html   guia estático (segue o tema do app via localStorage)
├── src/
│   ├── App.jsx        quase todo o app (~3.300 linhas)
│   ├── App.jsx.bak    backup antigo versionado (lixo, ver pendências)
│   ├── main.jsx       entry point (importa storage.js antes do App)
│   └── storage.js     adapter Firestore (window.storage get/set/delete/list), ensureAuth() com login anônimo, login Google, chamadas às functions
├── functions/         Cloud Functions (index.js; index.js.bak é lixo versionado)
├── docs/              build para o GitHub Pages (gerado, não editar à mão)
├── firestore.rules    regras versionadas (deploy pela CLI ou Console)
├── firebase.json, .firebaserc
├── index.html
├── vite.config.js     base: '/', outDir: 'docs'
└── package.json
```

**Mapa do App.jsx (ordem no arquivo):** credenciais e helpers de convite/usuário, helpers de data e dias (`WEEK_DAYS`, `getActiveWeekDays`, `ActiveDaysContext`, `useActiveWeekDays`), `DEFAULT_PROJECTS_XANDE`, `priorityConfig`, `themes`, `useTaskPointerDrag`, `DragGhost`, `useTheme`, `Logo`, telas de acesso (`GoogleInviteScreen`, `InviteGate`, `FirstAccessScreen`, `ResetPasswordScreen`, `ForgotPasswordScreen`, `LoginScreen`), `AdminPanel`, `ProgressRing`, `ConfirmDeleteModal`, `TaskViewModal`, `TaskItem`, `DescriptionEditor`, helpers de embed, `AttachmentSection`, `AddTaskInput`, `WeekTitleEditor`, `ProjectCard`, `AddCategoryCard`, `HistoryCard`, `ColumnProjectCard`, `UserSettingsModal`, `CHANGELOG` (por volta da linha 2130), `WhatsNewModal`, `ReportModal`, `App`.

## Modelo de dados

Coleção `storage` no Firestore, um documento por chave (valor em JSON string):

- `gestor-${user}-data`: array de semanas `{ id, sun, sat, title?, projects }`
- `gestor-${user}-history`: semanas concluídas `{ week, date, projects, total }`, máximo 52
- `planner-${user}-profile`: `{ displayName, photoURL, activeDays? }`
- `user-creds-${username}`: `{ username, hash, email }` (hash vazio em conta só Google)
- `admin-invites`: lista `{ email, createdAt }`
- `last-seen-${user}`: timestamp do último acesso (mostrado no painel admin)
- `reset-token-${token}`: `{ username, email, expiresAt }`, vale 1 hora
- `whats-new-pinned`: versão de novidade fixada pelo admin
- `backup-${chave}-${timestamp}`: cópia local pendente que perdeu para o Firestore numa sincronização (ver Sincronização)

Projeto: `{ id, name, emoji, color, tasks }`.
Tarefa: `{ id, text, description, done, priority: "high"|"medium"|"low", day: "dom"|"seg"|"ter"|"qua"|"qui"|"sex"|"sab", attachments: [{ type: "image"|"video_file"|"link"|"document", name, data }] }`. Em imagem, vídeo e documento, `data` é data URL base64 gravada dentro do documento do Firestore.

localStorage: cache de cada chave do Firestore com `${chave}__meta` (`{ updatedAt, baseUpdatedAt, pendingSync? }`) e `${chave}__backup_${ts}`; `planner-theme`, `gestor-session-token` (`{ user, token, ts }`), `planner-${user}-viewMode`, `planner-${user}-layoutMode`, `planner-${user}-focosOpen`, `whats-new-last-seen`. Login e logout apagam todo o localStorage exceto `planner-theme`.

## Funcionalidades atuais

**Autenticação e segurança**
- Login por e-mail + senha (hash SHA-256 de `user:senha`) e login Google; usuário fixo resolvido por `GMAIL_MAP`/`CREDENTIALS`, demais em `user-creds-*`
- "Esqueci a senha": gera token de 1 hora, envia link `?reset=` por e-mail; após redefinir, força novo login
- Convites via `?invite=`, reset via `?reset=`; ambos têm prioridade sobre sessão ativa e são tratados na raiz do App
- Convidado com Gmail vê só o botão Google (`GoogleInviteScreen`, conta criada automaticamente); demais criam nome e senha (`FirstAccessScreen`), username gerado a partir do e-mail
- Regras do Firestore exigem `request.auth != null` (auth anônimo garantido pelo `ensureAuth()`); fora da coleção `storage` tudo é negado
- `activeUserRef` funciona como trava de escrita: na troca de usuário, `weeks` e `history` são limpos e só voltam a persistir depois do load do usuário certo
- Painel admin (botão roxo, sempre primeiro no header): convidar por e-mail, convites pendentes, usuários ativos com último acesso, limpar dados de usuário, excluir usuário

**Semanas e tarefas**
- Semana atual + próxima, título editável inline (`WeekTitleEditor`)
- Views: Projetos e Dias da Semana. Layouts: Lista e Colunas; abaixo de 768px o layout é forçado para lista (listener de resize)
- Tarefa com prioridade, dia, descrição e anexos (foto, vídeo, documento/PDF, link com embed de YouTube, Vimeo, Google Drive e Loom)
- Clique na tarefa abre `TaskViewModal` (visualização + edição completa); o menu de três pontos abre o painel inline de edição
- Ordenação: concluídas por último, depois prioridade, depois dia (dom a sáb, sem dia por último), depois texto
- Adicionar tarefa direto no card do dia (exige escolher projeto); Enter cria a tarefa, exceto dentro da textarea de descrição
- Mover tarefa entre projetos pelo painel de edição (só na view Dias da Semana)
- Adiar/adiantar entre semanas, "puxar da próxima semana" (manual e automático ao completar)
- "Repetir tarefas": clona as tarefas do projeto para a semana seguinte
- Reordenar projetos (sincroniza a ordem em todas as semanas); excluir projeto remove em todas as semanas
- Completar semana com preview, histórico com impressão (respeita a view ativa, logo conforme o tema)
- Relatório (`ReportModal`): por projetos ou por dias, semana atual, próxima ou ambas, com ou sem anexos; abre em nova aba para imprimir/salvar PDF
- "Focos da semana": tarefas de alta prioridade, concluídas ficam riscadas, badge pendentes/total
- Novidades (`WhatsNewModal`): alimentado pelo `CHANGELOG`, badge de não lido, admin pode fixar uma novidade para todos
- ESC fecha painéis e modais (listener global em `window` com capture)
- Dias ativos configuráveis no perfil (`ActiveDaysContext`); tarefas de dias desativados migram para o primeiro dia ativo

**Drag and drop**
- Sistema próprio com Pointer Events (hook `useTaskPointerDrag`), funciona com mouse, toque e caneta
- Mouse ativa com 5px de movimento; toque/caneta com long-press de 180ms, vibração háptica, ghost flutuante (`DragGhost`), auto-scroll nas bordas
- Listeners de move/up/cancel em `window`, sem `setPointerCapture`
- Hit-testing com `data-day-key` nos containers + `document.elementsFromPoint`
- Drag bloqueado enquanto há painel aberto (`isEnabled: !openTaskId`)

**Perfil**
- Foto com upload e recorte circular via canvas, nome de exibição, avatar no header, foto do Google no login, dias ativos

**Sincronização (storage.js)**
- `ensureAuth()` tenta o login anônimo de novo a cada 10s se ele falhou, então uma aba aberta se recupera sozinha quando o Firebase volta
- Gravação que falha fica no localStorage com `pendingSync` e a `baseUpdatedAt` (versão do Firestore sobre a qual foi feita)
- No próximo `get`, a pendência sobe se o Firestore ainda está na mesma base; se mudou (ou não há base conhecida), a cópia local vira `backup-*` no Firestore e o remoto vence

**E-mail (functions)**
- `sendInviteEmail` só envia para e-mails presentes em `admin-invites`
- `sendResetEmail` ignora o link vindo do cliente: extrai o token, confere `reset-token-*` (e-mail e validade) e monta o link com `APP_URL`

**PWA**
- `manifest.json`, ícones e `sw.js` (cache `planner-semanal-v1`)

## Requisitos inegociáveis

1. iPad e iPhone funcionando em toda mudança, principalmente drag e toque
2. `docs/CNAME` com `plannersemanal.com` presente em todo deploy
3. Build testado antes do deploy
4. Nunca expor tokens, senhas, hashes de PIN ou chaves em respostas, commits ou neste arquivo
5. Logo como SVG externo em `public/`, nunca base64 inline
6. Todo botão novo que não é submit leva `type="button"` (o código antigo ainda não segue, ver pendências)
7. Toda versão nova ganha entrada no `CHANGELOG` do App.jsx (array `CHANGELOG`, entrada nova no início do array, que é o que o modal de Novidades mostra)

## Fluxo de trabalho

**Início de sessão**
```bash
cd /Users/alexandresette/Documents/Pessoal/planner-semanal
gh api user --jq .login                 # tem que ser alexandresette
gh auth switch --user alexandresette    # se não for
git status                              # arquivo não versionado pode travar o pull
git pull origin main
npm install                             # só se package.json mudou
```
Depois leia este arquivo e o `src/App.jsx` completo antes de editar.

**Teste local:** `npm run dev`

**Build de teste sem tocar no docs/ versionado:** `npx vite build --outDir "$(mktemp -d)" --emptyOutDir`

**Deploy (após cada alteração aprovada)**
```bash
cd /Users/alexandresette/Documents/Pessoal/planner-semanal
rm -rf docs
npm run build                           # Vite já copia tudo de public/ (CNAME, logos, manifest, sw, ícones, guia)
touch docs/.nojekyll
ls docs/CNAME docs/manifest.json docs/sw.js docs/guia-usuario/index.html   # conferir

git add -A
git commit -m "vX.Y: descrição"
git push origin main

cd docs
rm -rf .git
git init -b gh-pages
git add -A
git commit -m "Deploy vX.Y"
git push -f https://github.com/alexandresette/planner-semanal.git gh-pages
rm -rf .git
cd ..
```
A autenticação do push vem do `gh` (rodar `gh auth setup-git` uma vez se o git pedir senha). Nada de token embutido na URL. O script `npm run deploy` do package.json está obsoleto (aponta para `dist`), não usar.

**Cloud Functions:** `firebase deploy --only functions --project planner-semanal-7 --account alexandresettesf@gmail.com` (a conta padrão do Firebase CLI no Mac é outra, por isso o `--account`). Runtime Node 22, firebase-functions 7, firebase-admin 13. O deploy leva mais de 1 minuto (Firebase CLI autenticado na máquina do Xande). Se aparecer "No changes detected", `npm install --save firebase-functions@latest` dentro de `functions/` força o redeploy.

**Regras do Firestore:** editar `firestore.rules` e publicar com `firebase deploy --only firestore:rules` ou pelo Console. A API de regras exige OAuth2.

## Aprendizados técnicos (não repetir esses erros)

- **Pointer capture some no re-render.** Se o React re-renderiza o elemento durante o drag, `setPointerCapture` se perde em silêncio e o `pointerup` nunca chega. Solução adotada: listeners de `pointermove/pointerup/pointercancel` em `window` via `useEffect`, sem `setPointerCapture`.
- **iOS e seleção de texto no long-press.** `WebkitUserSelect: "none"`, `userSelect: "none"` e `WebkitTouchCallout: "none"` precisam estar inline no elemento arrastável desde o início. Aplicar no `body` depois que o drag ativa é tarde demais.
- **Scroll lock só para toque.** `overflow:hidden` durante o drag vale para touch/pen; no mouse atrapalha.
- **Referência circular em hooks** é o bug que mais volta: `useEffect`/`useCallback` usando estado declarado depois. Reordene as declarações ou transforme em função comum.
- **Enter em formulário com badges.** Botões sem `type="button"` capturam o Enter. O painel de nova tarefa intercepta Enter no container (exceto na textarea de descrição).
- **ESC em div não funciona** porque a div não tem foco. Use listener global em `window` com capture.
- **Botões OK/cancelar ao lado de input** usam `onMouseDown` para não brigar com o `onBlur`.
- **Fechar painel com ESC** precisa chamar `onEditingChange(false)` junto com `onOpen(null)`, senão o drag fica travado.
- **Sessão em sessionStorage** desloga no hard refresh. Por isso fica no localStorage.
- **GitHub Pages e domínio:** sem `docs/CNAME` o domínio cai em silêncio. Com `base: '/'`, o endereço `alexandresette.github.io/planner-semanal/` mostra tela em branco, e isso é esperado.
- **Repo privado desliga o Pages.** Voltar para público não religa sozinho: reconfigurar em Settings > Pages (branch `gh-pages`, domínio, Enforce HTTPS).
- **Service worker guarda erro em cache.** Depois de queda ou deploy estranho, desregistrar em DevTools > Application ou testar em aba anônima.
- **gh-pages sem estado.** Recriar o git dentro de `docs/` e dar force-push a cada deploy é mais confiável que manter a branch.
- **"Bad credentials" na API com clone funcionando** significa token sem escopo de API, não token inválido.
- **Firestore via REST** exige bearer token do Firebase Auth (anônimo serve).
- **Chave de API com um caractere errado** derrubou o login Google uma vez. Na dúvida, comparar com o Console do Firebase.
- **Pull travado por arquivo local não versionado.** Um `functions/package-lock.json` solto bloqueou o `git pull` na migração para local. Guardar com `git stash push -u -- <pasta>` em vez de apagar, e decidir depois.
- **Login anônimo bloqueado derruba o app inteiro em silêncio.** Até 2026-11-02 o Firebase recusava `signInAnonymously` com `auth/admin-restricted-operation` porque o provedor Anonymous não estava ativo em Sign-in method (ligar o sign-up em User actions não bastou). Pelos dados, a falha vinha pelo menos desde maio de 2026. Sem auth, as regras devolvem `permission-denied` em tudo, o app roda só com o cache local e usuário novo não entra. Diagnóstico rápido: `accounts:signUp` na Identity Toolkit API devolve `ADMIN_ONLY_OPERATION`.
- **Cache local não pode vencer o Firestore às cegas, nem ser descartado às cegas.** Sem a `baseUpdatedAt`, um aparelho que carregou os projetos padrão durante a falha subiria esses padrões por cima dos dados reais. Por isso a pendência só sobe com base igual à remota; o resto vira backup.
- **Function de e-mail que aceita link do cliente é um relay de phishing.** Montar o link no servidor a partir de um token validado.
- **Runtime de function aposentado bloqueia qualquer deploy.** O Node 20 foi desativado em 2026-10-30 e o deploy falhava antes de subir código. Subimos para Node 22 (`engines` no `functions/package.json`).
- **`npm run build` reescreve o `docs/` versionado.** Para só validar o ambiente, buildar em pasta temporária com `--outDir`.

## Pendências conhecidas (confirmar se ainda estão abertas)

- Backups de 2026-11-02 no Firestore (`backup-gestor-xande-data-*`, `backup-gestor-xande-history-*`, `backup-admin-invites-*`) já foram mesclados de volta (tarefas, 7 semanas de histórico e o convite de 21/10). Podem ser apagados quando o Xande confirmar que está tudo certo.
- Outros aparelhos (iPhone, iPad, Déa) podem ter edições locais feitas durante a falha: ao abrirem a v2.34, elas viram `backup-*` no Firestore. Conferir e mesclar.
- CHANGELOG parado em v2.33: v2.33.1, v2.33.2 e os fixes de drag e Enter de maio/2026 não têm entrada. As datas de v2.0 a v2.20 estão com ano 2025 e provavelmente deveriam ser 2026.
- `type="button"` só em 3 dos 108 botões do App.jsx. Não há `<form>` no app, então o risco hoje é baixo, mas a regra 6 não é cumprida no código antigo.
- Segurança: a sessão é só `{ user, token }` no localStorage e o token não é validado em lugar nenhum, então editar o localStorage dá acesso a qualquer usuário. O hash de credencial do admin está no bundle público. Avaliar migrar a identidade para o Firebase Auth e regras por `request.auth.uid`.
- Anexos em base64 dentro do documento `gestor-${user}-data`: o Firestore limita cada documento a 1 MiB, então poucas fotos ou um vídeo podem quebrar o salvamento da semana inteira. Avaliar Firebase Storage ou limite de tamanho no upload.
- Lixo versionado: `src/App.jsx.bak` e `functions/index.js.bak`.
- Script `deploy` do package.json obsoleto (aponta para `dist`).
- Stash local `local functions antes do pull 2026-11-02` ficou obsoleto (as functions já estão em firebase-functions 7); pode ser descartado com `git stash drop`.
- Bundle de ~810 kB em um chunk só (Firebase inteiro). Code splitting pode melhorar o primeiro carregamento no iPhone.
- `sw.js` com nome de cache fixo (`planner-semanal-v1`); se o SW passar a servir assets do cache, versionar o nome a cada deploy.
- Resend: registros DKIM, SPF e MX de `send.plannersemanal.com` estão publicados no DNS. Falta só confirmar o status "verified" no painel do Resend.

Resolvidas na revisão de 2026-11-02: card de login responsivo (`width: "100%", maxWidth: 400`), texto do anel de progresso visível (texto dentro do SVG com `overflow: visible`), troca automática para lista abaixo de 768px, "Categoria" trocado por "Projeto" na UI (só sobra no texto histórico do CHANGELOG v2.0).

## Como manter este arquivo vivo

Ao final de toda sessão em que algo mudou, e antes de encerrar a conversa, atualize este arquivo sem esperar o Xande pedir:

1. **Funcionalidades atuais:** inclua o que foi entregue, ajuste o que mudou, remova o que saiu.
2. **Aprendizados técnicos:** registre todo bug cuja causa não era óbvia, com causa e solução em uma ou duas linhas.
3. **Pendências conhecidas:** risque o que foi resolvido, inclua o que ficou para depois.
4. **Registro de evolução:** adicione uma linha no topo da tabela abaixo.
5. Faça commit do CLAUDE.md junto com o código (`docs: atualiza CLAUDE.md`).

Regras: fatos curtos, sem narrar a sessão inteira; nada de segredo; se o arquivo crescer demais, condense os registros antigos em um resumo por mês.

## Registro de evolução

| Data | Versão | O que mudou |
|------|--------|-------------|
| 2026-11-02 | v2.34 | Provedor Anonymous reativado no Console; tarefas, histórico e convite perdidos na falha restaurados a partir dos backups |
| 2026-11-02 | v2.34 | Diagnóstico do login anônimo bloqueado; sincronização com base remota, retry de auth e backup de pendências; functions de e-mail travadas e publicadas em Node 22 |
| 2026-11-02 | v2.33 (+ fixes) | Projeto migrado para local; CLAUDE.md criado e revisado contra o código (modelo de dados, functions, PWA, relatório, anexos, novidades, pendências) |
| 2026-05 | v2.32 a v2.33.2 | Drag com Pointer Events, dias ativos configuráveis, fixes de Enter e drag no desktop/iPad |
| 2026-03 | v2.14 a v2.31 | Perfil com foto, convites por e-mail, login Google, anexos, relatório, novidades fixadas, guia do usuário, domínio plannersemanal.com, regras do Firestore, puxar próxima semana, impressão do histórico |
| antes | v2.0 a v2.10 | Lançamento: semanas atual/próxima, views, histórico, tema, drag em colunas, focos da semana |
