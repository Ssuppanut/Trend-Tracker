# เอกสารอ้างอิง: เว็บแอป Trend Tracking & Insight
อัปเดต: กรกฎาคม 2026 | เป้าหมาย: ใช้เอง + ต่อยอดเป็น SaaS | ตลาด: ไทย + Global | เลือกหมวดหมู่ได้

---

## 1. นิยามผลิตภัณฑ์

**สิ่งที่แอปทำ** รวบรวมสัญญาณจากหลายแหล่ง (search, social, community, news) มาตอบ 3 คำถาม:
- คนกำลัง **ค้นหา** อะไร (search intent)
- คนกำลัง **พูดถึง** อะไร (conversation volume)
- คนกำลัง **engage** กับอะไร (engagement velocity)

**จุดต่างจากเจ้าตลาด** เครื่องมือไทย (Zocial Eye, Mandala) เน้น brand monitoring สำหรับองค์กร ราคาเริ่ม 3,000-5,000 บาท/เดือน ส่วนเครื่องมือ trend discovery จริงๆ (Exploding Topics, Glimpse) เป็นภาษาอังกฤษล้วนและไม่เข้าใจบริบทไทย ช่องว่างคือ **trend discovery สองภาษา ราคาเข้าถึงได้ สำหรับ creator, นักการตลาดเดี่ยว, SME** ไม่ใช่ enterprise brand monitoring

---

## 2. Competitive Landscape

### ไทย
| เครื่องมือ | จุดเน้น | ราคา |
|---|---|---|
| Wisesight Zocial Eye | Brand monitoring องค์กรใหญ่ (FB, X, IG, Pantip, YouTube, TikTok, news) | Starter ~3,000 บาท/เดือน ผ่าน partner, enterprise ติดต่อฝ่ายขาย |
| Wisesight Trend | Trend แบบ realtime แยกตามอุตสาหกรรม | ฟรี (ใช้ศึกษาเป็น benchmark ได้ดี) |
| Mandala Analytics | Social listening สำหรับ SME ถึง enterprise | เริ่มหลักพันบาท/เดือน |
| DOM | Social listening ใช้ง่ายสำหรับ SME | เริ่ม ~5,000 บาท/เดือน |
| Zanroo | Monitoring แบบเดินไปข้างหน้า (ปักหมุด keyword) | Enterprise |

### Global
| เครื่องมือ | จุดเน้น | หมายเหตุ |
|---|---|---|
| Exploding Topics | ค้นหา trend ก่อนพีค | ตัวอย่าง positioning ที่ใกล้ไอเดียนี้ที่สุด |
| Glimpse | แปลง Google Trends เป็น search volume จริง | มี API ขายด้วย |
| Brand24 / Brandwatch | Social listening | ราคาสูง เน้น brand |
| BuzzSumo | Content engagement analysis | เน้น content marketer |

**บทเรียน** ไม่ต้องแข่งเรื่องความครบของแหล่งข้อมูล แข่งเรื่อง "สรุปให้เข้าใจง่าย + จับ trend ที่กำลังพุ่ง" แทน

---

## 3. แหล่งข้อมูล (สถานะกลางปี 2026)

### 3.1 Search Trends
| แหล่ง | สถานะ | ค่าใช้จ่าย | หมายเหตุ |
|---|---|---|---|
| **Google Trends API (official)** | Alpha, ต้องสมัครขอ access | ฟรีช่วง alpha | ข้อมูล 5 ปีย้อนหลัง, scaled สม่ำเสมอ (เทียบข้าม request ได้), แบ่ง geo ระดับ region ได้ ควรสมัครทันที |
| pytrends (unofficial) | ไม่เสถียร โดนบล็อกบ่อย ข้อมูลเพี้ยน | ฟรี | ใช้ prototype ได้ อย่าใช้ production |
| SerpApi Google Trends | เสถียร | $75/เดือน (5,000 searches) | ทางเลือกหลักถ้ายังไม่ได้ alpha access |
| Apify Google Trends scraper | เสถียรพอใช้ | pay-per-use, มี free tier | เหมาะช่วง MVP |
| Glimpse API | search volume จริง | ราคาสูง | ไว้ทีหลังถ้า SaaS โต |

### 3.2 Community / Discussion
| แหล่ง | สถานะ | ค่าใช้จ่าย | หมายเหตุ |
|---|---|---|---|
| **Reddit API** | ใช้ได้ | Free tier 100 queries/นาที, เชิงพาณิชย์ ~$0.24/1,000 calls (~$12k/ปี) | Free tier พอสำหรับใช้เอง+MVP, signal ดีมากสำหรับ trend global |
| **Hacker News API** | เปิดเต็มที่ | ฟรี ไม่จำกัด | ดีที่สุดสำหรับหมวด tech |
| **Pantip** | ไม่มี official API | ต้อง scrape เอง | แหล่ง signal ไทยที่สำคัญที่สุด ระวัง ToS, ควร scrape เบาๆ เฉพาะ trending topics |
| Bluesky | Firehose เปิดฟรี | ฟรี (rate cap 5,000 points/ชม.) | ข้อมูลเรียลไทม์ฟรีที่ดีที่สุดตอนนี้ แต่ user ไทยยังน้อย |

### 3.3 Video / Social
| แหล่ง | สถานะ | ค่าใช้จ่าย | หมายเหตุ |
|---|---|---|---|
| **YouTube Data API** | ใช้ได้ | ฟรี 10,000 units/วัน | search.list แพง (100 units) และตั้งแต่ มิ.ย. 2026 search แยก bucket ~100 calls/วัน ให้ใช้ videos.list (ถูก) + mostPopular chart + RSS ของ channel แทน search |
| **TikTok** | Official API ไม่มีข้อมูล trend | - | Research API จำกัดเฉพาะสถาบันวิชาการ US/EU ทางออก: scrape TikTok Creative Center (trending hashtags/songs รายประเทศ รวมไทย) หรือ 3rd party เช่น Netrows (~€49/เดือน) |
| X (Twitter) | แพงมาก | Free = write only, Basic $200/เดือน (อ่านได้ ~10-15k tweets), pay-per-use เริ่ม ก.พ. 2026 | ข้าม phase แรกไปก่อน ใช้ trending hashtag จากแหล่งอื่นแทน |
| Facebook / Instagram | CrowdTangle ปิดแล้ว, Content Library เฉพาะนักวิจัย | - | ตัดออกจาก scope |

### 3.4 News
| แหล่ง | สถานะ | ค่าใช้จ่าย |
|---|---|---|
| RSS feeds (ไทยรัฐ, มติชน, The Standard, Blognone ฯลฯ + global) | เสถียร | ฟรี |
| Google News RSS | เสถียร | ฟรี |
| NewsAPI / GNews | สะดวก | Free tier จำกัด, paid เริ่ม ~$50/เดือน |

**สรุป stack แนะนำสำหรับ MVP (ต้นทุนเกือบศูนย์):** Google Trends alpha (สมัครรอ) + Apify/SerpApi ชั่วคราว, Reddit free tier, Hacker News, YouTube mostPopular, TikTok Creative Center (ไทย+global), RSS ข่าวไทย+อังกฤษ, Pantip trending

---

## 4. การประมวลผล (Processing Layer)

**Ingestion** Cron jobs ดึงข้อมูลทุก 1-6 ชม. ตามแหล่ง เก็บ raw ลง DB (Postgres + pgvector หรือ Supabase)

**Normalization** แปลงทุกแหล่งเป็น schema เดียว: `{source, title, url, text, engagement, timestamp, lang, category}`

**Topic clustering** ใช้ embedding (multilingual model รองรับไทย เช่น text-embedding หรือ bge-m3) จัดกลุ่มข่าว/โพสต์ที่พูดเรื่องเดียวกันข้ามแพลตฟอร์ม

**Trend scoring หัวใจของโปรดักต์** อย่าวัดแค่ volume ให้วัด velocity:
```
trend_score = (volume_24h / avg_volume_7d) * log(volume_24h) * source_diversity
```
- volume พุ่งเทียบ baseline = กำลังมา
- source_diversity = ปรากฏหลายแพลตฟอร์มพร้อมกัน แปลว่าเป็น trend จริงไม่ใช่ viral ชั่วคราวแพลตฟอร์มเดียว

**Enrichment ด้วย LLM** ใช้ Claude API (Haiku ถูกพอสำหรับงาน batch): สรุป trend เป็นภาษาคน, จัด category, sentiment, ตอบว่า "ทำไมเรื่องนี้ถึงมา" นี่คือส่วนที่ทำให้ต่างจากเครื่องมือเดิมๆ ที่โชว์แต่กราฟ

**Category system** ให้ user เลือกหมวด (Crypto/Finance, Tech/AI, Design, Entertainment, Lifestyle, News/Politics ฯลฯ) map จาก LLM classification + source hints (subreddit, RSS feed หมวดไหน)

---

## 5. Tech Stack แนะนำ (ตรงกับ skill ที่มีอยู่)

| Layer | เทคโนโลยี |
|---|---|
| Frontend | Next.js 15 + Tailwind v4 + shadcn/ui (stack เดิมของพอร์ต ใช้ซ้ำได้เลย) |
| Charts | Recharts หรือ Tremor |
| Backend | Next.js API routes / server actions, cron ผ่าน Vercel Cron หรือ GitHub Actions |
| Database | Supabase (Postgres + pgvector + auth ฟรี tier) |
| AI | Claude API (Haiku สำหรับ batch classification/summary) |
| Deploy | Vercel free tier พอสำหรับ MVP |

---

## 6. Roadmap

**Phase 1: Personal tool (4-6 สัปดาห์)**
- Dashboard เดียว: trending topics วันนี้ ไทย+global แยกหมวด
- แหล่งฟรีทั้งหมด (ข้อ 3), cron วันละ 2-4 รอบ
- Trend score + LLM summary
- ใช้เองก่อน เก็บ feedback จากตัวเอง

**Phase 2: เปิด beta (2-3 เดือน)**
- Auth + เลือกหมวด/keyword ส่วนตัว
- Email/LINE digest รายวันหรือรายสัปดาห์
- หน้า trend detail: กราฟ velocity, โพสต์ตัวอย่าง, related keywords
- ให้เพื่อนนักการตลาด/creator ใช้ฟรี เก็บ feedback

**Phase 3: Monetize**
- Free: 1 หมวด, digest รายสัปดาห์
- Pro ~290-490 บาท/เดือน: ทุกหมวด, custom keywords, daily digest, alert
- ราคานี้ต่ำกว่า floor ตลาดไทย (3,000 บาท) 6-10 เท่า เพราะ target คนละกลุ่ม (individual ไม่ใช่องค์กร)

**Unit economics ต้องเช็คก่อนเปิด paid:** คำนวณ API cost ต่อ user ต่อเดือน ถ้าเกิน ~30% ของราคาขาย ต้องออกแบบให้ข้อมูลเป็นแบบ shared (ดึงครั้งเดียว serve ทุกคน) ไม่ใช่ดึงตาม keyword ของแต่ละ user ซึ่งโครงสร้าง trend discovery ทำแบบ shared ได้ นี่คือข้อได้เปรียบเชิงต้นทุนเหนือ social listening แบบ per-brand

---

## 7. ความเสี่ยงและข้อควรระวัง

- **ToS/กฎหมาย** การ scrape ข้อมูล public โดยทั่วไปทำได้ แต่ต้องอ่าน ToS แต่ละแพลตฟอร์ม โดยเฉพาะถ้าขายเป็น SaaS ความเสี่ยงสูงขึ้น เก็บเฉพาะข้อมูล aggregate ไม่เก็บ PII
- **API เปลี่ยนบ่อย** ปี 2026 หลายเจ้าปรับราคา/โครงสร้าง (X, Reddit, Amazon) ออกแบบ ingestion เป็น adapter pattern ให้ถอดเปลี่ยนแหล่งได้ง่าย
- **Google Trends alpha** ยังไม่ production-ready และ access จำกัด อย่าออกแบบให้ทั้งระบบพึ่งตัวเดียว
- **ภาษาไทย** ตัดคำ/clustering ภาษาไทยยากกว่าอังกฤษ ใช้ multilingual embedding แทน keyword matching จะแม่นกว่า

---

## 8. สิ่งที่ควรทำสัปดาห์นี้

1. สมัคร Google Trends API alpha (developers.google.com/search/apis/trends)
2. สร้าง Reddit app (free tier) + ลองดึง r/all rising
3. ลองดึง TikTok Creative Center trending hashtags ของไทย
4. Sketch dashboard ใน Figma (ใช้ design system ที่มีอยู่)
5. ตั้ง repo + Supabase project
