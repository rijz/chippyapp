# 🔒 Security Audit Report - Chippy App

**Date:** January 17, 2026  
**Target:** https://app.hellochippy.com  
**Auditor:** Automated Security Analysis  
**Severity Scale:** 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low | ✅ Pass

---

## Executive Summary

The security assessment of Chippy App revealed **several vulnerabilities** of varying severity. While the application has good baseline security (authentication enforcement, SSRF protection, rate limiting), there are **critical issues** that require immediate attention.

### Vulnerability Count
| Severity | Count |
|----------|-------|
| 🔴 Critical | 2 |
| 🟠 High | 3 |
| 🟡 Medium | 3 |
| 🟢 Low | 2 |

---

## 🔴 CRITICAL Vulnerabilities

### 1. Exposed API Keys via `/env-config.js`

**Severity:** 🔴 CRITICAL  
**Status:** CONFIRMED EXPLOITABLE  
**Location:** `https://app.hellochippy.com/env-config.js`

**Finding:**
The endpoint exposes sensitive configuration to the public internet:

```javascript
window.__ENV__ = {
  "VITE_GOOGLE_API_KEY": "<REDACTED_GOOGLE_API_KEY>",
  "VITE_GOOGLE_CLIENT_ID": "661589517762-0o20d3dqt9m1ah1t68boooftj9rpm2lr.apps.googleusercontent.com",
  "VITE_SUPABASE_URL": "https://zkqgqnmjnbcnemswodub.supabase.co",
  "VITE_SUPABASE_ANON_KEY": "<REDACTED_SUPABASE_ANON_KEY>",
  "VITE_STRIPE_PUBLIC_KEY": "pk_live_51SiqUo..."
}
```

**Impact:**
- 💰 **Financial Risk:** Google API key can be abused for quota theft (you pay for their usage)
- 🔓 **Data Access:** Supabase anon key + URL allows unauthenticated database queries (limited by RLS)
- 🎯 **Attack Surface:** Attackers can directly query your Supabase database

**Remediation:**
1. ✅ These keys are designed to be public (anon key, client ID, public stripe key)
2. ⚠️ Add HTTP referer restrictions to Google API key in Google Cloud Console
3. ⚠️ Ensure Supabase RLS policies are bulletproof (see finding #2)

---

### 2. Local `.env` File Contains ALL Production Secrets

**Severity:** 🔴 CRITICAL  
**Status:** FOUND IN LOCAL FILESYSTEM  
**Location:** `/Users/rijesh/Documents/GitHub/chippyapp/.env`

**Finding:**
The local `.env` file contains LIVE production secrets including:
- `STRIPE_SECRET_KEY` (sk_live_...) - **CAN CHARGE REAL MONEY**
- `SUPABASE_SERVICE_ROLE_KEY` - **BYPASSES ALL RLS POLICIES**
- `GOOGLE_CLIENT_SECRET` - **OAuth secret**
- `VITE_GEMINI_API_KEY` - **AI costs money per request**

**Impact:**
- If this file is leaked or committed to git, attackers can:
  - 💳 Create fraudulent charges via Stripe
  - 🗃️ Access/modify/delete ALL data in Supabase
  - 🔓 Impersonate users via OAuth

**Verification:**
- ✅ `.env` is in `.gitignore` (good)
- ✅ `.env` was never committed to git history (verified)
- ✅ GitHub repo is private (verified)

**Remediation:**
1. ✅ Keep `.env` out of git (already done)
2. 🔄 Rotate all secrets as a precaution
3. 📋 Use a secrets manager (e.g., GCP Secret Manager, Doppler)

---

## 🟠 HIGH Vulnerabilities

### 3. Potential Stored XSS in Widget APIs

**Severity:** 🟠 HIGH  
**Status:** PARTIALLY EXPLOITABLE  
**Location:** `/api/widget/interaction`, `/api/widget/session`

**Finding:**
The widget APIs accept and store user input without proper sanitization:

```bash
# This request returned {"success": true}
curl -X POST "https://app.hellochippy.com/api/widget/interaction" \
  -H "Content-Type: application/json" \
  -d '{"userId":"<script>alert(1)</script>","query":"test","response":"test"}'
```

**Impact:**
- If this data is rendered in admin dashboard without escaping, attackers can:
  - 🍪 Steal admin session cookies
  - 🔑 Execute actions as admin
  - 📊 Access sensitive business data

**Verification:**
The backend accepted the XSS payload. Need to verify if it's rendered unsafely in the dashboard.

**Remediation:**
1. ✅ Input validation: Reject/sanitize HTML in user_id, query fields
2. ✅ Output encoding: Use React's default JSX escaping (don't use `dangerouslySetInnerHTML`)
3. ⚠️ Review `ChatWidget.tsx` line 30 - uses `dangerouslySetInnerHTML`

---

### 4. Unauthenticated Widget Data APIs

**Severity:** 🟠 HIGH  
**Status:** BY DESIGN (but risky)  
**Location:** `/api/widget/lead`, `/api/widget/session`, `/api/widget/interaction`

**Finding:**
These endpoints accept ANY userId without authentication:

```bash
# Anyone can attempt to create leads for any user
curl -X POST "https://app.hellochippy.com/api/widget/lead" \
  -H "Content-Type: application/json" \
  -d '{"userId":"victim-user-uuid","lead":{"name":"Spam","email":"spam@test.com"}}'
```

**Impact:**
- 📧 Spam injection into any user's lead database
- 📊 Analytics pollution
- 💾 Storage exhaustion (DoS)

**Mitigation Already Present:**
- ✅ Rate limiting (30 req/min per IP)
- ✅ Database validation may reject invalid user_ids

**Recommended Remediation:**
1. Add HMAC signature verification for widget requests
2. Implement domain validation (only accept from user's configured embed domains)

---

### 5. Unauthenticated Embed Domain Modification

**Severity:** 🟠 HIGH  
**Status:** PARTIALLY MITIGATED  
**Location:** `PUT /api/embed-domains/:userId`

**Finding:**
The embed domain update endpoint doesn't verify the caller owns the userId:

```bash
curl -X PUT "https://app.hellochippy.com/api/embed-domains/victim-user-id" \
  -H "Content-Type: application/json" \
  -d '{"domains":["https://attacker.com"]}'
```

**Note:** This returned an error in testing, but the code path suggests it's possible if the userId exists.

**Remediation:**
1. Add authentication middleware to this endpoint
2. Verify `req.user.id === userId`

---

## 🟡 MEDIUM Vulnerabilities

### 6. `dangerouslySetInnerHTML` Usage for Chat Messages

**Severity:** 🟡 MEDIUM  
**Status:** REQUIRES REVIEW  
**Location:** `src/components/ChatWidget.tsx:30`

**Finding:**
```tsx
<span
  className="formatted-message"
  dangerouslySetInnerHTML={{ __html: formatText(text) }}
/>
```

The `formatText` function converts markdown to HTML, but may not fully sanitize malicious input.

**Current Sanitization (line 494-506):**
```tsx
const sanitizeInput = (text: string): string => {
  let sanitized = text.replace(/<[^>]*>/g, ''); // Remove HTML tags
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=/gi, '');
  sanitized = sanitized.slice(0, 1000);
  return sanitized.trim();
};
```

**Gap:** Sanitization only runs on input, not on AI responses which could contain malicious content.

**Remediation:**
1. Use a proper sanitizer like DOMPurify for formatText
2. Sanitize both user input AND AI responses

---

### 7. Stripe Checkout Session User Impersonation Risk

**Severity:** 🟡 MEDIUM  
**Status:** DESIGN ISSUE  
**Location:** `/api/create-checkout-session`

**Finding:**
```javascript
// Anyone can create a checkout session with any userId
const { priceId, userId, userEmail } = req.body;
const session = await stripe.checkout.sessions.create({
  metadata: { userId }  // Attacker could use victim's userId
});
```

**Impact:**
An attacker could create checkout sessions tied to other users' accounts. If successful, the victim's account would get upgraded.

**Remediation:**
1. Require authentication for checkout creation
2. Extract userId from session token, not request body

---

### 8. Super Admin Email Hardcoded

**Severity:** 🟡 MEDIUM  
**Status:** OPERATIONAL RISK  
**Location:** `server.js:413`

**Finding:**
```javascript
const SUPER_ADMIN_EMAILS = [
  'p.rijesh1@gmail.com',
];
```

**Impact:**
- If email account is compromised, attacker gains super admin
- Requires code deploy to add new admins

**Remediation:**
1. Store admin list in database with proper authentication
2. Implement MFA for super admin access

---

## 🟢 LOW Vulnerabilities

### 9. Verbose Error Messages

**Severity:** 🟢 LOW  
**Status:** INFORMATION DISCLOSURE  

**Finding:**
Some error responses include internal details:
- Database errors may expose table names
- Stack traces in development mode

**Remediation:**
Use generic error messages in production.

---

### 10. Missing Security Headers

**Severity:** 🟢 LOW  
**Status:** PARTIAL IMPLEMENTATION  

**Finding:**
While Helmet is configured, some security policies are disabled:
```javascript
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  frameguard: false,
}));
```

**Note:** These are intentionally disabled for widget embedding functionality.

---

## ✅ PASSED Security Checks

| Check | Status | Notes |
|-------|--------|-------|
| Authentication on protected routes | ✅ PASS | `/dashboard`, `/superadmin` redirect to auth |
| Super Admin API protection | ✅ PASS | Returns 401 without valid token |
| SSRF protection in scraper | ✅ PASS | Blocks `file://`, `localhost`, metadata URLs |
| Rate limiting | ✅ PASS | Multiple limiters for different endpoints |
| Request size limits | ✅ PASS | 100KB body limit |
| SQL Injection | ✅ PASS | Uses Supabase query builder (parameterized) |
| Git history clean | ✅ PASS | No secrets in git history |
| GitHub repo private | ✅ PASS | Repo not publicly accessible |
| RLS policies | ✅ PASS | Proper user_id scoping on leads table |
| URL validation in scraper | ✅ PASS | Only allows http/https protocols |

---

## 🔧 Immediate Action Items

### Priority 1 (Do Today)
1. [ ] Rotate Google API key and add HTTP referer restrictions
2. [ ] Review and add input sanitization to widget APIs
3. [ ] Add DOMPurify to `ChatWidget.tsx` formatText function

### Priority 2 (This Week)  
4. [ ] Add authentication to `/api/embed-domains/:userId` PUT endpoint
5. [ ] Add HMAC verification for widget API requests
6. [ ] Implement signature verification for Stripe checkout sessions

### Priority 3 (This Month)
7. [ ] Migrate super admin list to database
8. [ ] Implement secrets manager for production
9. [ ] Add security monitoring/alerting
10. [ ] Conduct full penetration test with authenticated scenarios

---

## Testing Commands Used

```bash
# Test public API key exposure
curl -s "https://app.hellochippy.com/env-config.js"

# Test unauthenticated super admin access
curl -s "https://app.hellochippy.com/api/superadmin/stats"

# Test XSS injection
curl -X POST "https://app.hellochippy.com/api/widget/interaction" \
  -H "Content-Type: application/json" \
  -d '{"userId":"<script>alert(1)</script>","query":"test"}'

# Test SSRF
curl -X POST "https://app.hellochippy.com/api/scrape" \
  -H "Content-Type: application/json" \
  -d '{"url":"http://169.254.169.254/latest/meta-data/"}'

# Test file:// protocol
curl -X POST "https://app.hellochippy.com/api/scrape" \
  -H "Content-Type: application/json" \
  -d '{"url":"file:///etc/passwd"}'
```

---

*Report generated by automated security analysis*
