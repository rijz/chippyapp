# 🔒 FROZEN CHANGES - DO NOT MODIFY WITHOUT APPROVAL

> **Last Updated:** January 17, 2026
> **Status:** FROZEN - Changes require explicit user approval

---

## Fix 1: Widget Embed Booking Detection

### Problem Solved
The embedded chat widget was telling customers to "call to book" instead of offering online booking.

### Root Cause
`EmbedPage.tsx` was passing `calendarConnections={[]}` to the `ChatWidget`.

### Changes Made
- **server.js**: Added calendar connections to `/api/widget-config/:userId` response
- **EmbedPage.tsx**: Loads and passes calendar connections to ChatWidget
- **locationTools.ts**: Updated `getLocationSelectionPrompt()` to handle calendars without `location_id`

---

## Fix 2: Embed Widget Data Saving (Leads, Sessions, Analytics)

### Problem Solved
Leads, chat sessions, and analytics were not being saved to the database when using the embed widget on external domains.

### Root Cause
`EmbedPage.tsx` was missing callback handlers (onLeadCapture, onSessionUpdate, onBookingComplete, etc.)

### Changes Made

#### server.js - Added 3 new API endpoints:
```
POST /api/widget/lead      - Creates/updates leads from embed widget
POST /api/widget/session   - Saves chat sessions from embed widget  
POST /api/widget/interaction - Saves analytics and review queue items
```

#### EmbedPage.tsx - Added callback handlers:
- `handleInteraction()` - Saves to analytics/review queue via API
- `handleLeadCapture()` - Saves new leads via API
- `handleSessionUpdate()` - Saves chat sessions via API
- `handleBookingComplete()` - Creates/updates leads with "Booked" status
- `handleCancellation()` - Updates leads to "Cancelled" status
- `handleCallbackRequest()` - Creates leads with "Call Back" status

---

## Files Modified (FROZEN)

| File | Changes |
|------|---------|
| `server.js` | Widget-config API + 3 new widget data APIs |
| `src/pages/EmbedPage.tsx` | Calendar connections + all callback handlers |
| `src/services/locationTools.ts` | Improved booking detection logic |
| `src/pages/Integrations.tsx` | Embed domain security UI |

---

## ⚠️ IMPORTANT

**DO NOT modify any of the above files without explicit user approval.**

If changes are needed:
1. Explain the proposed change
2. Wait for user confirmation
3. Only then proceed

---

## Testing Verification

✅ Widget loads on external domain (hellochippy.com)
✅ AI offers to book appointments (not "call to book")
✅ Callback requests work correctly
✅ Leads are saved to database
✅ Chat sessions are saved to database
✅ Analytics/reviews are updated
✅ Build compiles without errors

---

## Fix 3: Onboarding Flow Issues

> **Added:** January 13, 2026

### Problems Solved
1. Onboarding wizard was not automatically showing for new users
2. No clear feedback when scan fails during onboarding
3. Users didn't know what fields were required on Step 2
4. KnowledgeBase page didn't redirect to Widget Studio after onboarding

### Root Causes
- `App.tsx` had incomplete useEffect that detected new users but never triggered the wizard
- No error state was tracked during website scanning
- Button disabled state wasn't clearly communicated
- `KnowledgeBase.tsx` onComplete handler didn't navigate to widget

### Changes Made

#### src/contexts/DataContext.tsx
- Added `isLoading` state to track when initial data fetch is complete
- Exports `isLoading` so App.tsx can determine when to show wizard

#### src/App.tsx
- Added `isLoading` from useData() hook
- Fixed useEffect to properly show wizard when loading completes and knowledgeData is null

#### src/components/OnboardingWizard.tsx
- Added `scanError` and `isScanning` state variables
- Improved error handling with specific error messages
- Added red error banner with "Try Again" button when scan fails
- Added loading indicator while scanning
- Added validation feedback for Step 2:
  - Dynamic button text ("Select a Business Type" / "Enter Address to Continue" / "Begin Analysis")
  - Red border on empty required address field
  - Validation message when address is missing
  - Helper text when no business type selected
- Added `disabled:cursor-not-allowed` for better UX
- Added safe URL parsing to prevent crashes from malformed URLs

#### src/pages/KnowledgeBase.tsx
- Added navigation to Widget Studio after onboarding completion

---

## Files Modified (FROZEN)

| File | Changes |
|------|---------|
| `server.js` | Widget-config API + 3 new widget data APIs |
| `src/pages/EmbedPage.tsx` | Calendar connections + all callback handlers |
| `src/services/locationTools.ts` | Improved booking detection logic |
| `src/pages/Integrations.tsx` | Embed domain security UI |
| `src/contexts/DataContext.tsx` | Added isLoading state for onboarding trigger |
| `src/App.tsx` | Fixed auto-trigger of onboarding wizard for new users |
| `src/components/OnboardingWizard.tsx` | Error handling, validation, loading states |
| `src/pages/KnowledgeBase.tsx` | Widget Studio navigation after onboarding |
| `src/services/geminiService.ts` | Removed mock data fallback, proper error throwing |

---

## ⚠️ IMPORTANT

**DO NOT modify any of the above files without explicit user approval.**

If changes are needed:
1. Explain the proposed change
2. Wait for user confirmation
3. Only then proceed

---

## Fix 4: Website Scanning Error Handling

> **Added:** January 15, 2026

### Problems Solved
1. Scan was returning confusing "API Key rejected/blocked" message when it actually timed out
2. Mock/demo data was being returned on failure, confusing users
3. Scan could get stuck at 98% during long scrapes

### Root Causes
- `geminiService.ts` returned mock data on any error, with `isMock: true` flag
- `OnboardingWizard.tsx` checked for `isMock` and showed misleading "API Key blocked" message
- No specific handling for different error types (timeout vs rate limit vs content issues)

### Changes Made

#### src/services/geminiService.ts
- **Removed mock data fallback entirely** - now throws the actual error
- Error message is passed through to the UI for accurate display

#### src/components/OnboardingWizard.tsx
- Removed `isMock` check (no longer needed)
- Added specific error message handling:
  - **Timeout (504)**: "The website took too long to respond..."
  - **Rate limit (429)**: "Rate limit reached. You can only scan 5 websites per hour..."
  - **Limited content**: "Could not find enough content on the website..."
  - **Other errors**: Show actual error message with option to continue manually

---

## Fix 5: Scraper Performance Optimization

> **Added:** January 15, 2026

### Problem Solved
Website scanning was timing out after 2 minutes on complex websites, causing scans to fail.

### Root Cause
The scraper was:
- Scraping up to 30 pages (including sitemap URLs)
- Using 20-second timeout per page
- Using `networkidle2` wait strategy (slow)
- 3 retries with exponential backoff
- 500ms extra delay per page

### Changes Made

#### scraper.js
- **Reduced max pages from 30 to 10** - Focus on essential pages only
- **Reduced per-page timeout from 20s to 12s**
- **Changed wait strategy from `networkidle2` to `domcontentloaded`** - Much faster
- **Reduced max retries from 3 to 2**
- **Removed 500ms extra delay** - No longer needed
- **Increased batch size from 3 to 4** - More parallelism
- **Skipped sitemap parsing** - Faster initial scan using essential paths only

**Result:** Scans now complete in ~30-60 seconds instead of timing out.

---

## Fix 6: Dedicated Onboarding Route

> **Added:** January 15, 2026

### Problem Solved
After signup, users saw the dashboard briefly before the onboarding popup appeared on top. This was jarring.

### Root Cause
Onboarding was a popup/overlay component rendered on top of the dashboard.

### Changes Made

#### src/pages/OnboardingPage.tsx (NEW)
- Created dedicated full-page onboarding experience
- Shows gentle loader while checking if user needs onboarding
- Redirects to Widget Studio when complete
- Clean URL: `app.hellochippy.com/onboarding`

#### src/App.tsx
- Added `/onboarding` route (full page, no sidebar)
- Created `OnboardingCheck` component that redirects new users to `/onboarding`
- Removed popup overlay logic
- All other routes now check if user needs onboarding first

**New Flow:**
1. User signs up → redirected to `/onboarding`
2. User completes onboarding → redirected to `/widget` (Widget Studio)
3. From Widget Studio, user can connect calendar via Integrations

---

## Fix 7: Onboarding UX Improvements

> **Added:** January 17, 2026

### Problems Solved
1. Website scanning appeared stuck at 98% without further updates
2. After approving a section in Knowledge Verification, users had to manually open next section
3. No feedback shown after scanning a pricing URL
4. Confusion between "Services & Pricing" and "Pricing & Rates" sections
5. Training progress text was red (appeared negative)
6. Knowledge base data not loading for users who completed onboarding (sync delay issue)
7. Address field required manual entry of city/state/zip

### Changes Made

#### src/components/OnboardingWizard.tsx
- **Scan progress messages**: Added "Finalizing data extraction..." (96%) and "Validating extracted entities..." (98%)
- **Auto-advance sections**: After approving a section, automatically opens next unapproved section and scrolls to it
- **Service section rename**: Changed "Services & Pricing" to "Services" to avoid confusion
- **Training colors**: Changed from red/coral to blue for a more positive feel
- **Address autocomplete**: Integrated Google Places autocomplete that auto-fills city, state/province, and ZIP/postal code

#### src/components/ServiceEditor.tsx
- **Pricing scan feedback**: Added `pricingScanResult` prop to display success/error messages after scanning:
  - Success: "Found pricing for X existing service(s) and Y new service(s)."
  - No results: "No pricing information found on this page. Try a different URL..."
  - Error: "An error occurred while scanning. Please try again."

#### src/contexts/DataContext.tsx
- **Data persistence fix**: Only overwrite local knowledgeData with Supabase data if Supabase returns non-null data. This prevents losing data that was set during onboarding but hasn't synced yet.

#### src/components/AddressAutocomplete.tsx (NEW)
- Google Places API integration for address autocomplete
- Auto-populates city, state/province, and ZIP/postal code
- Supports US and Canada addresses
- Graceful degradation if API fails

---

## Fix 8: Knowledge Base Services Display

> **Added:** January 17, 2026

### Problem Solved
React Error #31: "Objects are not valid as a React child" when viewing Knowledge Base page. Services are now objects with `{id, name, pricing, description}` instead of strings.

### Root Cause
`KnowledgeData.tsx` was trying to render Service objects directly as strings using array.map().

### Changes Made

#### src/components/knowledge/KnowledgeData.tsx
- Added custom renderer for Service objects that displays:
  - Service name
  - Description (if available, truncated to 2 lines)
  - Formatted pricing using `formatServicePrice()` utility
  - Duration in minutes (if available)
- Added fallback UI for users with no knowledge data showing guidance
- Imported `Service` type and `formatServicePrice` utility
- Added `Clock` icon for duration display

---

## Fix 9: Widget.js Cross-Origin Embedding

> **Added:** January 17, 2026

### Problem Solved
`ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` error when loading widget.js from external domains.

### Root Cause
Widget.js was missing Cross-Origin Resource Policy headers for cross-origin embedding.

### Changes Made

#### server.js
- Added dedicated route for `/widget.js` that sets proper CORS headers:
```javascript
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
```

**Note:** The website URL scanned during onboarding and the widget installation URL don't need to be the same. The widget can be embedded on any website.

---

## Fix 10: Review Queue Save Functionality

> **Added:** January 17, 2026

### Problem Solved
After modifying a response and clicking "Save & Train" in the Review Queue, the changes weren't displayed - the editing textarea remained visible.

### Root Cause
The `handleSaveCorrection` function wasn't resetting the editing state after saving.

### Changes Made

#### src/pages/ReviewQueue.tsx
- Added `setIsEditing(false)` and `setCorrectionText('')` after saving corrections
- This properly closes the editor and displays the saved correction

---

## Files Modified (FROZEN)

| File | Changes |
|------|---------|
| `server.js` | Widget-config API + widget data APIs + widget.js CORS headers |
| `src/pages/EmbedPage.tsx` | Calendar connections + all callback handlers |
| `src/services/locationTools.ts` | Improved booking detection logic |
| `src/pages/Integrations.tsx` | Embed domain security UI |
| `src/contexts/DataContext.tsx` | isLoading state + data persistence fix |
| `src/App.tsx` | Dedicated /onboarding route, OnboardingCheck component |
| `src/components/OnboardingWizard.tsx` | Error handling, validation, loading states, auto-advance, address autocomplete |
| `src/pages/KnowledgeBase.tsx` | Widget Studio navigation after onboarding |
| `src/services/geminiService.ts` | Removed mock data fallback, proper error throwing |
| `src/pages/OnboardingPage.tsx` | NEW - Dedicated onboarding page |
| `scraper.js` | Performance optimization (10 pages, 12s timeout, no sitemap) |
| `src/components/ServiceEditor.tsx` | Pricing scan feedback display |
| `src/components/knowledge/KnowledgeData.tsx` | Service objects rendering + fallback UI |
| `src/components/AddressAutocomplete.tsx` | NEW - Google Places autocomplete |
| `src/pages/ReviewQueue.tsx` | Save functionality fix |

---

## Fix 11: Enhanced Widget Embed Security

> **Added:** January 17, 2026

### Problem Solved
The widget embed had permissive security - if no domains were configured, it allowed embedding from anywhere. This could allow widget abuse or hijacking.

### Changes Made

#### server.js - Enhanced /embed CSP middleware
- **Always set CSP header** (previously only set if domains were configured)
- **Default whitelist** includes:
  - `'self'` for dashboard preview
  - `https://app.hellochippy.com` and `https://hellochippy.com`
  - `localhost` for development
  - User's configured `allowed_embed_domains`
  - User's scanned website URL (auto-whitelisted)
- **Security logging**: Logs unauthorized access attempts with referer origin
- **Checks both** explicit domains and scanned website URL as fallback

**Security Model:**
```
widget.js  → Open (CORS: *) - just a loader script, no sensitive data
/embed     → Protected (CSP frame-ancestors) - actual widget with user data
```

---

## Fix 12: Google Places API Migration

> **Added:** January 17, 2026

### Problems Solved
1. Console warning: "Google Maps JavaScript API has been loaded directly without loading=async"
2. Deprecation warning: "google.maps.places.Autocomplete is not available to new customers"

### Root Cause
The AddressAutocomplete component was using the legacy `google.maps.places.Autocomplete` API which is deprecated for new customers as of March 2025.

### Changes Made

#### src/components/AddressAutocomplete.tsx
- **Migrated to new PlaceAutocompleteElement API** (`google.maps.places.PlaceAutocompleteElement`)
- **Added `loading=async`** to the script URL for optimal performance
- **Fallback support**: Falls back to legacy API if PlaceAutocompleteElement is not available
- **Uses `gmp-placeselect` event** instead of `place_changed`
- **Fetches place details** with `place.fetchFields()` to get addressComponents
- **Styled with CSS custom properties** for the new element:
  ```css
  --gmpx-color-surface: white;
  --gmpx-color-on-surface: #1e293b;
  --gmpx-color-primary: #FF6B5E;
  ```

---

## Files Modified (FROZEN)

| File | Changes |
|------|---------|
| `server.js` | Widget-config API + widget data APIs + widget.js CORS + enhanced embed CSP |
| `src/pages/EmbedPage.tsx` | Calendar connections + all callback handlers |
| `src/services/locationTools.ts` | Improved booking detection logic |
| `src/pages/Integrations.tsx` | Embed domain security UI |
| `src/contexts/DataContext.tsx` | isLoading state + data persistence fix |
| `src/App.tsx` | Dedicated /onboarding route, OnboardingCheck component |
| `src/components/OnboardingWizard.tsx` | Error handling, validation, loading states, auto-advance, address autocomplete |
| `src/pages/KnowledgeBase.tsx` | Widget Studio navigation after onboarding |
| `src/services/geminiService.ts` | Removed mock data fallback, proper error throwing |
| `src/pages/OnboardingPage.tsx` | NEW - Dedicated onboarding page |
| `scraper.js` | Performance optimization (10 pages, 12s timeout, no sitemap) |
| `src/components/ServiceEditor.tsx` | Pricing scan feedback display |
| `src/components/knowledge/KnowledgeData.tsx` | Service objects rendering + fallback UI |
| `src/components/AddressAutocomplete.tsx` | NEW - Google Places PlaceAutocompleteElement API |
| `src/pages/ReviewQueue.tsx` | Save functionality fix |

---

## Testing Verification

✅ Widget loads on external domain (hellochippy.com)
✅ AI offers to book appointments (not "call to book")
✅ Callback requests work correctly
✅ Leads are saved to database
✅ Chat sessions are saved to database
✅ Analytics/reviews are updated
✅ Build compiles without errors

### Onboarding Flow Tests
✅ New user is redirected to /onboarding (not dashboard popup)
✅ Gentle loader shows while checking onboarding status
✅ Validation shows when business type not selected
✅ Address validation shows for storefront businesses
✅ Scan errors display with retry option
✅ Loading indicator shows during scan
✅ Users navigate to Widget Studio after completion
✅ Timeout errors show accurate message (not "API Key blocked")
✅ No mock data returned on failure
✅ Scan progress shows updates at 96% and 98%
✅ Auto-advance to next section after approving
✅ Pricing scan shows feedback message
✅ Address autocomplete fills city/state/zip (new PlaceAutocompleteElement API)

### Scraper Performance Tests
✅ Scans complete in 30-60 seconds for most websites
✅ Essential pages (homepage, pricing, services, about, contact, faq) are prioritized
✅ Timeout still handled gracefully with user-friendly error message

### Knowledge Base Tests
✅ Services display correctly as cards with name, pricing, duration
✅ No React Error #31 when viewing Knowledge Base
✅ Data persists correctly after onboarding (no sync delay data loss)

### Review Queue Tests
✅ Corrections save and display properly
✅ Edit mode closes after saving

### Widget Embedding Tests
✅ widget.js loads from external domains without CORS errors
✅ Widget embed restricted to allowed domains (CSP enforced)
✅ Unauthorized access attempts are logged
✅ Scanned website URL auto-whitelisted for embedding

### Google Places API Tests
✅ No console warnings about async loading
✅ No deprecation warnings (using new PlaceAutocompleteElement)
✅ Address autocomplete works on Chrome, Firefox, Safari
✅ Fallback to legacy API if PlaceAutocompleteElement unavailable

---

## Fix 13: Security Hardening

> **Added:** January 17, 2026

### Problems Solved
Security audit revealed several vulnerabilities:
1. **XSS in ChatWidget**: `dangerouslySetInnerHTML` without sanitization could allow malicious scripts
2. **IDOR vulnerability**: `/api/embed-domains/:userId` PUT endpoint had no authentication - anyone could modify any user's embed domains
3. **Stored XSS**: Widget APIs accepted unsanitized input that could be stored and rendered

### Security Testing Performed
- Attempted XSS injection via widget APIs (payload accepted before fix)
- Attempted SSRF via scraper API (blocked ✅)
- Attempted unauthorized embed domain modification (possible before fix)
- Tested authentication bypass on protected routes (blocked ✅)

### Changes Made

#### src/components/ChatWidget.tsx
- **Added DOMPurify** for XSS sanitization
- Markdown-to-HTML conversion now sanitizes output with whitelist:
  ```javascript
  DOMPurify.sanitize(formatted, {
    ALLOWED_TAGS: ['strong', 'em', 'li', 'br', 'ul', 'ol', 'p', 'span'],
    ALLOWED_ATTR: ['class']
  });
  ```

#### server.js - Embed Domains Authentication
- **Added authentication middleware** to `PUT /api/embed-domains/:userId`
- Verifies Bearer token via Supabase auth
- Checks `user.id === userId` to prevent IDOR attacks
- Returns 401/403 for unauthorized requests
- Logs security events for monitoring

#### server.js - Input Sanitization
- **Added `sanitizeInput()` and `sanitizeObject()` helpers**
- Strips HTML tags, `javascript:` protocol, event handlers
- Applied to all widget APIs:
  - `POST /api/widget/lead`
  - `POST /api/widget/session`  
  - `POST /api/widget/interaction`

### Security Audit Report
Full security audit saved to `SECURITY_AUDIT_REPORT.md` with:
- 2 Critical vulnerabilities (local .env exposure advisory, API key restrictions needed)
- 3 High vulnerabilities (fixed in this release)
- 3 Medium vulnerabilities (documented for future)
- 10+ security checks passed

---

## Files Modified (FROZEN)

| File | Changes |
|------|---------|
| `server.js` | Widget-config API + widget data APIs + widget.js CORS + enhanced embed CSP + AUTH on embed domains + input sanitization |
| `src/pages/EmbedPage.tsx` | Calendar connections + all callback handlers |
| `src/services/locationTools.ts` | Improved booking detection logic |
| `src/pages/Integrations.tsx` | Embed domain security UI |
| `src/contexts/DataContext.tsx` | isLoading state + data persistence fix |
| `src/App.tsx` | Dedicated /onboarding route, OnboardingCheck component |
| `src/components/OnboardingWizard.tsx` | Error handling, validation, loading states, auto-advance, address autocomplete |
| `src/pages/KnowledgeBase.tsx` | Widget Studio navigation after onboarding |
| `src/services/geminiService.ts` | Removed mock data fallback, proper error throwing |
| `src/pages/OnboardingPage.tsx` | NEW - Dedicated onboarding page |
| `scraper.js` | Performance optimization (10 pages, 12s timeout, no sitemap) |
| `src/components/ServiceEditor.tsx` | Pricing scan feedback display |
| `src/components/knowledge/KnowledgeData.tsx` | Service objects rendering + fallback UI |
| `src/components/AddressAutocomplete.tsx` | NEW - Google Places PlaceAutocompleteElement API |
| `src/pages/ReviewQueue.tsx` | Save functionality fix |
| `src/components/ChatWidget.tsx` | DOMPurify XSS protection |
| `SECURITY_AUDIT_REPORT.md` | NEW - Full security audit report |

---

## Security Tests

✅ XSS payloads sanitized in chat messages (DOMPurify)
✅ XSS payloads stripped from widget API inputs
✅ Embed domain updates require authentication
✅ IDOR prevented (user can only modify own settings)
✅ SSRF blocked in scraper (localhost, metadata URLs)
✅ Rate limiting on all expensive APIs
✅ Authentication enforced on /dashboard, /superadmin

---

## Fix 14: Review Queue Persistence

> **Added:** January 21, 2026

### Problem Solved
Review Queue corrections (status changes, suggested text) were not being saved to the database. They would disappear after refreshing the page.

### Root Cause
`DataContext.tsx` updated the local `reviewItems` state but lacked a `useEffect` hook to trigger the `syncReviewItems` function to persist these changes to Supabase.

### Changes Made

#### src/contexts/DataContext.tsx
- **Added `syncReviewItems` import**
- **Added `useEffect` hook** to automatically sync changes to `reviewItems` to Supabase (debounced by 2s)
- **Review Items now persist**: Status changes (e.g. to 'CORRECTED') and `suggestedCorrection` text are saved.
- **Sentiments preserved**: The sync function includes the original sentiment analysis in the update, ensuring no data loss.

---

## Files Modified (FROZEN)

| File | Changes |
|------|---------|
| `server.js` | Widget-config API + widget data APIs + widget.js CORS + enhanced embed CSP + AUTH on embed domains + input sanitization |
| `src/pages/EmbedPage.tsx` | Calendar connections + all callback handlers |
| `src/services/locationTools.ts` | Improved booking detection logic |
| `src/pages/Integrations.tsx` | Embed domain security UI |
| `src/contexts/DataContext.tsx` | isLoading state + data persistence fix + **Review Queue Sync** |
| `src/App.tsx` | Dedicated /onboarding route, OnboardingCheck component |
| `src/components/OnboardingWizard.tsx` | Error handling, validation, loading states, auto-advance, address autocomplete |
| `src/pages/KnowledgeBase.tsx` | Widget Studio navigation after onboarding |
| `src/services/geminiService.ts` | Removed mock data fallback, proper error throwing |
| `src/pages/OnboardingPage.tsx` | NEW - Dedicated onboarding page |
| `scraper.js` | Performance optimization (10 pages, 12s timeout, no sitemap) |
| `src/components/ServiceEditor.tsx` | Pricing scan feedback display |
| `src/components/knowledge/KnowledgeData.tsx` | Service objects rendering + fallback UI |
| `src/components/AddressAutocomplete.tsx` | NEW - Google Places PlaceAutocompleteElement API |
| `src/pages/ReviewQueue.tsx` | Save functionality fix |
| `src/components/ChatWidget.tsx` | DOMPurify XSS protection |
| `SECURITY_AUDIT_REPORT.md` | NEW - Full security audit report |

---

## Persistence Tests

✅ Review Queue status updates ('PENDING' -> 'CORRECTED') save to database
✅ Suggested corrections text saves to database
✅ Sentiment data is preserved during updates
✅ Changes persist after page reload

---

## Fix 15: Legal Footer Links

> **Added:** January 22, 2026

### Problem Solved
Login and Trial pages were missing links to Privacy Policy and Terms of Service, which are required for compliance and user trust.

### Changes Made

#### src/pages/FreeTrialPage.tsx
- Updated disclaimer links in the signup form to point to actual `hellochippy.com` policy pages.
- Added a sticky/absolute footer with Privacy and Terms links.

#### src/components/AuthPage.tsx
- Added a sticky/absolute footer with Privacy and Terms links.

---

## Files Modified (FROZEN)

| File | Changes |
|------|---------|
| `server.js` | Widget-config API + widget data APIs + widget.js CORS + enhanced embed CSP + AUTH on embed domains + input sanitization |
| `src/pages/EmbedPage.tsx` | Calendar connections + all callback handlers |
| `src/services/locationTools.ts` | Improved booking detection logic |
| `src/pages/Integrations.tsx` | Embed domain security UI |
| `src/contexts/DataContext.tsx` | isLoading state + data persistence fix + Review Queue Sync |
| `src/App.tsx` | Dedicated /onboarding route, OnboardingCheck component |
| `src/components/OnboardingWizard.tsx` | Error handling, validation, loading states, auto-advance, address autocomplete |
| `src/pages/KnowledgeBase.tsx` | Widget Studio navigation after onboarding |
| `src/services/geminiService.ts` | Removed mock data fallback, proper error throwing |
| `src/pages/OnboardingPage.tsx` | NEW - Dedicated onboarding page |
| `scraper.js` | Performance optimization (10 pages, 12s timeout, no sitemap) |
| `src/components/ServiceEditor.tsx` | Pricing scan feedback display |
| `src/components/knowledge/KnowledgeData.tsx` | Service objects rendering + fallback UI |
| `src/components/AddressAutocomplete.tsx` | NEW - Google Places PlaceAutocompleteElement API |
| `src/pages/ReviewQueue.tsx` | Save functionality fix |
| `src/components/ChatWidget.tsx` | DOMPurify XSS protection |
| `SECURITY_AUDIT_REPORT.md` | NEW - Full security audit report |
| `src/pages/FreeTrialPage.tsx` | Added footer legal links + updated form disclaimer links |
| `src/components/AuthPage.tsx` | Added footer legal links |

---

## Testing Verification

✅ Privacy and Terms links appear on Login page
✅ Privacy and Terms links appear on Trial page
✅ Links open correct URLs in new tab
✅ Styling consistent with dark background (slate-400)


---

## Fix 16: Persistent Memory & Learning

> **Added:** January 25, 2026

### Problem Solved
The AI agent lacked long-term memory. It forgot user details (like name, preferences) between sessions and couldn't "learn" new facts about the business from corrections.

### Root Cause
Chat history was only stored in  (for session) or not at all. There was no vector store mechanism to recall past information.

### Changes Made

#### 1. Database Schema
- **Enabled `pgvector` extension** in Supabase.
- **Created `memories` table**: Stores text segments + 768-dim embeddings.
- **Created `match_memories` RPC function**: Allows semantic similarity search.

#### 2. Backend API (server.js)
- **POST `/api/memory/recall`**: Accepts a query, generates embedding, calls `match_memories` RPC, returns relevant facts.
- **POST `/api/memory/memorize`**: Accepts text, generates embedding, inserts into `memories` table. Use scopes ('session' vs 'global').

#### 3. Frontend Services
- **`src/services/memoryService.ts`**: Client-side wrapper to call the new backend endpoints.
- **`src/services/geminiService.ts`**:
    - **RAG Implementation**: `sendMessage` now attempts to `recall()` relevant memories before generating a response.
    - **Context Injection**: Relevant memories are silently injected into the user's message prompt.
    - **Auto-Learning**: Added `learnFromInteraction` stub (currently logging) to eventualy extract facts.
    - **Context Awareness**: Updated `createAgentSession` to accept `userId` and `sessionId`.

#### 4. UI Integration
- **`src/components/ChatWidget.tsx`**: Passes `userId` (from tenant config) and `sessionId` (from state) to the agent session.

---

## Files Modified (FROZEN)

| File | Changes |
|------|---------|
| `migrations/006_persistent_memory.sql` | NEW - Vector table and match function |
| `server.js` | Added `/api/memory/*` endpoints |
| `src/services/memoryService.ts` | NEW - Client service for memory |
| `src/services/geminiService.ts` | RAG integration in ProxyChatSession |
| `src/components/ChatWidget.tsx` | Passing context to agent session |

---

## Testing Verification

✅ Database migration confirmed (table exists, FK constraints active)
✅ Backend endpoints (/api/memory/recall, /api/memory/memorize) are reachable
✅ Frontend service (memoryService.ts) successfully communicates with backend
✅ RAG Logic integrated into ChatWidget session
✅ Build compiles without errors

---

---

## Fix 17: Production Readiness (Phase 1 & 2)

> **Added:** January 25, 2026

### Problem Solved
The app was missing critical production layers: Transactional Emails and Error Monitoring.

### Changes Made

#### 1. Transactional Emails (Resend)
- **Services**: Created `emailService.js` using `resend` SDK.
- **Backend Integration**: Updated `server.js` to trigger confirmation emails when `/api/calendar/create-event` succeeds.
- **Triggers**: Sends "Booking Confirmed" to User and "New Booking Notification" to Owner.

#### 2. Error Monitoring (Sentry)
- **Dependencies**: Added `@sentry/node`, `@sentry/profiling-node`, `@sentry/react`.
- **Backend**: Configured `server.js` with Sentry v10 `setupExpressErrorHandler`.
- **Frontend**: Configured `src/index.tsx` with Sentry React SDK (Browser Tracing + Replay).

## Files Modified (FROZEN)

| File | Changes |
|------|---------|
| `emailService.js` | NEW - Resend integration |
| `server.js` | Added Email trigger + Sentry init |
| `src/index.tsx` | Added Sentry React init |
| `.env` | Added RESEND_API_KEY and SENTRY_DSN |

---

## Fix 18: Business Analytics (Phase 4)

> **Added:** January 25, 2026

### Problem Solved
Business owners had no visibility into the "Real Value" (ROI) provided by the agent.

### Changes Made
1.  **Database**: Created `bookings` table to track appointment history locally.
2.  **Tracking**: Updated `server.js` to insert booking records into Supabase on successful GCal events.
3.  **Reporting**: Added a weekly Cron Job (Mondays 9am) that counts bookings and emails an ROI report to the owner.

## Files Modified (FROZEN)

| File | Changes |
|------|---------|
| `emailService.js` | Added `sendWeeklyReport` |
| `server.js` | Added Booking Tracking (DB Insert) + Cron Job |
| `migrations/007_analytics.sql` | NEW - Bookings table migration |

---

## Fix 19: Top Rules (Priority AI Instructions)

> **Added:** January 27, 2026

### Feature Added
Users can now provide "Top Rules" - priority instructions that their AI will always follow in customer interactions.

### Use Case
Business owners can customize AI behavior with rules like:
- "Always greet customers warmly"
- "Never discuss competitor pricing"
- "Prioritize booking appointments over general chat"
- "Always confirm the service before booking"

### Changes Made

#### src/types.ts
- **Added `topRules?: string`** field to `KnowledgeBaseData` interface

#### src/components/knowledge/KnowledgeData.tsx
- **Added `TopRulesSection` component** with:
  - Highlighted card design (coral gradient border for visibility)
  - Edit/save functionality
  - Text area for entering one rule per line
  - Numbered list display when viewing
  - Hint text recommending max 10 rules
- **Added `ListChecks` icon** from lucide-react

#### src/components/ChatWidget.tsx
- **Parses `topRules`** from knowledgeSummary JSON
- **Injects rules into AI system prompt** as "🎯 TOP PRIORITY RULES (MUST FOLLOW)"
- Rules appear after corrections in the prompt hierarchy

### Storage
- Data stored in **`knowledge_bases` table** (Supabase)
- `topRules` is part of the `content` JSONB column
- No database schema changes required

---

## Files Modified (FROZEN)

| File | Changes |
|------|---------|
| `src/types.ts` | Added `topRules` field to KnowledgeBaseData |
| `src/components/knowledge/KnowledgeData.tsx` | TopRulesSection component + ListChecks icon |
| `src/components/ChatWidget.tsx` | Top Rules injection into AI system prompt |

---

## Testing Verification

✅ Build compiles without errors
✅ Top Rules section appears in Knowledge Base → Knowledge Data tab
✅ Rules can be edited and saved
✅ Rules are formatted as numbered list when viewing
✅ Rules persist to database via existing knowledge sync
✅ Rules are injected into AI system prompt

---
