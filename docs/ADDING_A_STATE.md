# Adding a new state

Opening a state needs three small code edits and an Excel file. Nothing else in the code changes: the home page, the forms, the district lists, the footer, the tags, the analytics and the admin panel all read the shared state list.

Example: Uttar Pradesh (it is already shown as "coming soon").

## 1. Edit `packages/schemes/src/constants.ts`

1. Add the state name to `STATES`:
   ```ts
   export const STATES = ['Delhi', 'Madhya Pradesh', 'Uttar Pradesh'] as const;
   ```
2. Add its districts to `STATE_DISTRICTS` (the full official list, spelled as people will recognise).
3. Add one line to `STATE_META`: a two-letter code, a short lower-case address name and the Hindi name.
   ```ts
   'Uttar Pradesh': { code: 'UP', slug: 'uttarpradesh', hindi: 'उत्तर प्रदेश' },
   ```
4. Remove the state from `COMING_SOON_STATES`.

TypeScript refuses to build until `STATE_META` has an entry for every state, and a test (`packages/schemes/test/states.test.ts`) checks that districts, codes and slugs are present and unique.

## 2. Prepare the schemes

1. Admin panel, **Excel upload**, **Download template**.
2. Fill one row per scheme. Set the `State` column to `Uttar Pradesh`, give every scheme an ID that starts with the state code (`UP-001`), an official link, a description, and the rules. Write "needs review" in Source_Note when unsure.
3. Include the central schemes that apply in that state (a central scheme is repeated once per state).
4. Verify every row against the official page and fill `Last_Verified_Date`.

## 3. Deploy

1. Deploy the API first (it accepts the new state), then the website:
   ```bash
   NEXT_PUBLIC_API_URL=https://api.example.in npm run build -w @ujjwal/web
   ```
2. In the admin panel upload the Excel file with the state selected. Read the preview, confirm.
3. Check the public file: `https://api.example.in/public/schemes/uttarpradesh`.
4. Optional but recommended: run `npm run data:refresh -w @ujjwal/web` before the website build so the website's built-in fallback copy contains the new state.
5. Open the state on the website in both languages and try one personal and one family case.

## Run the checks

```bash
npm test            # includes the state consistency test
npm run typecheck
```

## What you do not need to touch

The forms (districts come from the list), the scheme rules (they come from Excel), tags (automatic: `#uttarpradesh`, `#central`, ...), analytics and the admin panel (the state filters read the same list).

## Note on Hindi text

The home page shows the Hindi state name from `STATE_META`. Scheme descriptions come from the `Description_Hindi` column of the Excel file; if it is empty the English text is shown.
