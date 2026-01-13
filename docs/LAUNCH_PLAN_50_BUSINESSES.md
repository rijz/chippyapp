# 🚀 Chippy Launch Plan: Onboarding 50 Local Businesses

> **Goal:** Onboard 50 local businesses as "Founding Members" for the Chippy AI launch
> **Timeline:** 4-6 weeks
> **Created:** January 13, 2026

---

## 📊 Executive Summary

This plan outlines the strategy to acquire and onboard 50 local businesses as founding members. These early adopters will:
- Get exclusive pricing (50% off forever)
- Receive priority support and onboarding
- Help shape product features through feedback

---

## 🎯 Phase 1: Preparation (Week 1)

### 1.1 Technical Readiness
- [x] Enhanced signup flow with compelling value props
- [x] Added full name, business name fields
- [x] Confirm password + password strength indicator
- [x] "Founding Member" urgency messaging
- [ ] Set up analytics to track signups by source
- [ ] Prepare onboarding email sequence (5 emails)
- [ ] Create in-app guided tour for new users

### 1.2 Target Business Segments
Focus on businesses that:
1. **Receive high volume of inquiries** (10+ calls/day)
2. **Miss calls regularly** (lead loss pain point)
3. **Rely on appointments** (booking = clear ROI)

**Priority Verticals:**
| Vertical | Why Chippy Fits | Target # |
|----------|-----------------|----------|
| Auto Repair Shops | Constant calls, scheduling needs | 10 |
| Dental/Medical Offices | Appointment-heavy, busy staff | 10 |
| Salons & Spas | High booking volume, personalization | 8 |
| HVAC/Plumbing | Emergency calls, 24/7 need | 8 |
| Real Estate Agents | Inquiry-heavy, lead capture | 7 |
| Fitness Studios | Class bookings, membership questions | 7 |

### 1.3 Prepare Marketing Assets
- [ ] 1-page PDF: "Why Chippy for [Vertical]"
- [ ] 2-minute demo video
- [ ] Case study template (fill as you onboard)
- [ ] LinkedIn/Facebook ad creatives
- [ ] Email templates for outreach

---

## 📣 Phase 2: Outreach Campaigns (Weeks 2-4)

### 2.1 Warm Outreach (Target: 15 businesses)
**Your Network:**
- Friends & family with businesses
- LinkedIn connections
- Local business associations you're part of

**Script:**
> "Hey [Name], I'm launching an AI assistant that handles calls, texts, and books appointments for local businesses 24/7. Looking for 50 founding members to get 50% off forever. Would you be open to a 10-min demo?"

### 2.2 Cold Outreach (Target: 20 businesses)
**Local Business Lists:**
- Google Maps scraping (by vertical + city)
- Yelp business directories
- Local Chamber of Commerce

**Outreach Channels:**
1. **Email** - Find emails via Hunter.io or Snov.io
2. **LinkedIn** - DM business owners
3. **Phone** - Cold call during off-peak hours
4. **Walk-in** - Visit local businesses (high conversion)

**Email Template:**
```
Subject: Save 10+ hours/week on missed calls? 🤖

Hi [Name],

I noticed [Business Name] on Google and saw you get great reviews. Quick question—are you still answering every inquiry yourself or with staff?

I built Chippy, an AI assistant that:
✅ Answers calls/texts 24/7 (sounds human)
✅ Books appointments directly on your calendar
✅ Captures leads when you're busy

We're launching with 50 founding members who get 50% off forever.

Want a quick 10-min demo? No pitch—just showing you what it does.

– Rijesh
Founder, Chippy
```

### 2.3 Paid Ads (Target: 15 businesses)
**Budget:** $500-1000 for 4 weeks

**Platforms:**
- Facebook/Instagram (local business targeting)
- Google Ads (search: "ai receptionist for small business")
- LinkedIn (target: "owner" + "small business" + local area)

**Ad Copy:**
> "Never miss a lead again. Chippy answers calls, books appointments, and captures leads 24/7. Founding members get 50% off forever. Only 50 spots available."

---

## 🤝 Phase 3: Onboarding Process (Ongoing)

### 3.1 Signup → Onboarding Flow
1. **Day 0:** User signs up on FreeTrialPage
2. **Day 0:** Confirmation email with next steps
3. **Day 0-1:** Auto-onboarding wizard runs (URL → scan → widget setup)
4. **Day 1:** Welcome call from you (10 min)
5. **Day 1-3:** User embeds widget on their site
6. **Day 7:** Check-in email + feedback request
7. **Day 14:** Trial ends → convert to paid

### 3.2 White-Glove Onboarding (First 20)
For the first 20 signups, offer:
- 30-min personal setup call
- Help embed widget on their website
- Custom knowledge base training
- Direct Slack/WhatsApp support

### 3.3 Self-Serve Onboarding (Later 30)
- In-app wizard handles setup
- Video tutorials in Knowledge Base
- Chat support via Intercom/email

---

## 📈 Phase 4: Tracking & Metrics

### 4.1 Key Metrics to Track
| Metric | Week 1 Target | Week 4 Target |
|--------|---------------|---------------|
| Signups | 10 | 50 |
| Onboarding Started | 8 | 45 |
| Onboarding Completed | 5 | 40 |
| Widget Embedded | 4 | 35 |
| Paid Conversion | 1 | 25 |

### 4.2 Tracking Tools
- **Signups:** Supabase dashboard + custom analytics
- **Onboarding:** Track step completion in DB
- **Conversion:** Stripe dashboard
- **Feedback:** Typeform/Google Forms survey

### 4.3 Spots Counter
Update the `spotsRemaining` variable in `FreeTrialPage.tsx` as businesses signup:
```tsx
const spotsRemaining = 47; // Update this manually for now
```

**Later:** Automate this by counting users in Supabase who signed up with the founding member flow.

---

## 💰 Phase 5: Pricing Strategy

### 5.1 Founding Member Pricing
| Plan | Regular Price | Founding Price | Notes |
|------|---------------|----------------|-------|
| Starter | $99/mo | $49/mo forever | Up to 100 AI conversations |
| Growth | $199/mo | $99/mo forever | Up to 500 AI conversations |
| Pro | $399/mo | $199/mo forever | Unlimited + priority support |

### 5.2 Pricing Urgency Tactics
- "Only X spots left" counter (already implemented ✅)
- "Founding Member perks" section (already implemented ✅)
- Deadline: "Closes Jan 31" (add if needed)

---

## 📝 Phase 6: Feedback Loop

### 6.1 Weekly Feedback Sessions
- Schedule 2-3 calls per week with active users
- Focus on: What's working? What's confusing? What's missing?
- Log all feedback in a Notion board

### 6.2 Quick Wins to Build
Based on early feedback, prioritize:
1. Bugs that block usage
2. Onboarding friction points
3. Highly-requested features (easy wins)

### 6.3 Testimonial Collection
After 2 weeks of successful usage:
> "Hey [Name], you've been using Chippy for 2 weeks now. Would you be open to a quick 2-minute testimonial video or written quote we can use on our website?"

---

## ✅ Launch Checklist

### Technical
- [x] Signup form with all fields
- [x] Password strength indicator
- [x] Confirm password validation
- [x] User metadata saved (full_name, business_name)
- [x] Build compiles without errors
- [ ] Email confirmation flow tested
- [ ] Onboarding wizard tested end-to-end
- [ ] Widget embed tested on external domain

### Marketing
- [ ] Demo video recorded
- [ ] 1-pager for each vertical
- [ ] Email sequences written
- [ ] LinkedIn banner updated
- [ ] Social posts scheduled

### Operations
- [ ] Support email set up (support@hellochippy.com)
- [ ] Calendly link for onboarding calls
- [ ] Feedback form created
- [ ] Tracking spreadsheet ready

---

## 🕐 Weekly Action Plan

### Week 1
- Finalize marketing assets
- Reach out to warm network (15 businesses)
- Start cold outreach (5/day)

### Week 2
- Continue cold outreach
- Launch paid ads
- First 10 onboarding calls

### Week 3
- Optimize ads based on data
- Double down on best outreach channel
- Collect first testimonials

### Week 4
- Push to hit 50 signups
- Convert trials to paid
- Document learnings for future

---

## 💡 Pro Tips

1. **Over-communicate:** Send weekly updates to founding members
2. **Be responsive:** Reply to every message within 2 hours
3. **Ask for referrals:** Each happy customer = 2 more leads
4. **Celebrate wins:** Share on social when a business goes live
5. **Stay lean:** Don't over-engineer; focus on closing deals

---

## 📞 Quick Pitch (30 seconds)

> "Chippy is an AI assistant that answers calls, texts, and books appointments for local businesses—24/7, sounding completely human. Customers don't know it's AI. We're launching with 50 founding members who get 50% off forever. Interested in a quick demo?"

---

Good luck with the launch! 🚀
