# Quick Reference: Multi-Location Booking System

## 📋 Quick Start Checklist

### 1. Database (5 min)
```bash
# Run in Supabase SQL Editor:
migrations/003_multi_location_support.sql
```

### 2. Add Test Data (2 min)
- Go to Knowledge Base → Locations
- Add 2-3 test locations
- Example: "Downtown Office", "Northside Clinic"

### 3. Connect Calendars (3 min)
- Go to Integrations
- Click "Add Calendar" for each location
- Assign to location in dropdown

### 4. Update Widget (15 min)
- Follow: `WIDGET_MULTI_LOCATION_GUIDE.md`
- Add location props to ChatWidget
- Import location tools
- Update system prompt

### 5. Update Backend (30 min)
- Add `locationId`, `calendarId`, `providerEmail` to API endpoints
- Route calendar operations to correct calendar
- Save location data with bookings

### 6. Test (10 min)
- Single location: Should work unchanged
- Multi-location: Ask for location
- Address input: Find closest
- Verify booking goes to right calendar

**Total Time: ~65 minutes**

---

## 🎯 Key Concepts

### Location ID Format
```javascript
'loc-0'  // First location in knowledge base
'loc-1'  // Second location
'loc-2'  // Third location
```

### Data Flow
```
Customer Address
  ↓ (geocode)
Coordinates (lat, lng)
  ↓ (calculate distance)
Sorted Locations by Distance
  ↓ (select closest)
Suggested Location
  ↓ (customer confirms)
Location ID (e.g., 'loc-1')
  ↓ (find calendar)
Calendar Connection for Location
  ↓ (book appointment)
Event in Location's Calendar + Lead with Location
```

### Plan Limits
```typescript
Starter:  1 calendar  ❌ Multi-location blocked
Growth:   3 calendars ✅ Up to 3 locations
Advanced: 5 calendars ✅ 5+ locations
```

---

## 💬 Example Conversations

### ✅ Good Flow (Address Provided)
```
User: "I need an appointment"
AI: "We have 3 locations. Which works best, or tell me your address?"
User: "I'm at 123 Oak Street"
AI: "Closest is Northside (2 mi). Book there?"
User: "Yes"
AI: "Checking Northside availability..."
```

### ✅ Good Flow (Direct Choice)
```
User: "Book me at downtown"
AI: "Checking Downtown Office availability..."
```

### ❌ Bad Flow (Would Happen Without This System)
```
User: "I need an appointment"
AI: "Sure! Available times tomorrow at 2pm, 3pm..."
User: "Which location?"
AI: "😬 Uh..." [Doesn't know]
```

---

## 🔧 Files Reference

### Core Logic
- `src/services/locationTools.ts` - Distance, geocoding, closest finder
- `src/services/calendarTools.ts` - Booking with location routing
- `src/hooks/useLocationSelection.tsx` - React hooks for locations

### UI Components
- `src/components/MultiLocationCalendarManager.tsx` - Calendar management
- `src/pages/Leads.tsx` - Location filtering
- `src/components/ChatWidget.tsx` - [NEEDS UPDATE] Location selection

### Data Layer
- `src/contexts/DataContext.tsx` - Calendar connections state
- `src/types.ts` - Type definitions
- `migrations/003_multi_location_support.sql` - Database schema

### Documentation
- `WIDGET_MULTI_LOCATION_GUIDE.md` - Implementation guide
- `MULTI_LOCATION_SUMMARY.md` - Full overview
- `IMPLEMENTATION_CHECKLIST.md` - Testing & deployment

---

## 🐛 Common Issues

### Issue: Geocoding fails
**Solution:** User address too vague. AI asks: "Could you provide a full address with city and state?"

### Issue: No calendar for location  
**Solution:** Error message: "No calendar configured for that location. Please contact support."

### Issue: Plan limit reached
**Solution:** "Calendar limit reached (2/3). Upgrade to Advanced for 5+ calendars."

### Issue: Location filter shows no results
**Solution:** No leads have that locationId. Expected if it's a new location.

---

## 📱 API Endpoints

### Check Availability (Updated)
```typescript
POST /api/calendar/availability
{
  userId: string,
  startTime: string,
  endTime: string,
  provider: string,
  locationId?: string,      // NEW
  calendarId?: string,      // NEW
  providerEmail?: string    // NEW
}
```

### Book Appointment (Updated)
```typescript
POST /api/calendar/create-event
{
  userId: string,
  summary: string,
  description: string,
  startTime: string,
  endTime: string,
  attendees: string[],
  timezone: string,
  provider: string,
  locationId?: string,      // NEW
  locationName?: string,    // NEW
  calendarId?: string,      // NEW
  providerEmail?: string    // NEW
}
```

---

## 🎨 UI Elements

### Location Badge (Leads Table)
```tsx
{lead.locationName && (
  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
    <MapPin className="w-3 h-3" />
    {lead.locationName}
  </span>
)}
```

### Location Filter
```tsx
<select value={selectedLocationId} onChange={...}>
  <option value="all">All Locations</option>
  {locations.map((loc, idx) => (
    <option value={`loc-${idx}`}>{loc.name}</option>
  ))}
</select>
```

---

## 📊 Analytics Queries

### Bookings Per Location
```sql
SELECT location_name, COUNT(*) as bookings
FROM leads
WHERE status = 'Booked'
GROUP BY location_name
ORDER BY bookings DESC;
```

### Average Response Time by Location
```sql
SELECT location_name, AVG(response_time_minutes) 
FROM leads
GROUP BY location_name;
```

### Conversion Rate by Location
```sql
SELECT 
  location_name,
  COUNT(*) as total_leads,
  SUM(CASE WHEN status = 'Booked' THEN 1 ELSE 0 END) as booked,
  ROUND(100.0 * SUM(CASE WHEN status = 'Booked' THEN 1 ELSE 0 END) / COUNT(*), 2) as conversion_rate
FROM leads
WHERE location_name IS NOT NULL
GROUP BY location_name;
```

---

## ⚡ Performance Tips

1. **Geocoding**: Cache results for common addresses
2. **Distance Calc**: Pre-geocode locations on load
3. **Calendar Queries**: Batch availability checks where possible
4. **Location Filter**: Index on `location_id` column (already done)

---

## 🚀 Launch Day

### Pre-Launch
- [ ] Run migration
- [ ] Add real locations
- [ ] Connect calendars for each
- [ ] Test booking end-to-end
- [ ] Verify plan limits work

### Launch
- [ ] Deploy frontend
- [ ] Deploy backend
- [ ] Monitor error logs
- [ ] Watch first bookings

### Post-Launch (Week 1)
- [ ] Check geocoding success rate
- [ ] Review location distribution
- [ ] Gather user feedback
- [ ] Optimize based on data

---

## 🎓 Key Learning

**The Magic**: Customer says "I'm at 100 Main St" → AI instantly knows nearest location (0.5 miles) → Books to right calendar → Zero manual work

**The Benefit**: Reduces friction, increases conversions, provides rich analytics

**The Result**: Happy customers, organized bookings, scalable growth 🎉

---

**Need Help?** Check the detailed docs:
- `MULTI_LOCATION_IMPLEMENTATION.md` - Architecture
- `WIDGET_MULTI_LOCATION_GUIDE.md` - Widget integration  
- `MULTI_LOCATION_SUMMARY.md` - Full overview
