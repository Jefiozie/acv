# Housing Code Mapping - Quick Start

## What's Changed

Your Center Parcs scraper now:

1. ✅ Extracts housing codes like `HB1932` 
2. ✅ Maps them to formatted names like `"Comfort Safarilodge — Houten safarilodge"`
3. ✅ Persists these mappings in the cache (`centerparcs_cache.json`)
4. ✅ Uses them in Telegram messages
5. ✅ Exposes them via API endpoint `/api/housing-mappings`
6. ✅ Available for use on the website via the `HousingMapperService`

## Files Modified

| File | Changes |
|------|---------|
| `src/check-centerparcs.ts` | Added `formattedName` field to cache, export mapping functions |
| `backend/src/api/handler.ts` | Added `GET /housing-mappings` endpoint |
| `src/housing-mapper.ts` | **NEW** - Utility functions for accessing mappings |
| `frontend/src/app/core/services/housing-mapper.service.ts` | **NEW** - Angular service for frontend |

## How to Use on Your Website

### 1. In an Angular Component

```typescript
import { Component, inject } from '@angular/core';
import { HousingMapperService } from './core/services/housing-mapper.service';

@Component({
  selector: 'app-cottage-list',
  template: `
    <div *ngFor="let cottage of cottages">
      <h3>{{ (housing.getFormattedName(cottage.code) | async) }}</h3>
      <p>Code: {{ cottage.code }}</p>
      <p>Price: {{ cottage.price }}</p>
    </div>
  `
})
export class CottageListComponent {
  readonly housing = inject(HousingMapperService);
  
  cottages = [
    { code: 'HB1932', price: '€1.495' },
    { code: 'HB1933', price: '€1.795' },
  ];
}
```

### 2. Direct API Call

```javascript
// Fetch housing mappings directly
const response = await fetch('/api/housing-mappings');
const { mappings } = await response.json();

console.log(mappings);
// Output:
// {
//   "HB1932": "Comfort Safarilodge — Houten safarilodge",
//   "HB1933": "Premium Safarilodge — Houten safarilodge"
// }
```

### 3. Example: Display with Code and Name

```typescript
// Get mapping for specific code
this.housing.getFormattedName('HB1932').subscribe(name => {
  console.log(`Displaying: ${name}`);
  // Output: "Comfort Safarilodge — Houten safarilodge"
});

// Get multiple at once
const codes = ['HB1932', 'HB1933', 'HB1934'];
this.housing.getFormattedNames(codes).subscribe(mapping => {
  console.log(mapping);
  // Use to look up names as needed
});
```

## Cache Example

After running the scraper, `centerparcs_cache.json` now contains:

```json
{
  "HB1932": {
    "firstSeen": "2026-06-24T10:15:00Z",
    "latestPromoPrice": "1495",
    "latestOriginalPrice": "1795",
    "formattedName": "Comfort Safarilodge — Houten safarilodge",
    "history": [...]
  },
  "HB1933": {
    "firstSeen": "2026-06-24T10:15:00Z",
    "latestPromoPrice": "1795",
    "latestOriginalPrice": "1995",
    "formattedName": "Premium Safarilodge — Houten safarilodge",
    "history": [...]
  }
}
```

## Telegram Messages

The scraper now uses the formatted names in Telegram:

```
🏠 Comfort Safarilodge — Houten safarilodge (HB1932) 🆕
   💶 €1.495
   👥 Max. 6 personen · Voorraad: 3
   
🏠 Premium Safarilodge — Houten safarilodge (HB1933) 💰
   💶 €1.795
   👥 Max. 8 personen · Voorraad: 2
```

Instead of:

```
🏠 Comfort — Houten safarilodge (HB1932)
```

## API Integration Notes

- The API endpoint reads from the cache file: `centerparcs_cache.json`
- Make sure the cache file is available to the Lambda function
- The mapping is automatically updated every time the scraper runs
- Stale mappings for cottages no longer available remain in the cache

## Next Steps

1. **Update any existing components** that display housing codes to use `HousingMapperService`
2. **Test the API endpoint**: `curl http://localhost:3000/api/housing-mappings`
3. **Verify Telegram messages** include the full formatted names
4. **Deploy** and verify everything works end-to-end
