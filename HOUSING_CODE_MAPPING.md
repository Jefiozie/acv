# Housing Code Mapping System

## Overview

This system maps Center Parcs housing codes (like `HB1932`) to their formatted display names (like `"Comfort Safarilodge — Houten safarilodge"`). The mapping is:

1. **Extracted** from the Center Parcs API response during scraping
2. **Persisted** in the cache for reuse
3. **Exposed** via the backend API
4. **Consumed** by the frontend and Telegram notifications

## Architecture

### Data Flow

```
Center Parcs API Response
    ↓
    ├─ housing.code (e.g., "HB1932")
    ├─ housing.comfortLevel.name (e.g., "Comfort")
    └─ housing.name (e.g., "Safarilodge — Houten safarilodge")
    ↓
Scraper (check-centerparcs.ts)
    ├─ Formats: "${comfortLevel} — ${name}"
    ├─ Stores in cache with formattedName: "Comfort Safarilodge — Houten safarilodge"
    └─ Uses in Telegram message
    ↓
Cache (centerparcs_cache.json)
    ├─ Per cottage: { code, formattedName, prices, history, ... }
    └─ Persists across runs
    ↓
API (backend/src/api/handler.ts)
    ├─ GET /housing-mappings
    └─ Returns: { "HB1932": "Comfort Safarilodge — Houten safarilodge", ... }
    ↓
Frontend (frontend/src/app/core/services/housing-mapper.service.ts)
    └─ Fetches and caches mappings for UI display
```

## Components

### 1. Scraper (src/check-centerparcs.ts)

**Changes:**
- Added `formattedName` field to `CachedCottage` interface
- Extracts and stores: `${housing.comfortLevel.name} — ${housing.name}`
- Saves in cache and uses in Telegram messages
- Exports `getHousingMappings()` and `getHousingName(code)` functions

**Usage:**
```typescript
// In check-centerparcs.ts main loop
const formattedName = `${item.housing.comfortLevel.name} — ${item.housing.name}`;
newState[code] = {
  // ... other fields ...
  formattedName,  // ← Persisted to cache
};

// Export functions for other modules
export function getHousingMappings(): HousingMapping { ... }
export function getHousingName(code: string): string | undefined { ... }
```

### 2. Housing Mapper Utility (src/housing-mapper.ts)

Helper module that wraps the scraper exports:
- `getHousingCodeMappings()` — returns all code→name mappings
- `getFormattedHousingName(code)` — get name for a specific code
- `mapCodesToNames(codes)` — map array of codes to names

### 3. API Endpoint (backend/src/api/handler.ts)

**New endpoint:**
```
GET /housing-mappings
→ { 
    mappings: { 
      "HB1932": "Comfort Safarilodge — Houten safarilodge",
      ... 
    },
    lastUpdated: "2026-06-24T10:30:00Z"
  }
```

Reads from the cache file and exposes all housing mappings.

### 4. Frontend Service (frontend/src/app/core/services/housing-mapper.service.ts)

Angular service that:
- Fetches mappings from `/api/housing-mappings`
- Caches result with `shareReplay(1)`
- Provides methods:
  - `getMappings()` — all mappings as Observable
  - `getFormattedName(code)` — single name lookup
  - `getFormattedNames(codes)` — batch lookup

**Usage in components:**
```typescript
import { HousingMapperService } from '../services/housing-mapper.service';

export class MyComponent {
  private readonly housing = inject(HousingMapperService);
  
  // In template or logic:
  formattedName$ = this.housing.getFormattedName('HB1932');
}
```

## Cache Structure

The `centerparcs_cache.json` now includes the formatted name:

```json
{
  "HB1932": {
    "firstSeen": "2026-06-24T10:15:00Z",
    "latestPromoPrice": "1495",
    "latestOriginalPrice": "1795",
    "formattedName": "Comfort Safarilodge — Houten safarilodge",
    "history": [
      {
        "date": "2026-06-24",
        "originalPrice": "1795",
        "promoPrice": "1495",
        "discount": 17,
        "stock": 3
      }
    ]
  }
}
```

## Usage Examples

### Telegram Message
```
🏠 Comfort Safarilodge — Houten safarilodge (HB1932) 🆕
   💶 €1.495
   👥 Max. 6 personen · Voorraad: 3
```

### Frontend Component
```typescript
// Fetch and display housing name
housing.getFormattedName('HB1932').subscribe(name => {
  console.log(name); // "Comfort Safarilodge — Houten safarilodge"
});
```

### API Response
```json
{
  "mappings": {
    "HB1932": "Comfort Safarilodge — Houten safarilodge",
    "HB1933": "Premium Safarilodge — Houten safarilodge",
    "HB1934": "Standard Cottage — Standaard comfort"
  },
  "lastUpdated": "2026-06-24T10:30:00Z"
}
```

## Benefits

✅ **Persistence**: Mappings survive across scraper runs
✅ **Consistency**: Same formatted name used everywhere (Telegram, API, frontend)
✅ **Efficiency**: Mappings cached and shared across the app
✅ **Extensibility**: Easy to add more housing attributes later
✅ **Maintainability**: Centralized housing display logic

## Integration Checklist

- [x] Scraper extracts and stores formatted names
- [x] Cache updated with `formattedName` field
- [x] Telegram messages use formatted names
- [x] API endpoint exposes housing mappings
- [x] Frontend service fetches and caches mappings
- [ ] Update website to use `HousingMapperService`
- [ ] Update any existing components displaying cottage codes
