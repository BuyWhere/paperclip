# ARCHIE Archetype Engine

**Version:** 1.0 | **Owner:** OS Engineering | **Issue:** [OS-220](/OS/issues/OS-220)

The ARCHIE engine generates a personalized Operating System archetype for every user based on four inputs: Sun sign, BaZi Day Master, Day Master strength, and personality type. It produces **17,280 base combinations** that scale to **456M+** with goal and task template variants.

---

## Quick Start

```typescript
import { generateArchetype } from '@/lib/archie-engine'

const result = generateArchetype({
  birthDate: '1990-01-06',      // YYYY-MM-DD (required)
  birthTime: '14:30',           // HH:MM 24h (optional)
  personalityCode: 'sg',        // 'sg' | 'sp' | 'ig' | 'ip'
})

console.log(result.archetypeId)   // "capricorn_geng_strong_sg"
console.log(result.archetypeName) // "The Mountain Forge"
```

---

## Archetype ID Format

```
{sun_sign_key}_{day_master_romanized}_{strength}_{personality_code}[_h{n}]
```

| Segment | Values | Example |
|---------|--------|---------|
| sun_sign_key | capricorn, aquarius, pisces, aries, taurus, gemini, cancer, leo, virgo, libra, scorpio, sagittarius | `capricorn` |
| day_master_romanized | jia, yi, bing, ding, wu, ji, geng, xin, ren, gui | `geng` |
| strength | strong, weak, balanced | `strong` |
| personality_code | sg, sp, ig, ip | `sg` |
| _h{n} (optional) | 0-11 時辰 index | `_h5` |

**Example:** `capricorn_geng_strong_sg` = The Mountain Forge

---

## Input Dimensions

### 1. Sun Sign (12 signs)

Derived from birth date alone — 100% accurate for non-cusp dates.

| ID | Sign | Key | Dates | Element | Modality |
|----|------|-----|-------|---------|----------|
| 0 | Capricorn | capricorn | Dec 22 – Jan 19 | Earth | Cardinal |
| 1 | Aquarius | aquarius | Jan 20 – Feb 18 | Air | Fixed |
| 2 | Pisces | pisces | Feb 19 – Mar 20 | Water | Mutable |
| 3 | Aries | aries | Mar 21 – Apr 19 | Fire | Cardinal |
| 4 | Taurus | taurus | Apr 20 – May 20 | Earth | Fixed |
| 5 | Gemini | gemini | May 21 – Jun 20 | Air | Mutable |
| 6 | Cancer | cancer | Jun 21 – Jul 22 | Water | Cardinal |
| 7 | Leo | leo | Jul 23 – Aug 22 | Fire | Fixed |
| 8 | Virgo | virgo | Aug 23 – Sep 22 | Earth | Mutable |
| 9 | Libra | libra | Sep 23 – Oct 22 | Air | Cardinal |
| 10 | Scorpio | scorpio | Oct 23 – Nov 21 | Water | Fixed |
| 11 | Sagittarius | sagittarius | Nov 22 – Dec 21 | Fire | Mutable |

**Cusp note:** People born within ±1 day of a sign boundary have `isCusp: true` in the result. Their assigned sign is correct in almost all cases; for exact cusp accuracy, the precise birth time (hour/minute) with ephemeris lookup is required.

### 2. BaZi Day Master (10 Heavenly Stems)

| Stem | Romanized | Element | Polarity |
|------|-----------|---------|----------|
| 甲 | jia | Wood | Yang |
| 乙 | yi | Wood | Yin |
| 丙 | bing | Fire | Yang |
| 丁 | ding | Fire | Yin |
| 戊 | wu | Earth | Yang |
| 己 | ji | Earth | Yin |
| 庚 | geng | Metal | Yang |
| 辛 | xin | Metal | Yin |
| 壬 | ren | Water | Yang |
| 癸 | gui | Water | Yin |

**BaZi uses the solar calendar** — not the lunar calendar. Calculated using Julian Day Number math for exact day-pillar accuracy.

### 3. Day Master Strength (3 levels)

| Level | Description |
|-------|-------------|
| `strong` | Day Master is in season + well-supported (score ≥ 4) |
| `weak` | Day Master is out of season + opposed (score ≤ 0) |
| `balanced` | Moderate support, adaptable (score 1–3) |

**Calculation method:**
1. **Month Commander** (月令, primary weight ×3): Is the Day Master's element in season?
2. **Stem distribution**: Count supporting vs. opposing stems across all pillars
3. **Branch hidden stems** (藏干): Hidden element weights at 1.0, 0.5, 0.25

### 4. Personality Type (4 types)

| Code | Label | Description |
|------|-------|-------------|
| `sg` | Systematic Goal-Driven | Methodical execution toward clear outcomes |
| `sp` | Systematic Process-Driven | Masters the craft, perfects the method |
| `ig` | Intuitive Goal-Driven | Bold, fast, vision-first execution |
| `ip` | Intuitive Process-Driven | Flows with ideas, emergent and creative |

Derived from personality quiz: **systematic vs. intuitive** × **goal vs. process**.

### 5. Hour Pillar / 時辰 (12 slots, optional)

If birth time is known, the exact 時辰 (2-hour slot) is calculated. If unknown, the **time quiz** estimates the most likely 時辰.

| Index | Branch | Animal | Hours |
|-------|--------|--------|-------|
| 0 | 子 | Rat | 23:00–01:00 |
| 1 | 丑 | Ox | 01:00–03:00 |
| 2 | 寅 | Tiger | 03:00–05:00 |
| 3 | 卯 | Rabbit | 05:00–07:00 |
| 4 | 辰 | Dragon | 07:00–09:00 |
| 5 | 巳 | Snake | 09:00–11:00 |
| 6 | 午 | Horse | 11:00–13:00 |
| 7 | 未 | Goat | 13:00–15:00 |
| 8 | 申 | Monkey | 15:00–17:00 |
| 9 | 酉 | Rooster | 17:00–19:00 |
| 10 | 戌 | Dog | 19:00–21:00 |
| 11 | 亥 | Pig | 21:00–23:00 |

---

## API Endpoints

### `POST /api/v1/archetype/generate`

Generates a full ARCHIE archetype. Requires authentication.

**Request:**
```json
{
  "birthDate": "1990-01-06",
  "birthTime": "14:30",
  "personalityCode": "sg",
  "estimatedHourIndex": null
}
```

**Response:** Full `ArchieResult` object including:
- `archetypeId`, `archetypeName`, `description`
- `dashboardTokens` (colors, typography, metaphors, coaching, rituals)
- `goalTemplates` (domain-specific, 6 domains × 3 templates)
- `energyHours` (peak, moderate, rest hours)
- `bazi` (all 4 pillars, day master, element counts)

### `GET /api/v1/archetype/{archetype_id}`

Returns static definition for a known archetype ID. No authentication required.

```
GET /api/v1/archetype/capricorn_geng_strong_sg
```

### `POST /api/v1/quiz/time-estimate` / `GET /api/v1/quiz/time-estimate`

**GET** — returns the 5 quiz questions for UI rendering.

**POST** — scores answers and returns estimated 時辰 candidates.

**Request:**
```json
{
  "answers": { "1": "c", "2": "b", "3": "b", "4": "b", "5": "c" }
}
```

**Response:**
```json
{
  "candidates": [
    { "shichen": { "animal": "Dragon", "hours": "07:00–09:00" }, "confidence": 0.42 }
  ],
  "topHour": 7,
  "estimatedHourIndex": 4,
  "message": "We estimate you were born during 辰时 (Dragon Hour, 07:00–09:00)."
}
```

---

## Known Archetype Examples (from spec)

| Combination | Archetype Name |
|-------------|---------------|
| Capricorn + 庚 Metal Strong + SG | The Mountain Forge |
| Pisces + 癸 Water Weak + IP | The Deep Dream |
| Leo + 丙 Fire Strong + IG | The Solar Flame |
| Virgo + 辛 Metal Weak + SP | The Precision Lab |
| Scorpio + 丙 Fire Strong + IG | The Phoenix Forge |

---

## How to Add a New Sun Sign

Sun signs are fixed at 12 — this section covers updating display data.

1. **Edit `src/lib/sun-sign.ts`:**
   - Add entry to `SUN_SIGNS` array with correct `id`, `key`, `name`, dates, element, modality
   - Update `BOUNDARIES` table if any date ranges change

2. **Edit `src/lib/archie-engine.ts`:**
   - Add dashboard tokens to `SUN_SIGN_DASHBOARD_TOKENS` keyed by `key`
   - Add entries to `SUN_SIGN_NAME_WORDS`, `SUN_SIGN_THEMES`

3. **Add test cases** in `src/lib/__tests__/archie.test.ts`

4. **Dashboard token spec** — each sign needs:
   - `colorPalette` (7 colors: primary, secondary, accent, background, text, success, warning)
   - `typography` (heading font, body font, mono font, style description)
   - `metaphor` (visual, layout, animation, icons[])
   - `taskPresentation` (style, cardDescription, progressLabel, dueDateTemplate)
   - `progressVisualization` (type, fillDescription, milestones[], celebrationStyle)
   - `schedulingPhilosophy` (blockStyle, restStyle, energyPattern, calendarView)
   - `coachingTone` (style, exampleMessages[3], metaphorFrequency: 'high'|'medium'|'low')
   - `ritualSuggestions` (daily, weekly, monthly, annual)

---

## How to Add a New Day Master

Day Masters are the 10 Heavenly Stems (天干) — this is fixed by BaZi theory. However, you can update:

1. **Display data** in `src/lib/archie-engine.ts`:
   - `DAY_MASTER_ROMANIZED` — Pinyin romanization
   - `DAY_MASTER_EN` — English description string
   - `DAY_MASTER_MODIFIERS` — name generation words for this element

2. **Strength calculation** in `src/lib/bazi-strength.ts`:
   - `BRANCH_HIDDEN_STEMS` — hidden stem data (fixed by BaZi theory, rarely changes)
   - `MONTH_SEASON_ELEMENT` — seasonal element map (fixed)

3. **Energy hours** in `src/lib/archie-engine.ts`:
   - `ELEMENT_PEAK_HOURS` — add or adjust hours for this element

---

## File Map

| File | Purpose |
|------|---------|
| `src/lib/sun-sign.ts` | Sun sign calculator (birth date → sign ID 0–11) |
| `src/lib/bazi.ts` | BaZi 4-pillar calculator (Year/Month/Day/Hour pillars) |
| `src/lib/bazi-strength.ts` | Day Master strength (strong/weak/balanced) |
| `src/lib/time-quiz.ts` | Time quiz — estimates 時辰 from 5 behavioral questions |
| `src/lib/archie-engine.ts` | Main ARCHIE engine — combines all dimensions |
| `src/app/api/v1/archetype/generate/route.ts` | POST endpoint |
| `src/app/api/v1/archetype/[archetype_id]/route.ts` | GET endpoint |
| `src/app/api/v1/quiz/time-estimate/route.ts` | Time quiz GET/POST |
| `src/lib/__tests__/archie.test.ts` | Test suite (50 profiles, all dimensions) |

---

## Combination Math

| Dimension | Count |
|-----------|-------|
| Sun signs | 12 |
| Day Masters | 10 |
| Strength levels | 3 |
| Personality types | 4 |
| Hour pillars (optional) | 12 (+1 for no-hour) |
| **Base (without hour)** | **1,440** |
| **Base (with hour)** | **17,280** |
| With 6 goal domains × 3 templates each | ~311,040 |
| With project task templates | 456M+ |
