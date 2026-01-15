# 🔒 FROZEN CHANGES - DO NOT MODIFY WITHOUT APPROVAL

> **Last Updated:** January 15, 2026
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

## Files Modified (FROZEN)

| File | Changes |
|------|---------|
| `server.js` | Widget-config API + 3 new widget data APIs |
| `src/pages/EmbedPage.tsx` | Calendar connections + all callback handlers |
| `src/services/locationTools.ts` | Improved booking detection logic |
| `src/pages/Integrations.tsx` | Embed domain security UI |
| `src/contexts/DataContext.tsx` | Added isLoading state for onboarding trigger |
| `src/App.tsx` | Dedicated /onboarding route, OnboardingCheck component |
| `src/components/OnboardingWizard.tsx` | Error handling, validation, loading states |
| `src/pages/KnowledgeBase.tsx` | Widget Studio navigation after onboarding |
| `src/services/geminiService.ts` | Removed mock data fallback, proper error throwing |
| `src/pages/OnboardingPage.tsx` | NEW - Dedicated onboarding page |
| `scraper.js` | Performance optimization (10 pages, 12s timeout, no sitemap) |

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

### Scraper Performance Tests
✅ Scans complete in 30-60 seconds for most websites
✅ Essential pages (homepage, pricing, services, about, contact, faq) are prioritized
✅ Timeout still handled gracefully with user-friendly error message

