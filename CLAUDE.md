# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**WhatsApp Service** - This repository contains code for WhatsApp integration with the KYN App financial app. **Note: The actual automation is currently handled by n8n workflows, not this Node.js service.** This service code exists but may not be actively deployed.

## Current Architecture: n8n vs whatsapp-service

### n8n (Currently Active)

The WhatsApp automation is **currently running via n8n workflows**. The workflow file `KYN App - WhatsApp com Audio e Imagem (Corrigido).json` contains the active automation.

**What n8n does:**
1. Receives webhooks from WAHA via `@devlikeapro/n8n-nodes-waha.wahaTrigger`
2. Extracts message data (chatId, messageBody, mediaType, mediaUrl)
3. Ignores own messages (`fromMe === false`)
4. Verifies user exists in `user_whatsapp_links` table (by `whatsapp_lid`)
5. Handles different media types:
   - **Text**: Direct extraction via Gemini
   - **Audio (PTT)**: Downloads → Converts to base64 → Gemini transcription + extraction
   - **Image**: Downloads → Converts to base64 → Gemini OCR + extraction
6. Processes Gemini response (parses JSON, handles errors)
7. Creates transactions via Supabase RPC: `create_whatsapp_transaction(p_user_id, p_type, p_amount, p_category, p_description, p_due_date)`
8. Formats success/error messages
9. Sends confirmation via WAHA API (`/api/sendText`)

**Key n8n nodes:**
- `WAHA Trigger1` - Receives webhooks
- `Extrair Dados` - Extracts message data
- `Verificar Usuario` - Checks if user exists
- `Baixar Audio/Imagem` - Downloads media
- `Preparar Audio/Imagem Base64` - Converts to base64 for Gemini
- `Gemini Audio/Imagem/Texto` - Calls Gemini API
- `Processar Audio/Imagem/Texto` - Parses Gemini response
- `Criar Transacao` - Calls Supabase RPC
- `Enviar Confirmacao/Erro` - Sends WhatsApp response

### whatsapp-service (Legacy/Reference)

This Node.js/Express service provides the same functionality but is **not currently active**. It serves as reference code and could be reactivated if needed.

**What whatsapp-service does (if active):**
1. Receives webhooks from WAHA at `/webhook` endpoint
2. Extracts LID from sender
3. Looks up user by `whatsapp_lid`
4. Handles verification codes (6-character alphanumeric)
5. Checks WhatsApp message limits via `increment_whatsapp_message` RPC
6. Processes messages (text/audio/image)
7. Uses Gemini to extract transactions
8. Creates transactions directly in `transactions` table (not via RPC)
9. Sends confirmation via WAHA

**Key differences from n8n:**
- Uses `increment_whatsapp_message` RPC to check limits (n8n doesn't check limits)
- Creates transactions via direct INSERT (n8n uses `create_whatsapp_transaction` RPC)
- Includes limit warnings in confirmation messages
- More detailed error handling

## Tech Stack

- **Runtime**: Node.js 20 + TypeScript
- **Server**: Express.js
- **AI**: Google Gemini 2.0 Flash (text extraction, audio transcription, image OCR)
- **WhatsApp**: WAHA (WhatsApp HTTP API) - self-hosted WhatsApp Web API
- **Database**: Supabase (PostgreSQL) with service_role key for RLS bypass
- **Deployment**: Docker + Docker Compose
- **Automation**: n8n (active workflow)

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  WhatsApp   │───▶│    WAHA       │───▶│    n8n      │
│  (User)     │    │  (port 3000)  │    │ (workflow)  │
└─────────────┘    └──────────────┘    └──────┬──────┘
                                              │
                   ┌──────────────────────────┼──────────────────────────┐
                   │                          │                          │
                   ▼                          ▼                          ▼
            ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
            │   Gemini AI  │          │   Supabase   │          │    WAHA      │
            │  (extraction)│          │  (database)  │          │  (response)  │
            └──────────────┘          └──────────────┘          └──────────────┘
```

**Note:** The `whatsapp-service` Node.js app (port 4000) is not in the active flow. n8n connects directly to WAHA and Supabase.

## Development Commands

```bash
npm install              # Install dependencies
npm run dev              # Start with ts-node (development)
npm run build            # Compile TypeScript
npm start                # Run compiled JS

# Docker
docker compose up -d --build    # Build and start containers
docker compose logs -f          # View logs
docker compose restart          # Restart services
```

## Project Structure

```
src/
├── index.ts              # Express server, /health and /webhook endpoints
├── config.ts             # Environment variables with validation
├── webhooks/
│   └── waha.ts           # Main message handler (text, audio, image)
├── services/
│   ├── gemini.ts         # Gemini AI integration (extraction, transcription)
│   ├── supabase.ts       # Database operations (users, transactions, limits)
│   └── waha.ts           # WAHA API (send messages, download media)
├── prompts/
│   └── extract.ts        # Gemini extraction prompt with category definitions
└── utils/
    └── format.ts         # Currency formatting (BRL)
```

## Message Processing Flow (n8n)

1. **Receive**: WAHA sends webhook to n8n trigger
2. **Extract**: Parse message data (chatId, body, media type, media URL)
3. **Filter**: Ignore messages from bot itself (`fromMe === false`)
4. **Verify User**: Query `user_whatsapp_links` by `whatsapp_lid` where `verified_at IS NOT NULL`
5. **Handle Media**:
   - **Text**: Prepare prompt for Gemini
   - **Audio**: Download → Convert to base64 → Prepare for Gemini transcription
   - **Image**: Download → Convert to base64 → Prepare for Gemini OCR
6. **Extract**: Call Gemini API with appropriate prompt
7. **Process**: Parse Gemini JSON response, handle errors
8. **Create**: Call Supabase RPC `create_whatsapp_transaction` with transaction data
9. **Confirm**: Format success message (single or multiple items) and send via WAHA

## Message Processing Flow (whatsapp-service - if active)

1. **Receive**: WAHA sends webhook to `/webhook` with message data
2. **Identify**: Extract sender's LID (Linked ID) from message
3. **Lookup User**: Query `user_whatsapp_links` by `whatsapp_lid`
4. **Verify** (if new): Check if message is a 6-character verification code
5. **Check Limits**: Call `increment_whatsapp_message` RPC to verify quota
6. **Extract**: Send to Gemini AI based on message type:
   - Text: Direct extraction
   - Audio (PTT): Download → Transcribe → Extract
   - Image: Download → OCR → Extract
7. **Save**: Create transaction directly in `transactions` table
8. **Confirm**: Send confirmation message via WAHA (with limit warnings if applicable)

## Key Patterns

### User Verification

```typescript
// First access flow
1. User sends any message
2. Service can't find user by LID
3. If message is 6 chars alphanumeric → check as verification code
4. Valid code → link LID to user, mark as verified
5. Invalid → reply with instructions
```

### Transaction Extraction

Gemini extracts structured data from natural language:

```typescript
interface ExtractedTransaction {
  description: string    // e.g., "Uber"
  amount: number         // e.g., 50.00
  type: 'income' | 'expense'
  category: ExpenseCategory
}
```

### Expense Categories

```typescript
// Fixed expenses
'fixed_housing'        // Aluguel, condomínio
'fixed_utilities'      // Luz, água, internet
'fixed_subscriptions'  // Netflix, Spotify
'fixed_personal'       // Plano de saúde
'fixed_taxes'          // IPTU, IPVA

// Variable expenses
'variable_credit'      // Cartão de crédito
'variable_food'        // Mercado, restaurante
'variable_transport'   // Uber, combustível
'variable_other'       // Outros
```

### Message Types Supported

| Type | WAHA messageType | n8n Processing | whatsapp-service Processing |
|------|------------------|----------------|----------------------------|
| Text | `chat` | Direct Gemini extraction | Direct Gemini extraction |
| Audio | `ptt` | Download → Base64 → Gemini | Download → Buffer → Gemini |
| Image | `image` | Download → Base64 → Gemini OCR | Download → Buffer → Gemini OCR |

## Database Tables Used

### user_whatsapp_links

```sql
id UUID PRIMARY KEY
user_id UUID REFERENCES auth.users
phone_number TEXT
whatsapp_lid TEXT          -- WAHA's linked ID
verification_code TEXT      -- 6-char code
verification_expires_at TIMESTAMPTZ
verified_at TIMESTAMPTZ
```

### transactions

```sql
id UUID PRIMARY KEY
user_id UUID
description TEXT
amount NUMERIC
type transaction_type       -- 'income' | 'expense'
category expense_category
due_date DATE
status transaction_status   -- always 'completed' from WhatsApp
```

### subscriptions

```sql
user_id UUID
plan TEXT                   -- 'free' | 'pro' | 'pro_annual'
whatsapp_messages_used INT
whatsapp_messages_reset_at TIMESTAMPTZ
```

### RPC Functions

```sql
-- Increment counter and check limit (used by whatsapp-service)
increment_whatsapp_message(p_user_id UUID)
RETURNS { success: boolean, messages_used: int, messages_limit: int }

-- Reset counter if new month
reset_whatsapp_messages_if_needed(p_user_id UUID)
RETURNS { messages_used: int, messages_limit: int, needs_reset: boolean }

-- Create transaction with limit check (used by n8n)
create_whatsapp_transaction(
  p_user_id UUID,
  p_type transaction_type,
  p_amount NUMERIC,
  p_category expense_category,
  p_description TEXT,
  p_due_date DATE
)
RETURNS transaction
```

## Environment Variables

Required in `.env` (for whatsapp-service):

```bash
# Server
PORT=4000

# Supabase (use service_role key for RLS bypass)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...service_role...

# Google Gemini
GEMINI_API_KEY=AIzaSy...

# WAHA (defaults work with docker-compose)
WAHA_API_URL=http://waha:3000
WAHA_SESSION=default
```

**n8n** uses its own environment variables configured in the n8n instance.

## Docker Setup

### docker-compose.yml

```yaml
services:
  waha:
    image: devlikeapro/waha
    ports:
      - "3000:3000"
    environment:
      WHATSAPP_HOOK_URL: http://n8n:5678/webhook/...  # Points to n8n, not app
      WHATSAPP_HOOK_EVENTS: message
    volumes:
      - waha-data:/app/.wwebjs_auth

  app:  # Only needed if using whatsapp-service
    build: .
    ports:
      - "4000:4000"
    depends_on:
      waha:
        condition: service_healthy
    env_file:
      - .env
```

### Connecting WhatsApp

1. Start WAHA container: `docker compose up -d waha`
2. Open `http://YOUR_IP:3000` in browser
3. Scan QR code with WhatsApp mobile app
4. Session persists in `waha-data` volume
5. Configure n8n workflow to receive webhooks from WAHA

## Integration with KYN App

Both systems share the Supabase database with the main KYN App app:

- Uses same tables: `transactions`, `user_whatsapp_links`, `subscriptions`
- Uses `service_role` key (whatsapp-service) or `anon` key (n8n) to bypass RLS
- Respects plan limits (whatsapp-service checks limits, n8n relies on RPC)

### User Links Their WhatsApp

1. In KYN App web app: Settings > WhatsApp
2. Enter phone number → generates verification code
3. Send code via WhatsApp to the bot
4. This service validates and links the account

## Error Handling

**n8n:**
- Unknown user: "Você não está cadastrado no KYN App..."
- IA didn't understand: "Não entendi. Tente: gastei 50 no mercado..."
- All errors logged in n8n execution logs

**whatsapp-service:**
- Unknown user: "Primeiro vincule seu WhatsApp no app"
- Invalid verification code: Reply with instructions
- Limit exceeded: "Você atingiu o limite de mensagens"
- Extraction failed: "Não consegui entender a mensagem"
- All errors logged to console

## Testing

```bash
# Health check (whatsapp-service only)
curl http://localhost:4000/health
# Returns: {"status":"ok","timestamp":"..."}

# Check WAHA session
curl http://localhost:3000/api/sessions/default
# Returns: {"status":"WORKING",...}

# Test n8n workflow
# Trigger manually from n8n UI or send test message via WhatsApp
```

## Related Projects

- `kyn-app/` - Main Next.js web application (see its own CLAUDE.md)
- **n8n workflow**: `KYN App - WhatsApp com Audio e Imagem (Corrigido).json` - Active automation
