# Implementasi Fitur Followers/Following Query untuk RAG Chatbot

## Analisis Masalah

Data followers/following sudah tersimpan di MongoDB di field `followers` dan `following` pada Profile model. Namun, fungsi `buildContextFromProfiles()` di [`src/lib/ai/rag.ts`](src/lib/ai/rag.ts) hanya mengirim `followersCount` dan `followingCount` (angka), bukan daftar username-nya.

**Fitur yang Dibutuhkan:**

1. "following akun wahy.all siapa saja?" - Menampilkan daftar akun yang difollow
2. "akun wahy.all suka follow akun dengan niche apa?" - Analisis distribusi niche dari akun yang difollow
3. "followers dari akun ynsurabaya kebanyakan mem-follow akun dengan niche apa?" - Analisis agregat niche yang difollow oleh semua followers

## Strategi: Tanpa Limit Input Data

### Dua Jenis Query dengan Pendekatan Berbeda

| Jenis Query | Contoh | Pendekatan |

|-------------|--------|------------|

| **Listing** | "following X siapa saja?" | Paginated: 100 per halaman |

| **Analitik** | "niche apa yang difollow?" | MongoDB Aggregation: tanpa limit |

**Prinsip:**

- Data input: **TIDAK ADA LIMIT** - bisa ribuan followers/following
- Yang di-limit hanya **OUTPUT ke LLM** (hasil agregasi, bukan raw data)
- Untuk listing: pagination agar user bisa explore semua data

## Solusi

### 1. Update `buildContextFromProfiles()` untuk menyertakan sample followers/following

Untuk context umum, tampilkan sample 20 akun + total count:

```typescript
const followersList = fullProfile.followers || [];
const followingList = fullProfile.following || [];
`Followers: ${followersList.length} akun${followersList.length > 0 ? ` (sample: ${followersList.slice(0, 20).join(", ")}${followersList.length > 20 ? "..." : ""})` : ""}`,
`Following: ${followingList.length} akun${followingList.length > 0 ? ` (sample: ${followingList.slice(0, 20).join(", ")}${followingList.length > 20 ? "..." : ""})` : ""}`,
```

### 2. Tambah fungsi `getRelationshipContext()` dengan Pagination

```typescript
async function getRelationshipContext(
  username: string,
  type: 'followers' | 'following',
  sessionId: string,
  page: number = 1,
  pageSize: number = 100
): Promise<{
  username: string;
  type: string;
  total: number;
  page: number;
  totalPages: number;
  accounts: string[];
  hasMore: boolean;
}>
```

**Contoh Output untuk Context:**

```
=== DAFTAR FOLLOWING @wahy.all ===
Total: 523 akun
Halaman: 1 dari 6 (100 akun per halaman)

Following (1-100):
@account1, @account2, @account3, ... @account100

[Untuk melihat halaman berikutnya, tanyakan "lanjutkan daftar following wahy.all"]
```

### 3. Tambah fungsi `getFollowingNicheAnalysis()` dengan MongoDB Aggregation

```typescript
async function getFollowingNicheAnalysis(
  username: string, 
  sessionId: string
): Promise<{
  username: string;
  totalFollowing: number;      // Total dari field following (bisa ribuan)
  analyzedCount: number;       // Yang ditemukan di database
  nicheDistribution: Array<{ 
    niche: string; 
    count: number; 
    percentage: number; 
    sampleAccounts: string[];  // 5 sample per niche
  }>;
  interestDistribution: Array<{ 
    interest: string; 
    count: number; 
    percentage: number;
  }>;
}>
```

**MongoDB Aggregation Pipeline (tanpa limit input):**

```javascript
// 1. Ambil semua following usernames dari profile
// 2. $lookup ke Profile collection untuk dapat niche
// 3. $group by niche untuk hitung distribusi
// 4. Output: hanya statistik, bukan raw data
```

**Contoh Output untuk Context:**

```
=== ANALISIS NICHE FOLLOWING @wahy.all ===
Total Following: 523 akun
Ditemukan di Database: 312 akun (59.7%)

--- DISTRIBUSI NICHE YANG DIFOLLOW ---
1. Fashion & Beauty: 89 akun (28.5%) - @fashionA, @beautyB, @styleC, @model1, @makeup2
2. Entertainment: 67 akun (21.5%) - @celeb1, @actor2, @singer3, @comedian4, @dancer5
3. Technology: 52 akun (16.7%) - @tech1, @gadget2, @startup3, @developer4, @ai_news
4. Food & Cooking: 41 akun (13.1%) - @chef1, @foodie2, @recipe3, @restaurant4, @baking5
5. Travel: 33 akun (10.6%) - @travel1, @wanderlust2, @explore3, @adventure4, @nomad5
... (semua niche ditampilkan)

--- TOP 10 INTERESTS ---
1. fashion: 145 mentions (46.5%)
2. photography: 98 mentions (31.4%)
... 
```

### 4. Tambah fungsi `getFollowersFollowingNicheAnalysis()` dengan MongoDB Aggregation

```typescript
async function getFollowersFollowingNicheAnalysis(
  entryUsername: string,
  sessionId: string
): Promise<{
  entryUsername: string;
  totalFollowers: number;           // Bisa ribuan
  followersAnalyzed: number;        // Yang punya data following
  aggregateStats: {
    totalUniqueFollowed: number;    // Unique akun yang difollow oleh semua followers
    foundInDatabase: number;
    nicheDistribution: Array<{ 
      niche: string; 
      count: number;                // Berapa kali difollow (bukan unique accounts)
      uniqueAccounts: number;       // Unique accounts dalam niche ini
      percentage: number; 
      topAccounts: string[];        // 5 paling sering difollow per niche
    }>;
    interestDistribution: Array<{
      interest: string;
      count: number;
      percentage: number;
    }>;
  };
}>
```

**Flow dengan MongoDB Aggregation:**

```javascript
// Pipeline 1: Ambil semua followers dari entry account
db.profiles.aggregate([
  { $match: { parentUsername: entryUsername, sessionId } },
  { $project: { username: 1, following: 1 } }
])

// Pipeline 2: Untuk setiap follower, lookup following mereka
// dan aggregate niche distribution
db.profiles.aggregate([
  { $match: { parentUsername: entryUsername } },
  { $unwind: "$following" },
  { $group: { 
      _id: "$following", 
      followedByCount: { $sum: 1 }  // Berapa followers yang follow akun ini
  }},
  { $lookup: {
      from: "profiles",
      localField: "_id",
      foreignField: "username",
      as: "profileData"
  }},
  { $unwind: "$profileData" },
  { $group: {
      _id: "$profileData.niche",
      count: { $sum: "$followedByCount" },
      uniqueAccounts: { $sum: 1 },
      accounts: { $push: { username: "$_id", count: "$followedByCount" } }
  }},
  { $sort: { count: -1 } }
])
```

**Contoh Output untuk Context:**

```
=== ANALISIS AGREGAT: APA YANG DIFOLLOW OLEH FOLLOWERS @ynsurabaya ===

Entry Account: @ynsurabaya
Total Followers: 2,847 akun
Followers dengan Data Following: 1,523 akun (53.5%)

--- RINGKASAN ---
Total Unique Akun yang Difollow: 15,234 akun
Ditemukan di Database: 4,521 akun (29.7%)

--- DISTRIBUSI NICHE YANG PALING BANYAK DIFOLLOW ---
1. Fashion & Beauty: 1,234 follows dari 312 unique akun (27.3%)
   Top: @fashionbrand (followed by 423), @beautyinfluencer (389), @styleicon (356)...
2. Entertainment: 987 follows dari 245 unique akun (21.8%)
   Top: @celebrity1 (followed by 512), @musicartist (398), @comedian (287)...
3. Technology: 756 follows dari 198 unique akun (16.7%)
   Top: @techreview (followed by 234), @gadgetnews (198), @startup (167)...

--- INSIGHT ---
Followers @ynsurabaya paling banyak mem-follow akun dengan niche:
1. Fashion & Beauty (27.3%) - menunjukkan interest tinggi di fashion
2. Entertainment (21.8%) - suka konten hiburan
3. Technology (16.7%) - tertarik dengan teknologi

Rekomendasi: Konten yang menggabungkan fashion + entertainment akan sangat relevan.
```

### 5. Update `chat()` function

```typescript
export async function chat(messages, sessionId): Promise<ChatResponse> {
  const lastMessage = messages[messages.length - 1].content;
  
  // Deteksi jenis query dan extract username
  const queryInfo = detectQueryType(lastMessage);
  
  let additionalContext = "";
  
  switch (queryInfo.type) {
    case 'list_followers':
    case 'list_following':
      additionalContext = await getRelationshipContext(
        queryInfo.username, 
        queryInfo.type === 'list_followers' ? 'followers' : 'following',
        sessionId,
        queryInfo.page || 1
      );
      break;
      
    case 'following_niche':
      additionalContext = await getFollowingNicheAnalysis(queryInfo.username, sessionId);
      break;
      
    case 'followers_following_niche':
      additionalContext = await getFollowersFollowingNicheAnalysis(queryInfo.username, sessionId);
      break;
  }
  
  // Build full context with stats + additional context
  const context = await buildComprehensiveContext(sessionId, relevantProfiles);
  const fullContext = context + "\n\n" + additionalContext;
  
  return chatWithContext(messages, fullContext);
}
```

### 6. Update system prompt di `openai.ts`

Tambahkan informasi bahwa AI dapat menjawab:

- **Listing (paginated):**
  - Siapa saja followers dari akun X (100 per halaman)
  - Siapa saja yang difollow oleh akun X (100 per halaman)

- **Analisis Single Account:**
  - Niche apa yang disukai/difollow oleh akun X
  - Minat apa yang paling banyak dari akun yang difollow X

- **Analisis Agregat (untuk ribuan followers):**
  - Niche apa yang paling banyak difollow oleh followers dari akun X
  - Pola following dari audience suatu akun
  - Rekomendasi konten berdasarkan pola following audience

## Files yang perlu diubah

| File | Perubahan |

|------|-----------|

| [`src/lib/ai/rag.ts`](src/lib/ai/rag.ts) | Update buildContextFromProfiles(), tambah getRelationshipContext() dengan pagination, tambah getFollowingNicheAnalysis() dengan MongoDB aggregation, tambah getFollowersFollowingNicheAnalysis() dengan MongoDB aggregation, update chat() dengan query detection |

| [`src/lib/ai/openai.ts`](src/lib/ai/openai.ts) | Update system prompt untuk mencakup semua kemampuan baru |

## Keunggulan Pendekatan Ini

1. **Tanpa Limit Input**: Bisa analisis ribuan followers/following
2. **Performa Optimal**: Aggregation dilakukan di MongoDB, bukan di Node.js
3. **Context Efisien**: Hanya hasil agregasi yang dikirim ke LLM
4. **Pagination untuk Listing**: User bisa explore semua data tanpa overload
5. **Transparansi**: Selalu tampilkan berapa % data yang dianalisis

## Pertimbangan

- Untuk listing: 100 akun per halaman, user bisa minta halaman berikutnya
- Untuk analisis: tampilkan 5 sample akun per niche
- Selalu tampilkan total vs analyzed count untuk transparansi
- Handle case dimana akun belum ada di database
- Index MongoDB yang diperlukan: `{ following: 1 }`, `{ parentUsername: 1, sessionId: 1 }`