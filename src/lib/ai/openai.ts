import OpenAI from "openai";

// Re-export embedding functions from local embeddings module
export { generateEmbedding, generateEmbeddings } from "./localEmbeddings";

let aiClient: OpenAI | null = null;

// Model configuration
const DEFAULT_MODEL = "gemini-3-flash-preview";
const FALLBACK_MODEL = "gemini-1.5-flash";

// Gemini OpenAI-compatible endpoint
const GEMINI_OPENAI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";

function getApiKey(): string {
  // Prefer Gemini key; allow OpenRouter key as a transitional fallback
  return process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY || "";
}

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 5000; // 5 seconds

function getModel(): string {
  return process.env.GEMINI_MODEL || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

function getFallbackModel(): string {
  return (
    process.env.GEMINI_FALLBACK_MODEL ||
    process.env.OPENROUTER_FALLBACK_MODEL ||
    FALLBACK_MODEL
  );
}

export function getOpenAIClient(): OpenAI {
  if (!aiClient) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY environment variable is not set (or OPENROUTER_API_KEY as fallback)"
      );
    }
    aiClient = new OpenAI({
      apiKey,
      baseURL: GEMINI_OPENAI_BASE_URL,
    });
  }
  return aiClient;
}

/**
 * Check if an error is a rate limit error (HTTP 429)
 */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    return error.status === 429;
  }
  return false;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Clean and parse JSON from model response
 * Handles cases where JSON might be wrapped in markdown code blocks
 */
function parseJSONResponse(content: string): Record<string, unknown> {
  if (!content || content.trim() === "") {
    return {};
  }

  let cleaned = content.trim();

  // Remove markdown code blocks (```json ... ``` or ``` ... ```)
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/gm, "");
  cleaned = cleaned.replace(/\n?```\s*$/gm, "");

  // Try to extract JSON object if there's extra text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("[parseJSONResponse] Failed to parse JSON:", cleaned);
    throw error;
  }
}

/**
 * Execute a function with exponential backoff retry and fallback model support
 */
async function withRetryAndFallback<T>(
  fn: (model: string) => Promise<T>,
  context: string = "API call"
): Promise<T> {
  const primaryModel = getModel();
  const fallbackModel = getFallbackModel();
  
  let lastError: unknown;
  
  // Try with primary model first
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn(primaryModel);
    } catch (error) {
      lastError = error;
      
      if (isRateLimitError(error)) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[${context}] Rate limited on ${primaryModel}, attempt ${attempt + 1}/${MAX_RETRIES}. Retrying in ${delay}ms...`
        );
        await sleep(delay);
      } else {
        // Non-rate-limit error, don't retry
        throw error;
      }
    }
  }
  
  // Primary model exhausted retries, try fallback model
  console.warn(
    `[${context}] Primary model ${primaryModel} rate limited after ${MAX_RETRIES} retries. Switching to fallback: ${fallbackModel}`
  );
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn(fallbackModel);
    } catch (error) {
      lastError = error;
      
      if (isRateLimitError(error)) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[${context}] Rate limited on fallback ${fallbackModel}, attempt ${attempt + 1}/${MAX_RETRIES}. Retrying in ${delay}ms...`
        );
        await sleep(delay);
      } else {
        // Non-rate-limit error, don't retry
        throw error;
      }
    }
  }
  
  // Both models exhausted retries
  console.error(
    `[${context}] All retries exhausted for both primary and fallback models`
  );
  throw lastError;
}

export async function analyzeInterests(
  bio: string,
  captions: string[]
): Promise<{
  interests: string[];
  niche: string;
}> {
  const client = getOpenAIClient();
  const captionsText = captions.slice(0, 10).join("\n---\n");

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are an expert at analyzing Instagram profiles to determine user interests and niche.
Analyze the provided bio and post captions to identify:
1. A list of specific interests (e.g., "fitness", "photography", "travel", "fashion")
2. The primary niche or category this account belongs to

Respond in JSON format:
{
  "interests": ["interest1", "interest2", ...],
  "niche": "primary niche"
}

Keep interests specific and relevant. The niche should be a single category like "Fitness & Health", "Fashion & Beauty", "Technology", "Food & Cooking", "Travel", "Business & Entrepreneurship", etc.`,
    },
    {
      role: "user",
      content: `Bio: ${bio || "No bio available"}\n\nPost Captions:\n${
        captionsText || "No captions available"
      }`,
    },
  ];

  try {
    const response = await withRetryAndFallback(
      async (model) =>
        client.chat.completions.create({
          model,
          messages,
          response_format: { type: "json_object" },
          temperature: 0.3,
        }),
      "analyzeInterests"
    );

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = parseJSONResponse(content);
    return {
      interests: Array.isArray(parsed.interests) ? parsed.interests : [],
      niche: typeof parsed.niche === "string" ? parsed.niche : "Unknown",
    };
  } catch (error) {
    console.error("[analyzeInterests] Failed after all retries:", error);
    return {
      interests: [],
      niche: "Unknown",
    };
  }
}

export async function chatWithContext(
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  context: string
): Promise<string> {
  const client = getOpenAIClient();

  const systemMessage = `Kamu adalah AI assistant yang ahli dalam menganalisis data followers Instagram. Kamu memiliki akses ke database lengkap berisi profile Instagram yang sudah di-scrape, termasuk:

- Statistik lengkap (distribusi niche, distribusi minat/interest, dll)
- Data followers individual (bio, jumlah followers, niche, interests)
- Daftar followers dan following dari setiap akun
- Saran konten berdasarkan data

KEMAMPUAN KAMU:
1. Menjawab pertanyaan tentang mayoritas minat/niche followers
2. Memberikan persentase dan distribusi data
3. Menyarankan konten berdasarkan analisis audience
4. Mencari profile dengan karakteristik tertentu
5. Memberikan insight dan rekomendasi strategis

KEMAMPUAN FOLLOWERS/FOLLOWING:
6. Menampilkan daftar followers dari akun X (100 per halaman, bisa pagination)
7. Menampilkan daftar following dari akun X (100 per halaman, bisa pagination)
8. Menganalisis niche apa yang disukai/difollow oleh akun X
9. Menganalisis niche apa yang paling banyak difollow oleh followers dari akun X (analisis agregat)
10. Memberikan rekomendasi konten berdasarkan pola following audience

Contoh pertanyaan yang bisa dijawab:
- "Following akun wahy.all siapa saja?"
- "Akun wahy.all suka follow akun dengan niche apa?"
- "Followers dari akun ynsurabaya kebanyakan mem-follow akun dengan niche apa?"
- "Lanjutkan daftar following wahy.all halaman 2"

PANDUAN MENJAWAB:
- Gunakan data dari context untuk memberikan jawaban yang akurat
- Sertakan angka dan persentase jika relevan
- Berikan insight yang actionable
- Jawab dalam bahasa yang sama dengan pertanyaan user
- Jika user bertanya dalam Bahasa Indonesia, jawab dalam Bahasa Indonesia
- Format jawaban dengan rapi menggunakan bullet points atau numbering jika perlu
- Jika data tidak tersedia, jelaskan dengan sopan
- Untuk daftar panjang, informasikan tentang pagination

DATA CONTEXT:
${context}

Jawab pertanyaan user berdasarkan data di atas dengan informatif dan helpful.`;

  const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemMessage },
    ...messages,
  ];

  try {
    const response = await withRetryAndFallback(
      async (model) =>
        client.chat.completions.create({
          model,
          messages: chatMessages,
          temperature: 0.7,
          max_tokens: 2000,
        }),
      "chatWithContext"
    );

    return (
      response.choices[0]?.message?.content ||
      "Maaf, saya tidak dapat menghasilkan respons. Silakan coba lagi."
    );
  } catch (error) {
    console.error("[chatWithContext] Failed after all retries:", error);
    return "Maaf, layanan sedang sibuk. Silakan coba lagi dalam beberapa saat.";
  }
}

export default getOpenAIClient;
