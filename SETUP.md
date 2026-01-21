# Guia de Configuração - WhatsApp Service

Este guia explica como configurar e fazer o deploy da integração WhatsApp para o **Meu Bolso**.

## 📋 Pré-requisitos

- [ ] VPS com Docker e Docker Compose instalados
- [ ] Conta no Supabase (projeto já configurado)
- [ ] Conta no Google AI Studio para API do Gemini
- [ ] Número de WhatsApp para conectar o bot

---

## 🔑 1. Obter Credenciais

### 1.1 Supabase

1. Acesse seu projeto no [Supabase Dashboard](https://supabase.com/dashboard)
2. Vá em **Settings > API**
3. Copie:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** (em "Project API keys") → `SUPABASE_SERVICE_KEY`

> ⚠️ **Importante**: Use a `service_role` key, não a `anon` key! Ela é necessária para bypass do RLS.

### 1.2 Google Gemini

1. Acesse [Google AI Studio](https://aistudio.google.com/apikey)
2. Clique em **Create API Key**
3. Copie a chave gerada → `GEMINI_API_KEY`

---

## 🗄️ 2. Verificar Banco de Dados

A tabela `user_whatsapp_links` já deve existir no Supabase. Verifique executando:

```sql
SELECT * FROM user_whatsapp_links LIMIT 1;
```

Se não existir, execute a migration:

```sql
CREATE TABLE user_whatsapp_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(phone_number)
);

ALTER TABLE user_whatsapp_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own links"
ON user_whatsapp_links
FOR ALL
USING (auth.uid() = user_id);
```

---

## 🖥️ 3. Configurar VPS

### 3.1 Instalar Docker (se necessário)

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Instalar Docker Compose
sudo apt install docker-compose-plugin
```

### 3.2 Clonar/Copiar o Serviço

```bash
# Criar diretório
mkdir -p /opt/whatsapp-service
cd /opt/whatsapp-service

# Copiar os arquivos do whatsapp-service para cá
# (ou usar git clone se estiver em um repositório)
```

### 3.3 Criar Arquivo .env

```bash
cd /opt/whatsapp-service
nano .env
```

Conteúdo do `.env`:

```env
# Supabase
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Gemini
GEMINI_API_KEY=AIzaSy...

# Opcional (já tem defaults)
WAHA_API_URL=http://waha:3000
WAHA_SESSION=default
PORT=4000
```

---

## 🚀 4. Iniciar os Containers

```bash
cd /opt/whatsapp-service

# Build e start
docker compose up -d --build

# Verificar logs
docker compose logs -f
```

### Verificar se está rodando:

```bash
# Health check do app
curl http://localhost:4000/health

# Deve retornar: {"status":"ok","timestamp":"..."}
```

---

## 📱 5. Conectar WhatsApp

### 5.1 Acessar Painel do WAHA

1. Acesse `http://SEU_IP_VPS:3000` no navegador
2. O WAHA mostrará um QR Code

### 5.2 Escanear QR Code

1. Abra o WhatsApp no celular
2. Vá em **Configurações > Dispositivos Conectados**
3. Toque em **Conectar Dispositivo**
4. Escaneie o QR Code

### 5.3 Verificar Conexão

```bash
# Via API
curl http://localhost:3000/api/sessions/default

# Deve mostrar status: "WORKING"
```

---

## 🔒 6. Configurar Firewall (Produção)

Para produção, **não exponha a porta 3000** (WAHA) publicamente:

```bash
# UFW (Ubuntu)
sudo ufw allow 22    # SSH
sudo ufw allow 4000  # Webhook (ou use nginx como proxy)
sudo ufw deny 3000   # Bloquear acesso externo ao WAHA
sudo ufw enable
```

### Opcional: Nginx como Proxy

```nginx
server {
    listen 80;
    server_name whatsapp.seudominio.com;

    location /webhook {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 👤 7. Vincular Usuário no App

1. O usuário acessa o **Meu Bolso** web
2. Vai em **Configurações > WhatsApp**
3. Digita o número de celular e clica em "Vincular"
4. Pronto! Já pode enviar mensagens para o WhatsApp conectado

---

## ✅ 8. Testar a Integração

### Teste Manual

1. Envie uma mensagem para o WhatsApp conectado:
   ```
   gastei 50 no uber
   ```

2. Deve receber resposta:
   ```
   Transação registrada!
   
   💸 Uber: R$ 50,00
   ```

3. Verifique no Supabase se a transação foi criada:
   ```sql
   SELECT * FROM transactions 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```

### Tipos de Mensagem Suportados

| Tipo | Exemplo |
|------|---------|
| Texto | "gastei 150 no mercado" |
| Áudio | Gravar: "paguei 80 de internet" |
| Imagem | Foto de cupom fiscal |

---

## 🔧 9. Manutenção

### Ver Logs

```bash
# Todos os containers
docker compose logs -f

# Apenas o app
docker compose logs -f app

# Apenas WAHA
docker compose logs -f waha
```

### Reiniciar Serviços

```bash
docker compose restart
```

### Atualizar Código

```bash
cd /opt/whatsapp-service
git pull  # ou copie os novos arquivos
docker compose up -d --build
```

### Backup dos Dados do WAHA

Os dados da sessão do WhatsApp ficam em um volume Docker:

```bash
# Listar volumes
docker volume ls

# Backup
docker run --rm -v whatsapp-service_waha-data:/data -v $(pwd):/backup alpine tar czf /backup/waha-backup.tar.gz /data
```

---

## ❗ Troubleshooting

### WhatsApp desconectou

1. Acesse `http://SEU_IP:3000`
2. Escaneie o QR Code novamente
3. Verifique se não excedeu limite de dispositivos conectados

### Mensagens não estão sendo processadas

1. Verifique logs: `docker compose logs -f app`
2. Confirme que o número está vinculado no banco:
   ```sql
   SELECT * FROM user_whatsapp_links WHERE phone_number LIKE '%SEU_NUMERO%';
   ```

### Erro de autenticação Supabase

1. Verifique se está usando `service_role` key (não `anon`)
2. Confirme URL do projeto está correta
3. Teste conexão:
   ```bash
   curl -H "apikey: SUA_SERVICE_KEY" \
        -H "Authorization: Bearer SUA_SERVICE_KEY" \
        "SUA_SUPABASE_URL/rest/v1/user_whatsapp_links?limit=1"
   ```

### Gemini retornando erro

1. Verifique quota no [Google AI Studio](https://aistudio.google.com)
2. Confirme que a API key está ativa
3. Veja logs para detalhes: `docker compose logs app | grep -i gemini`

---

## 📊 Custos Estimados

| Componente | Custo Mensal |
|------------|--------------|
| VPS (Hetzner CX22) | ~€4 |
| Gemini API (50 msgs/dia) | ~$10-30 |
| WAHA | Gratuito |
| Supabase | Plano atual |

---

## 📁 Estrutura de Arquivos

```
whatsapp-service/
├── .env                    # Suas credenciais (NÃO commitar!)
├── docker-compose.yml      # Orquestração dos containers
├── Dockerfile              # Build do app Node.js
├── package.json
├── tsconfig.json
├── SETUP.md               # Este arquivo
└── src/
    ├── index.ts           # Server Express
    ├── config.ts          # Variáveis de ambiente
    ├── webhooks/
    │   └── waha.ts        # Handler de mensagens
    ├── services/
    │   ├── gemini.ts      # IA para extração
    │   ├── supabase.ts    # Banco de dados
    │   └── waha.ts        # Envio de mensagens
    ├── prompts/
    │   └── extract.ts     # Prompt do Gemini
    └── utils/
        └── format.ts      # Formatação
```

---

## ✨ Pronto!

Se seguiu todos os passos, sua integração WhatsApp está funcionando! 

Os usuários podem:
- Vincular WhatsApp no app web
- Enviar mensagens de texto, áudio ou foto
- Receber confirmação automática de cada transação

Dúvidas? Verifique os logs ou abra uma issue no repositório.
