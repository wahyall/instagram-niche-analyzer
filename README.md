# Instagram Scraper RAG

Web app untuk scrape followers dan following dari akun Instagram, menganalisis minat dan niche dari followers, dan mengintegrasikan dengan chatbot RAG untuk tanya jawab data.

## Features

- 🔐 Login Instagram dengan dukungan 2FA
- 👥 Scrape followers dan following dengan chaining (depth control)
- 📸 Scrape posts dan reels
- 🤖 AI-powered analysis untuk interests dan niche detection
- 💬 RAG Chatbot untuk Q&A tentang data followers
- 📊 Dashboard dengan statistik dan monitoring jobs
- 🔍 Search dan filter profiles

## Tech Stack

- **Frontend**: Next.js 14 (App Router), Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes, BullMQ
- **Scraping**: Playwright
- **Queue/Cache**: Redis
- **Database**: MongoDB (Mongoose)
- **Vector DB**: Qdrant (self-hosted, open-source)
- **AI/LLM**: Google Gemini (via OpenAI-compatible API) + @xenova/transformers for local embeddings

## Prerequisites

- Node.js 20+
- Docker (untuk Redis, MongoDB, dan Qdrant)
- Gemini API key dari Google AI Studio (buat di https://aistudio.google.com/apikey)
- Akun Instagram untuk scraping

## Setup

### 1. Clone dan Install Dependencies

```bash
npm install
```

### 2. Setup Environment Variables

Buat file `.env.local` di root project:

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/instagram-scraper

# Redis
REDIS_URL=redis://localhost:6379

# Encryption (generate dengan: openssl rand -hex 32)
ENCRYPTION_KEY=your-32-byte-encryption-key-here

# Gemini (LLM API - get key at https://aistudio.google.com/apikey)
GEMINI_API_KEY=your-gemini-api-key-here
# Optional: Override default model (default: gemini-2.0-flash)
# GEMINI_MODEL=gemini-2.0-flash
# Optional: Fallback model when rate limited (default: gemini-1.5-flash)
# GEMINI_FALLBACK_MODEL=gemini-1.5-flash
#
# Backward compatibility (optional): OPENROUTER_* vars are still accepted as a fallback
# OPENROUTER_API_KEY=sk-or-your-openrouter-api-key-here
# OPENROUTER_MODEL=openai/gpt-4o-mini
# OPENROUTER_FALLBACK_MODEL=google/gemma-2-9b-it:free

# Qdrant (self-hosted via Docker)
QDRANT_URL=http://localhost:6333

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

You can also use [`env.example`](env.example) as a starting point.

### 3. Start Redis, MongoDB, dan Qdrant

```bash
npm run docker:up
```

Ini akan menjalankan:
- **MongoDB** di port `27017`
- **Redis** di port `6379`
- **Qdrant** di port `6333` (REST API) dan `6334` (gRPC)

Qdrant akan otomatis membuat collection saat pertama kali digunakan.

### 4. Install Playwright Browsers

```bash
npx playwright install chromium
```

## Running the Application

### Development Mode

Terminal 1 - Start Next.js:
```bash
npm run dev
```

Terminal 2 - Start Worker (untuk processing scrape jobs):
```bash
npm run worker
```

### Production Mode

```bash
npm run build
npm start
```

## Usage

1. Buka `http://localhost:3000`
2. Login dengan akun Instagram Anda
3. Di Dashboard, masukkan username Instagram yang ingin di-scrape sebagai entry point
4. Atur depth (kedalaman chaining) dan opsi scraping
5. Klik "Start Scraping"
6. Monitor progress di Jobs page
7. Browse profiles yang sudah di-scrape di Profiles page
8. Gunakan Chat untuk tanya jawab tentang data

## Depth Explanation

- **Depth 0**: Hanya scrape entry point profile
- **Depth 1**: Scrape entry point + semua followers entry point
- **Depth 2**: Scrape entry point + followers + followers dari followers
- **Depth 3**: Dan seterusnya...

⚠️ **Warning**: Depth yang lebih tinggi akan menghasilkan lebih banyak data dan memakan waktu lebih lama. Instagram juga memiliki rate limit, jadi gunakan dengan bijak.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Frontend                        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ Login   │ │Dashboard│ │Profiles │ │  Chat   │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Next.js API Routes                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │  Auth    │ │  Scrape  │ │   Jobs   │ │   Chat   │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│    BullMQ     │   │   MongoDB     │   │    Qdrant     │
│  Job Queue    │   │   Database    │   │  Vector DB    │
└───────────────┘   └───────────────┘   └───────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│                      Worker Process                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │  Playwright │  │ OpenRouter  │  │   Local     │           │
│  │   Scraper   │  │  Analysis   │  │  Embeddings │           │
│  └─────────────┘  └─────────────┘  └─────────────┘           │
└───────────────────────────────────────────────────────────────┘
```

## Important Notes

⚠️ **Rate Limiting**: Instagram memiliki rate limit yang ketat. App ini sudah mengimplementasikan delay antar request, tapi tetap gunakan dengan bijak.

⚠️ **Terms of Service**: Scraping Instagram melanggar Terms of Service mereka. Gunakan app ini hanya untuk keperluan pribadi/riset.

⚠️ **Account Safety**: Gunakan akun Instagram yang bukan akun utama Anda untuk scraping.

## License

MIT
