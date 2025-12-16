import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient();

  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return response.data[0].embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const client = getOpenAIClient();

  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });

  return response.data.map((item) => item.embedding);
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

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
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
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  try {
    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    return {
      interests: parsed.interests || [],
      niche: parsed.niche || "Unknown",
    };
  } catch {
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
- Saran konten berdasarkan data

KEMAMPUAN KAMU:
1. Menjawab pertanyaan tentang mayoritas minat/niche followers
2. Memberikan persentase dan distribusi data
3. Menyarankan konten berdasarkan analisis audience
4. Mencari profile dengan karakteristik tertentu
5. Memberikan insight dan rekomendasi strategis

PANDUAN MENJAWAB:
- Gunakan data dari context untuk memberikan jawaban yang akurat
- Sertakan angka dan persentase jika relevan
- Berikan insight yang actionable
- Jawab dalam bahasa yang sama dengan pertanyaan user
- Jika user bertanya dalam Bahasa Indonesia, jawab dalam Bahasa Indonesia
- Format jawaban dengan rapi menggunakan bullet points atau numbering jika perlu
- Jika data tidak tersedia, jelaskan dengan sopan

DATA CONTEXT:
${context}

Jawab pertanyaan user berdasarkan data di atas dengan informatif dan helpful.`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: systemMessage }, ...messages],
    temperature: 0.7,
    max_tokens: 2000,
  });

  return (
    response.choices[0]?.message?.content ||
    "Maaf, saya tidak dapat menghasilkan respons. Silakan coba lagi."
  );
}

export default getOpenAIClient;
