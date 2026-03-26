Hellochippy: AI-Powered Front Desk MVP

Agent X is a sophisticated command center for managing autonomous AI booking agents. Built for service-based businesses, it leverages Gemini 3 models to scan websites, learn business rules, and interact with customers via a customizable chat widget.

## Features
- **Discovery Engine**: Instant scanning of business URLs to build a Knowledge Base.
- **Widget Studio**: Visual customizer for the customer-facing AI chat agent.
- **Review Queue**: Human-in-the-loop training interface (RLHF).
- **Inbox**: Full conversation management and lead tracking.
- **Integrations**: Real-time Google Calendar handshake for automated bookings.

## Tech Stack
- **Frontend**: React 19, Tailwind CSS, Lucide Icons.
- **AI**: Google Gemini API (@google/genai).
- **Backend/Storage**: Supabase (Auth, DB, Storage).
- **Analytics**: Recharts.

## Getting Started

### 1. Prerequisites
- Node.js (v18+)
- Supabase Project (URL & Anon Key)
- Gemini API Key

### 2. Environment Setup
Create a `.env` file in the root with:
```env
API_KEY=your_gemini_key
GOOGLE_CLIENT_ID=your_gcp_client_id
GOOGLE_API_KEY=your_google_maps_key
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
```

### 3. Installation
```bash
npm install
npm run dev
```

## Git Setup
To push this code to your repository:
```bash
git init
git add .
git commit -m "Initial commit of Agent X MVP"
git remote add origin <your-repo-url>
git push -u origin main
```
