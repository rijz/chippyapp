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
✅ Address autocomplete fills city/state/zip

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
✅ Widget can be embedded on any website

