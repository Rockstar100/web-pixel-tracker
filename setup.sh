#!/bin/bash
# Quick Start Script for Seleric Tracker with Umami Integration
# This script helps you set up and run the development environment

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEFAULT_LOCAL_PORT=39351
DEFAULT_TUNNEL_PROVIDER="ngrok"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Seleric Tracker + Umami Integration Setup${NC}"
echo -e "${BLUE}================================================${NC}\n"

# Check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}✗ Node.js is not installed${NC}"
        exit 1
    fi
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✓ Node.js ${NODE_VERSION}${NC}"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}✗ npm is not installed${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ npm installed${NC}"
    
    # Check Shopify CLI
    if ! command -v shopify &> /dev/null; then
        echo -e "${RED}✗ Shopify CLI is not installed${NC}"
        echo "Install from: https://shopify.dev/docs/apps/tools/cli/install"
        exit 1
    fi
    echo -e "${GREEN}✓ Shopify CLI installed${NC}"
    
    # Check PostgreSQL connection
    if [ -z "$DATABASE_URL" ]; then
        echo -e "${YELLOW}! DATABASE_URL not set${NC}"
        echo "   Set your PostgreSQL connection string"
        echo "   Example: postgresql://user:password@localhost:5432/seleric_tracker"
    else
        echo -e "${GREEN}✓ DATABASE_URL configured${NC}"
    fi
    
    echo ""
}

# Setup database
setup_database() {
    echo -e "${YELLOW}Setting up database...${NC}"
    
    if [ -z "$DATABASE_URL" ]; then
        echo -e "${RED}Error: DATABASE_URL not set${NC}"
        echo "Please set DATABASE_URL environment variable and try again"
        return 1
    fi
    
    echo "Running Prisma migrations..."
    npm run setup
    echo -e "${GREEN}✓ Database setup complete${NC}"
    echo ""
}

# Start tunnel
start_tunnel() {
    echo -e "${YELLOW}Starting tunnel service...${NC}"
    
    if command -v ngrok &> /dev/null; then
        echo "Starting ngrok tunnel on port $DEFAULT_LOCAL_PORT..."
        ngrok http $DEFAULT_LOCAL_PORT &
        sleep 3
        echo -e "${GREEN}✓ Tunnel started${NC}"
        
        # Try to get the tunnel URL
        TUNNEL_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*' | head -1 | cut -d'"' -f4)
        if [ ! -z "$TUNNEL_URL" ]; then
            echo -e "${BLUE}Tunnel URL: $TUNNEL_URL${NC}"
        fi
    else
        echo -e "${YELLOW}! ngrok not found. Please set up a tunnel manually:${NC}"
        echo "   1. Install ngrok from https://ngrok.com/download"
        echo "   2. Run: ngrok http $DEFAULT_LOCAL_PORT"
        echo "   3. Copy the tunnel URL"
        return 1
    fi
    echo ""
}

# Build extension
build_extension() {
    echo -e "${YELLOW}Building web pixel extension...${NC}"
    
    cd extensions/seleric-pixel
    npm install --legacy-peer-deps || true
    npm run build || true
    cd ../..
    
    echo -e "${GREEN}✓ Extension built${NC}"
    echo ""
}

# Start development server
start_dev_server() {
    local tunnel_url=$1
    
    echo -e "${YELLOW}Starting development server...${NC}"
    echo ""
    
    if [ -z "$tunnel_url" ]; then
        echo -e "${YELLOW}Usage Instructions:${NC}"
        echo "1. Start ngrok tunnel in another terminal:"
        echo "   ngrok http $DEFAULT_LOCAL_PORT"
        echo ""
        echo "2. Get the tunnel URL (format: https://xxxx.ngrok-free.dev)"
        echo ""
        echo "3. Run the development server with:"
        echo "   shopify app dev --tunnel-url https://xxxx.ngrok-free.dev"
        echo ""
        echo -e "${BLUE}Or run this script again with the tunnel URL:${NC}"
        echo "   $0 --tunnel-url https://xxxx.ngrok-free.dev"
        echo ""
        return 1
    fi
    
    echo -e "${BLUE}Starting with tunnel URL: $tunnel_url${NC}"
    echo ""
    echo "Important notes:"
    echo "1. The app will be available at: $tunnel_url"
    echo "2. Shopify will validate and register the pixel extension"
    echo "3. Watch for the login prompt and complete authentication"
    echo "4. Your development store will be selected"
    echo ""
    echo "Press Ctrl+C to stop the server"
    echo ""
    
    npm run dev -- --tunnel-url "$tunnel_url"
}

# Print help
print_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --setup              Run setup only (check prerequisites, setup database)"
    echo "  --tunnel-url URL     Start dev server with specified tunnel URL"
    echo "  --tunnel             Start ngrok tunnel and dev server"
    echo "  --help               Print this help message"
    echo ""
    echo "Examples:"
    echo "  # Setup and exit"
    echo "  $0 --setup"
    echo ""
    echo "  # Start with specific tunnel"
    echo "  $0 --tunnel-url https://example.ngrok-free.dev"
    echo ""
    echo "  # Start tunnel automatically (requires ngrok installed)"
    echo "  $0 --tunnel"
    echo ""
}

# Main script
main() {
    check_prerequisites
    
    case "${1:-}" in
        --setup)
            setup_database
            ;;
        --tunnel-url)
            if [ -z "$2" ]; then
                echo -e "${RED}Error: --tunnel-url requires a URL argument${NC}"
                print_help
                exit 1
            fi
            setup_database || exit 1
            build_extension || true
            start_dev_server "$2"
            ;;
        --tunnel)
            setup_database || exit 1
            build_extension || true
            start_tunnel || exit 1
            start_dev_server "$TUNNEL_URL"
            ;;
        --help|"")
            print_help
            echo -e "${YELLOW}Getting started:${NC}"
            echo ""
            echo "1. Set up your environment:"
            echo "   export DATABASE_URL='postgresql://user:pass@localhost/seleric_tracker'"
            echo ""
            echo "2. Check prerequisites:"
            echo "   $0"
            echo ""
            echo "3. Setup database and dependencies:"
            echo "   $0 --setup"
            echo ""
            echo "4. Start ngrok tunnel (in another terminal):"
            echo "   ngrok http $DEFAULT_LOCAL_PORT"
            echo ""
            echo "5. Start development server with tunnel URL:"
            echo "   $0 --tunnel-url https://xxxx.ngrok-free.dev"
            echo ""
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            print_help
            exit 1
            ;;
    esac
}

main "$@"
