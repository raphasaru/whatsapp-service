#!/bin/bash

# Script de Deploy - WhatsApp Service
# Execute na VPS: bash deploy.sh

set -e

echo "🚀 Iniciando deploy do WhatsApp Service..."

# Verificar se Docker está instalado
if ! command -v docker &> /dev/null; then
    echo "📦 Instalando Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
fi

# Verificar se Docker Compose está instalado
if ! command -v docker compose &> /dev/null; then
    echo "📦 Instalando Docker Compose..."
    apt update
    apt install docker-compose-plugin -y
fi

# Criar diretório se não existir
mkdir -p /opt/whatsapp-service
cd /opt/whatsapp-service

# Verificar se .env existe
if [ ! -f .env ]; then
    echo "⚠️  Arquivo .env não encontrado!"
    echo "📝 Criando .env..."
    cat > .env << EOF
# Supabase
SUPABASE_URL=https://vonfsyszaxtbxeowelqu.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvbmZzeXN6YXh0Ynhlb3dlbHF1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODUyNTQ4OSwiZXhwIjoyMDg0MTAxNDg5fQ.piqdu0wqfJtvGhhHNPmzFX5iZqTajoWV7j8CpCA_g-Y

# Gemini
GEMINI_API_KEY=AIzaSyCK_5TnkvkSio-fUGk4P-gKkfKrghPok7A

# WAHA
WAHA_API_URL=http://waha:3000
WAHA_SESSION=default
PORT=4000
EOF
    echo "✅ .env criado! Verifique se as credenciais estão corretas."
fi

# Parar containers existentes
echo "🛑 Parando containers existentes..."
docker compose down 2>/dev/null || true

# Build e iniciar
echo "🔨 Fazendo build e iniciando containers..."
docker compose up -d --build

# Aguardar containers iniciarem
echo "⏳ Aguardando containers iniciarem..."
sleep 10

# Verificar status
echo ""
echo "📊 Status dos containers:"
docker compose ps

echo ""
echo "✅ Deploy concluído!"
echo ""
echo "🔍 Verificar logs:"
echo "   docker compose logs -f"
echo ""
echo "📱 Conectar WhatsApp:"
echo "   curl http://localhost:3000/api/sessions/default"
echo ""
echo "🏥 Health check:"
echo "   curl http://localhost:4000/health"
echo ""
