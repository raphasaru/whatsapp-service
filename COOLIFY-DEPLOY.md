# Deploy no Coolify - WhatsApp Service

## 🎯 Resumo Rápido

Você vai precisar subir o código para um repositório Git e conectar no Coolify.

---

## 📦 Passo 1: Subir código para GitHub

### 1.1 Criar repositório no GitHub

1. Acesse [github.com/new](https://github.com/new)
2. Nome: `whatsapp-service`
3. Visibilidade: **Private** (recomendado)
4. Clique em **Create repository**

### 1.2 Fazer push do código

No terminal, dentro da pasta `whatsapp-service`:

```bash
cd "/Users/charbellelopes/untitled folder/whatsapp-service"

# Inicializar git
git init

# Criar .gitignore
echo "node_modules/
dist/
.env
*.log" > .gitignore

# Adicionar arquivos
git add .
git commit -m "Initial commit - WhatsApp service"

# Conectar ao GitHub (substitua SEU_USUARIO pelo seu username)
git remote add origin https://github.com/SEU_USUARIO/whatsapp-service.git
git branch -M main
git push -u origin main
```

---

## 🚀 Passo 2: Configurar no Coolify

### 2.1 Acessar Coolify

Acesse o painel do Coolify na sua VPS Hostinger.

### 2.2 Conectar GitHub (se ainda não fez)

1. Vá em **Settings > Sources**
2. Clique em **+ Add** > **GitHub App**
3. Siga o fluxo de autorização do GitHub

### 2.3 Criar novo projeto

1. Clique em **+ Create New Resource**
2. Selecione **Docker Compose**
3. Escolha o servidor da sua VPS
4. Selecione **Git Repository**
5. Escolha o repositório `whatsapp-service`

### 2.4 Configurar variáveis de ambiente

No Coolify, vá em **Environment Variables** e adicione:

```
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvbmZzeXN6YXh0Ynhlb3dlbHF1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODUyNTQ4OSwiZXhwIjoyMDg0MTAxNDg5fQ.piqdu0wqfJtvGhhHNPmzFX5iZqTajoWV7j8CpCA_g-Y

GEMINI_API_KEY=AIzaSyCK_5TnkvkSio-fUGk4P-gKkfKrghPok7A
```

### 2.5 Deploy

Clique em **Deploy** e aguarde o build completar.

---

## 🔌 Passo 3: Configurar Portas no Coolify

O Coolify precisa expor as portas:

- **3000** → Painel do WAHA (para escanear QR Code)
- **4000** → Webhook do serviço

No Coolify:
1. Vá na configuração do recurso
2. Em **Ports**, certifique que estão expostas:
   - `3000:3000` (WAHA)
   - `4000:4000` (App)

---

## 📱 Passo 4: Conectar WhatsApp

Após o deploy:

1. Acesse `http://SEU_IP_VPS:3000` no navegador
2. Você verá o painel do WAHA
3. Clique em **"Start Session"** se necessário
4. Escaneie o **QR Code** com seu WhatsApp:
   - WhatsApp > Configurações > Dispositivos Conectados > Conectar Dispositivo

### Verificar conexão:

```bash
curl http://SEU_IP_VPS:3000/api/sessions/default
```

Deve retornar `status: "WORKING"`.

---

## ✅ Passo 5: Testar

1. No app **Meu Bolso**, vá em **Configurações > WhatsApp**
2. Vincule seu número de telefone
3. Envie uma mensagem para o WhatsApp conectado:
   ```
   gastei 50 no uber
   ```
4. Deve receber confirmação:
   ```
   Transação registrada!
   
   💸 Uber: R$ 50,00
   ```

---

## 🔒 Segurança (Importante!)

Depois de confirmar que tudo funciona:

1. **Não exponha a porta 3000 publicamente**
   - Use apenas internamente ou via VPN
   - O painel WAHA não tem autenticação por padrão

2. **Configure firewall**:
   ```bash
   # No servidor
   sudo ufw allow 22     # SSH
   sudo ufw allow 4000   # Webhook
   sudo ufw deny 3000    # Bloquear WAHA externo
   sudo ufw enable
   ```

3. **Use HTTPS** (Coolify pode configurar SSL automaticamente)

---

## 📊 Suas Credenciais

| Variável | Valor |
|----------|-------|
| SUPABASE_URL | `https://vonfsyszaxtbxeowelqu.supabase.co` |
| SUPABASE_SERVICE_KEY | `eyJhbGciOiJIUzI1NiIs...` (já configurado) |
| GEMINI_API_KEY | `AIzaSyCK_5Tnkvk...` (já configurado) |

---

## 🔧 Troubleshooting

### Container não inicia

```bash
# Ver logs no Coolify ou via SSH
docker logs whatsapp-service
docker logs waha
```

### WAHA não conecta

1. Verifique se a porta 3000 está acessível
2. Tente reiniciar o container WAHA
3. Escaneie o QR Code novamente

### Mensagens não são processadas

1. Verifique se o número está vinculado no Supabase:
   ```sql
   SELECT * FROM user_whatsapp_links;
   ```
2. Veja os logs do app:
   ```bash
   docker logs whatsapp-service -f
   ```

---

## 🎉 Pronto!

Sua integração WhatsApp está configurada no Coolify!

Agora os usuários podem:
- Vincular WhatsApp no app web Meu Bolso
- Enviar mensagens de texto, áudio ou foto
- Ter transações criadas automaticamente
