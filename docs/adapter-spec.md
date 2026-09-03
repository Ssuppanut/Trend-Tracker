# Adapter Spec: Trend Tracker Ingestion Layer
เวอร์ชัน 0.1 | กรกฎาคม 2026
ใช้เป็น task brief สำหรับ Claude Code ได้โดยตรง เขียน adapter ทีละตัวตามลำดับ priority

---

## 0. Interface กลาง (ทุก adapter ต้องทำตาม)

```ts
// lib/sources/base.ts

export interface RawItem {
  source: string            // slug ของ adapter เช่น 'reddit'
  externalId: string        // unique ภายใน source
  title: string
  url: string | null
  body: string | null       // ตัดที่ 2,000 chars
  lang: 'th' | 'en'
  categoryHint: string | null   // slug จาก categories table
  engagement: number        // ค่า normalize แล้ว (ดูข้อ 1)
  engagementRaw: Record<string, number>  // ค่าดิบ
  publishedAt: string       // ISO 8601
}

export interface SourceAdapter {
  name: string
  schedule: string          // cron expression เอกสารกำกับ ไม่ใช่ runtime
  fetch(): Promise<RawItem[]>
}
```

**กติการ่วมทุก adapter:**
- fetch() ต้องไม่ throw ถ้าพัง ให้ log แล้ว return `[]` (source เดียวพังทั้งระบบต้องไม่ล้ม)
- Timeout ต่อ request: 15 วินาที, retry 1 ครั้งแบบ exponential backoff
- User-Agent ระบุชื่อแอปจริง เช่น `TrendTracker/0.1 (personal project)`
- ทุก adapter มีไฟล์ test fixture (ตัวอย่าง response จริง) สำหรับ unit test การ map field

---

## 1. Engagement Normalization (สำคัญที่สุดในเอกสารนี้)

ปัญหา: upvote 500 ของ Reddit ไม่เท่ากับ 500 views ของ YouTube สเกลต่างกันหลายพันเท่า

**วิธี:** normalize เป็น percentile ภายใน source ของรอบ fetch นั้น

```
1. คำนวณ raw_score ต่อ item ตามสูตรของแต่ละ source (ดูตารางล่าง)
2. engagement = percentile_rank(raw_score, ในกลุ่ม items รอบเดียวกัน) * 100
   ผลลัพธ์: ทุก source ให้ค่า 0-100 เทียบกันได้
```

| Source | raw_score |
|---|---|
| Reddit | `upvotes + (comments * 2)` |
| Hacker News | `points + (comments * 2)` |
| YouTube | `log10(views + 1) * 10 + (likes / max(views,1)) * 100` |
| TikTok CC | ใช้ rank ที่ platform ให้มา (invert: rank 1 = สูงสุด) |
| Pantip | `replies * 3 + votes` |
| RSS | ไม่มี engagement ให้ตั้ง 50 คงที่ (น้ำหนักไปอยู่ที่ source_diversity แทน) |
| Google Trends | ใช้ scaled interest ที่ API ให้มาตรงๆ |

เก็บค่าดิบทั้งหมดใน `engagementRaw` เสมอ เผื่อเปลี่ยนสูตรทีหลังจะ backfill ได้

---

## 2. Reddit (priority 1 ทำก่อน)

| หัวข้อ | รายละเอียด |
|---|---|
| Auth | OAuth2 script app (client id + secret) สมัครที่ reddit.com/prefs/apps |
| Tier | Free: 100 queries/นาที เหลือเฟือ |
| Endpoints | `GET /r/{subreddit}/rising?limit=50` และ `/r/{subreddit}/hot?limit=25` |
| Subreddits เริ่มต้น | all, technology, artificial, CryptoCurrency, design, webdev, Thailand |
| ความถี่ | ทุก 2 ชม. |
| externalId | fullname ของโพสต์ (`t3_xxxxx`) |
| lang | 'en' ยกเว้น r/Thailand ให้ detect (โพสต์อังกฤษเยอะ) |
| categoryHint | map จาก subreddit: CryptoCurrency→crypto, technology/artificial→tech-ai, design/webdev→design, อื่นๆ→null |
| ข้อควรระวัง | ส่ง User-Agent เสมอไม่งั้นโดน 429, ข้าม stickied posts, ข้าม NSFW |

## 3. Hacker News (priority 1 ง่ายสุด เริ่มพร้อม Reddit)

| หัวข้อ | รายละเอียด |
|---|---|
| Auth | ไม่ต้อง |
| Endpoints | Firebase API: `topstories.json` (เอา 100 แรก) + `item/{id}.json` หรือใช้ Algolia HN API `search_by_date?tags=front_page` จะได้ครบใน call เดียว (แนะนำ Algolia) |
| ความถี่ | ทุก 2 ชม. |
| externalId | HN item id |
| lang | 'en' คงที่ |
| categoryHint | 'tech-ai' คงที่ |
| ข้อควรระวัง | บาง item ไม่มี url (Ask HN) ให้ url = ลิงก์ HN แทน |

## 4. YouTube Data API (priority 2)

| หัวข้อ | รายละเอียด |
|---|---|
| Auth | API key ธรรมดา (ไม่ต้อง OAuth เพราะอ่าน public) |
| Quota | 10,000 units/วัน **ห้ามใช้ search.list** (100 units + แยก bucket ~100 calls/วันตั้งแต่ มิ.ย. 2026) |
| Endpoint | `videos.list?chart=mostPopular` (1 unit) เรียกแยก `regionCode=TH` และ `regionCode=US`, `maxResults=50`, วนทีละ `videoCategoryId` ที่สนใจ |
| Budget | ~20 calls/รอบ x 12 รอบ/วัน = 240 units/วัน (ใช้แค่ 2.4% ของ quota) |
| ความถี่ | ทุก 2 ชม. |
| externalId | video id |
| lang | TH region → 'th', US region → 'en' (หยาบแต่พอ Phase 1) |
| categoryHint | map จาก videoCategoryId: 28(Sci-Tech)→tech-ai, 24(Entertainment)→entertainment, 26(HowTo/Style)→lifestyle, 25(News)→news |
| engagementRaw | viewCount, likeCount, commentCount |

## 5. TikTok Creative Center (priority 2)

| หัวข้อ | รายละเอียด |
|---|---|
| วิธีเข้าถึง | ไม่มี official API สำหรับ trend ให้ scrape หน้า Creative Center trending hashtags (ads.tiktok.com/business/creativecenter) เลือก region TH และ US |
| เทคนิค | หน้าเว็บโหลดข้อมูลผ่าน internal JSON endpoint ให้ดูจาก network tab แล้วเรียกตรง ถ้าโครงสร้างเปลี่ยนให้ fallback เป็น Playwright |
| ความถี่ | วันละ 2 รอบ (trend hashtag ไม่เปลี่ยนรายชั่วโมง) |
| externalId | `{hashtag}-{region}-{date}` |
| title | ชื่อ hashtag |
| lang | ตาม region |
| categoryHint | Creative Center มี industry category ให้ map เท่าที่ได้ |
| ข้อควรระวัง | เปราะที่สุดในบรรดา adapter ทั้งหมด ต้องมี alert เมื่อ return ว่างติดกัน 3 รอบ |

## 6. Pantip (priority 2)

| หัวข้อ | รายละเอียด |
|---|---|
| วิธีเข้าถึง | ไม่มี official API ให้ดึงหน้า trend/realtime ของ Pantip ซึ่งมี internal JSON endpoint เช่นกัน (ตรวจจาก network tab) |
| ขอบเขต | เอาเฉพาะ trending topics ห้าม crawl ทั้ง forum เคารพ robots.txt, request ห่างกันอย่างน้อย 5 วินาที |
| ความถี่ | ทุก 3 ชม. |
| externalId | topic id |
| lang | 'th' คงที่ |
| categoryHint | map จาก tag ห้อง: สินธร→crypto (บางส่วน)/finance, ซิลิคอนวัลเลย์→tech-ai, เฉลิมไทย/บางรัก→entertainment, อื่นๆ→null |
| ข้อควรระวัง | ประเด็นดราม่า/การเมืองเยอะ Phase 1 เก็บหมดแล้วให้ LLM จัดหมวด news |

## 7. RSS News (priority 1 ง่าย ทำพร้อมชุดแรกได้)

| หัวข้อ | รายละเอียด |
|---|---|
| Feeds ไทย | ไทยรัฐ, มติชน, The Standard, Blognone, Brand Inside (เช็ค feed URL ตอน implement) |
| Feeds อังกฤษ | TechCrunch, The Verge, CoinDesk, Google News RSS (topic feeds) |
| Lib | `rss-parser` (npm) |
| ความถี่ | ทุก 1 ชม. |
| externalId | `guid` ของ item, ถ้าไม่มีใช้ hash ของ url |
| lang | ตาม feed |
| categoryHint | ตาม feed: Blognone→tech-ai, CoinDesk→crypto, ข่าวทั่วไป→news |
| engagement | 50 คงที่ (ดูข้อ 1) |

## 8. Google Trends (priority 3 รอ alpha access)

| หัวข้อ | รายละเอียด |
|---|---|
| Plan A | Official API alpha (สมัครแล้วรอ) |
| Plan B ระหว่างรอ | Apify Google Trends scraper (free tier) ดึง daily trending searches ของ TH และ US วันละ 2 รอบ |
| บทบาทในระบบ | ต่างจาก source อื่น: ใช้เป็น (ก) รายการ trending searches เข้า pipeline ปกติ และ (ข) validation ว่า trend ที่ cluster เจอมี search interest จริงมั้ย (Phase 2) |
| externalId | `{query}-{region}-{date}` |
| ข้อควรระวัง | ห้ามให้ระบบพึ่ง source นี้เป็นหลัก ออกแบบให้ถอดออกได้ |

---

## 9. ลำดับการ implement

```
Sprint 1: base.ts + Reddit + Hacker News + RSS   ← ครอบคลุม en เกือบหมด
Sprint 2: YouTube + Pantip                        ← เพิ่มฝั่ง th
Sprint 3: TikTok CC + Google Trends (Apify)       ← ตัวที่เปราะ ทำท้ายสุด
```

แต่ละ sprint จบด้วย: รัน ingest จริง 24 ชม. แล้วเปิดดูข้อมูลใน Supabase ว่า field ครบ, dedupe ทำงาน, engagement กระจาย 0-100 จริง ก่อนเริ่ม sprint ถัดไป

---

## 10. Definition of Done ต่อ adapter

- [ ] Implement `SourceAdapter` interface
- [ ] Unit test ด้วย fixture จริง (map field ถูก, กรอง item เสียออก)
- [ ] Insert ผ่าน upsert `on conflict (source, external_id) do nothing`
- [ ] Log จำนวน fetched/inserted/skipped ต่อรอบ
- [ ] พังแล้ว return [] ไม่ throw + log error
- [ ] ตั้งค่าใน cron config พร้อม schedule ตาม spec
