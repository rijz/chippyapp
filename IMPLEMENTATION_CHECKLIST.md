# Multi-Location Implementation Checklist

## ✅ Completed

### Database & Schema
- [x] Created migration file `migrations/003_multi_location_support.sql`
- [x] Added `location_id` to leads table
- [x] Modified `calendar_connections` for multi-calendar support
- [x] Added location metadata fields
- [x] Created database indexes for performance

### Types & Interfaces
- [x] Added `locationId` and `locationName` to Lead interface
- [x] Created CalendarConnection interface
- [x] Updated CalendarSettings with connections array
- [x] Maintained backward compatibility

### Services & APIs
- [x] Created `calendarConnections.ts` service
- [x] Implemented CRUD operations for calendars
- [x] Added plan limit checking functions
- [x] Created helper utilities

### Data Management
- [x] Extended DataContext with calendar connections
- [x] Added `calendarConnections` state
- [x] Updated usage calculation for calendars
- [x] Implemented `canAddMoreCalendars()` helper
- [x] Auto-refresh calendar connections on login

### UI Components
- [x] Created MultiLocationCalendarManager component
- [x] Added location filter to Leads page
- [x] Updated Integrations page layout
- [x] Added location badges to lead rows
- [x] Implemented inline editing for calendars

### Plan Enforcement
- [x] Starter plan: 1 calendar limit
- [x] Growth plan: 3 calendar limit
- [x] Advanced plan: 5+ calendar limit
- [x] Visual indicators for limits
- [x] Upgrade prompts when limit reached

### Documentation
- [x] Created implementation summary
- [x] Generated architecture diagram
- [x] Added code comments
- [x] Created usage examples

## 🔧 Setup Required

### 1. Database Migration
**Priority: HIGH - Must complete before testing**

```bash
# Go to Supabase Dashboard
# Navigate to: SQL Editor
# Copy contents from: migrations/003_multi_location_support.sql
# Run the migration
```

**Verification:**
```sql
-- Check if columns were added
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'calendar_connections' 
AND column_name IN ('location_id', 'calendar_name', 'display_order', 'metadata');

-- Should return 4 rows
```

### 2. Test Data Setup
**Priority: MEDIUM - Needed for testing**

1. **Add Test Locations:**
   - Navigate to: Knowledge Base → Business Locations
   - Add 2-3 test locations
   - Example: "Downtown Office", "Northside Branch"

2. **Connect Test Calendar:**
   - Navigate to: Integrations
   - Click "Add Calendar"
   - Connect your Google Calendar
   - Assign to a location
   - Set appointment duration

3. **Create Test Leads:**
   - Use the AI chat widget
   - Create 3-4 test appointments
   - Assign different locations
   - Test filtering

### 3. Environment Configuration
**Priority: LOW - May already be configured**

Ensure these are set in your `.env` file:
```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

## 🔄 Integration Points

### Widget Booking Flow
**Status: NEEDS UPDATE**

The booking widget needs to be updated to:
1. Detect multiple locations
2. Ask user to select location
3. Pass `locationId` when creating leads
4. Use location-specific calendar for booking

**Implementation Guide:**
See `src/hooks/useLocationSelection.tsx` for ready-to-use utilities:
- `useLocationSelection()` - Hook for location management
- `LocationPickerMessage` - UI component for location selection
- `bookAtLocation()` - Helper for location-based booking

**Example Update to Widget:**
```typescript
import { useLocationSelection } from '../hooks/useLocationSelection';

// In your booking component:
const { locations, selectedLocation, setSelectedLocation, hasMultipleLocations } = 
  useLocationSelection(knowledgeData?.locations, calendarConnections);

// Before showing time slots:
if (hasMultipleLocations && !selectedLocation) {
  return <LocationPickerMessage 
    locations={locations} 
    onSelect={setSelectedLocation} 
  />;
}

// When booking:
const result = await bookAtLocation(
  selectedLocation.id,
  datetime,
  leadData,
  calendarConnections
);
```

### Backend API Updates
**Status: MAY NEED UPDATE**

Verify these endpoints support `locationId`:

1. **POST /api/calendar/book**
   ```typescript
   // Should accept and use locationId
   {
     calendarId: string,
     datetime: string,
     customer: {...},
     locationId: string,  // <-- Add this
     locationName: string // <-- Add this
   }
   ```

2. **GET /api/calendar/availability**
   ```typescript
   // Should filter by location's calendar
   {
     calendarId: string,  // Use calendar from location
     date: string
   }
   ```

3. **POST /api/leads/create**
   ```typescript
   // Should save locationId
   {
     ...leadData,
     locationId: string,  // <-- Add this
     locationName: string // <-- Add this
   }
   ```

## 🧪 Testing Scenarios

### Scenario 1: Single Location Business
**Expected Behavior:**
- Location dropdown doesn't show (only 1 location)
- Calendar can be assigned to that location
- All leads show that location
- No location selection in widget (auto-assigned)

**Test Steps:**
1. Add 1 location in Knowledge Base
2. Connect 1 calendar, assign to location
3. Create appointment via widget
4. Verify lead has location assigned

### Scenario 2: Multi-Location Business (Starter Plan)
**Expected Behavior:**
- Can add 1 calendar only
- "Add Calendar" button disabled after 1
- Warning shown about plan limits
- Prompt to upgrade to Growth plan

**Test Steps:**
1. Set subscription to "Starter" in DataContext
2. Try to add 2nd calendar
3. Verify error message
4. Verify upgrade prompt shows

### Scenario 3: Multi-Location Business (Growth Plan)
**Expected Behavior:**
- Can add up to 3 calendars
- Each calendar assignable to different location
- Location filter works in Leads view
- Appointments routed to correct calendar

**Test Steps:**
1. Set subscription to "Growth"
2. Add 3 locations
3. Connect 3 calendars, one per location
4. Create appointments at each location
5. Use location filter to view by location
6. Export CSV and verify location column

### Scenario 4: Plan Limit Enforcement
**Expected Behavior:**
- Usage counter updates in real-time
- Cannot exceed plan limit
- Overage costs calculated correctly
- Clear messaging about limits

**Test Steps:**
1. Check usage in Account page
2. Verify calendar count matches active connections
3. Try to exceed limit
4. Check overage calculation (if applicable)

## 📊 Monitoring & Metrics

After deployment, monitor:

### Usage Metrics
- Number of locations per business
- Calendar connections per user
- Plan distribution (Starter/Growth/Advanced)
- Upgrade rate from calendar limits

### Performance Metrics
- Calendar connection query time
- Lead filter performance
- Location dropdown load time

### Error Tracking
- Failed calendar connections
- Location assignment errors
- Plan limit violations
- Booking failures by location

## 🐛 Common Issues & Solutions

### Issue: Calendar connections not loading
**Solution:**
```typescript
// Check if refreshData is being called
useEffect(() => {
  refreshData();
}, [session?.user?.id]);

// Verify fetchCalendarConnections in DataContext
const connections = await fetchCalendarConnections(userId);
console.log('Loaded connections:', connections);
```

### Issue: Location filter not working
**Solution:**
```typescript
// Ensure locationId format matches
// Knowledge Base uses: 'loc-0', 'loc-1', etc.
// Calendar connections should use same format
locationId: 'loc-0'  // ✅ Correct
locationId: 'location-1'  // ❌ Wrong
```

### Issue: Plan limits not enforced
**Solution:**
```typescript
// Check PLAN_DETAILS in types.ts
export const PLAN_DETAILS = {
  Starter: {
    limits: { calendars: 1 },  // Verify this
    ...
  }
}

// Verify subscription.plan is set
console.log('Current plan:', subscription.plan);
```

### Issue: Migration fails
**Solution:**
```sql
-- Check if table exists
SELECT * FROM calendar_connections LIMIT 1;

-- If column already exists, skip that part
-- Or use: DROP COLUMN IF EXISTS first

-- Check constraints
SELECT conname FROM pg_constraint 
WHERE conrelid = 'calendar_connections'::regclass;
```

## 🚀 Deployment Steps

1. **Merge to staging branch**
2. **Run database migration** (one-time)
3. **Deploy frontend code**
4. **Test in staging environment**
5. **Update backend APIs** (if needed)
6. **Deploy to production**
7. **Monitor for errors**
8. **Communicate changes to users**

## 📝 User Communication

### Email Template for Existing Users:
```
Subject: 🎉 New Feature: Multi-Location Support!

Hi [User],

We're excited to announce multi-location calendar support!

What's New:
✅ Connect separate calendars for each location
✅ Filter appointments by location
✅ Better organize your multi-location business

Getting Started:
1. Add your locations in Knowledge Base
2. Connect calendars in Integrations
3. Assign each calendar to a location

Need help? Reply to this email or check our guide: [link]

[Plan-specific limits apply]
```

## 🎯 Success Criteria

Implementation is complete when:
- [ ] Migration runs without errors
- [ ] Can add/edit/delete calendar connections
- [ ] Plan limits are enforced correctly
- [ ] Location filter works in Leads view
- [ ] Location badges show on lead rows
- [ ] Widget booking flow includes location selection
- [ ] No console errors in browser
- [ ] All TypeScript compiles without errors
- [ ] Tests pass (if applicable)
- [ ] Documentation is complete

---

**Last Updated:** 2026-01-08
**Version:** 1.0.0
**Status:** Ready for Testing
