# Multi-Location Chat Widget Integration Guide

## Overview
This guide explains how to update the ChatWidget to support multi-location booking with address-based location suggestions.

## Changes Required

### 1. Update ChatWidget Props

Add location data to the props:

```typescript
interface ChatWidgetProps {
  tenantConfig: TenantConfig;
  widgetConfig: WidgetConfig;
  knowledgeSummary: string;
  // ... existing props ...
  
  // NEW: Add these props
  locations?: BusinessLocation[];
  calendarConnections?: CalendarConnection[];
}
```

### 2. Import Location Tools

Add to imports at top of ChatWidget.tsx:

```typescript
import { LOCATION_TOOL, executeFindClosestLocation, get LocationSelectionPrompt } from '../services/locationTools';
```

### 3. Update Tool Context

Modify the `toolContext` in `initChat()` function (around line 318):

```typescript
const toolContext: ToolContext = {
  userId: tenantConfig.userId,
  timezone: 'America/New_York',
  companyName: tenantConfig.companyName,
  onCallbackRequest: onCallbackRequest,
  // ADD THESE:
  calendarConnections: calendarConnections?.map(c => ({
    id: c.id,
    locationId: c.locationId,
    locationName: c.locationName,
    providerEmail: c.providerEmail,
    calendarId: c.calendarId,
    isActive: c.isActive
  })),
  locations: locations?.map(loc => ({
    name: loc.name,
    address: loc.address,
    city: loc.city,
    state: loc.state,
    zip: loc.zip
  }))
};
```

### 4. Add Location Tool to Tools Array

Update the `createAgentSession` call (around line 363):

```typescript
const allTools = [
  CALENDAR_TOOLS,
  { functionDeclarations: [LOCATION_TOOL] }
];

const session = await createAgentSession(
  systemInstruction, 
  allTools,  // Changed from [CALENDAR_TOOLS]
  toolExecutor
);
```

### 5. Update Tool Executor

Modify the `toolExecutor` function to handle location tool:

```typescript
const toolExecutor = async (name: string, args: any) => {
  // Existing status messages
  const statusMessages: Record<string, string> = {
    'get_available_slots': '🔍 Finding open spots...',
    'book_appointment': '📅 Booking your appointment...',
    'cancel_appointment': '❌ Canceling appointment...',
    'reschedule_appointment': '🔄 Rescheduling...',
    'request_callback': '📞 Submitting callback request...',
    'find_closest_location': '📍 Finding closest location...',  // NEW
  };
  
  setStatusMessage(statusMessages[name] || '🔄 Processing...');
  
  // Handle location tool
  if (name === 'find_closest_location') {
    const result = await executeFindClosestLocation(args, locations || []);
    setStatusMessage('');
    return result;
  }
  
  // Existing calendar tools
  const result = await executeCalendarTool(name, args, toolContext);
  setStatusMessage('');
  
  // ... rest of existing code ...
};
```

### 6. Update System Prompt

Add location instructions to the `systemInstruction` (around line 239):

```typescript
const systemInstruction = `
  You are an intelligent booking agent for "${tenantConfig.companyName}".
  
  CURRENT DATE AND TIME:
  Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
  Current time is ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.
  
  ${userInfoContext}

  KNOWLEDGE BASE:
  ${structuredInfo}
  
  ${correctionsInfo}
  
  ${getLocationSelectionPrompt(locations || [], calendarConnections || [])}  // ADD THIS LINE
  
  CONTACT COLLECTION RULES:
  ... rest of existing prompt ...
`;
```

### 7. Update Parent Components

In any component that renders ChatWidget (e.g., `EmbedPage.tsx`, `WidgetStudio.tsx`):

```typescript
import { useData } from '../contexts/DataContext';

function ParentComponent() {
  const { 
    tenantConfig, 
    widgetConfig, 
    knowledgeData,
    calendarConnections,  // NEW
    // ... other context values
  } = useData();

  return (
    <ChatWidget
      tenantConfig={tenantConfig}
      widgetConfig={widgetConfig}
      knowledgeSummary={JSON.stringify(knowledgeData)}
      locations={knowledgeData?.locations}  // NEW
      calendarConnections={calendarConnections}  // NEW
      onBookingComplete={handleBooking}
      onCallbackRequest={handleCallback}
      // ... other props
    />
  );
}
```

## User Flow Example

### Scenario 1: User with Address

**User:** "I'd like to book an appointment"

**AI:** "Great! We have 3 locations:
1. **Downtown Office** - 123 Main St, Springfield, IL
2. **Northside Clinic** - 456 North Ave, Springfield, IL  
3. **West Branch** - 789 West Blvd, Springfield, IL

Which location works best for you? Or, tell me your address and I can suggest the closest one."

**User:** "I'm at 100 Main Street, Springfield"

**AI:** *[Calls find_closest_location tool]*
"Based on your address, the closest location is:

**Downtown Office** - About 0.5 miles away
📍 123 Main St, Springfield, IL 62701

Would you like to book at Downtown Office?"

**User:** "Yes"

**AI:** *[Calls get_available_slots with location_id='loc-0']*
"Perfect! Let me check availability at Downtown Office..."

### Scenario 2: User Chooses Directly

**User:** "I'd like to book at your Northside location"

**AI:** *[Calls get_available_slots with location_id='loc-1']*
"Great choice! Checking availability at Northside Clinic..."

### Scenario 3: Single Location

**User:** "I need an appointment"

**AI:** *[No location selection needed - auto-uses loc-0]*
"Of course! We're located at Downtown Office - 123 Main St. Let me check what times we have available..."

## Backend API Updates Needed

Your backend API endpoints should now accept and use these parameters:

### `/api/calendar/availability`
```typescript
{
  userId: string,
  startTime: string,
  endTime: string,
  provider: string,
  locationId?: string,  // NEW - route to specific calendar
  calendarId?: string,  // NEW - specific calendar ID
  providerEmail?: string  // NEW - calendar owner email
}
```

### `/api/calendar/create-event`
```typescript
{
  userId: string,
  summary: string,
  description: string,
  startTime: string,
  endTime: string,
  attendees: string[],
  timezone: string,
  provider: string,
  locationId?: string,  // NEW
  locationName?: string,  // NEW  
  calendarId?: string,  // NEW
  providerEmail?: string  // NEW
}
```

The backend should:
1. If `calendarId` and `providerEmail` are provided, use those
2. Otherwise, fall back to user's primary calendar
3. Save `locationId` and `locationName` with the lead/booking

## Testing Checklist

- [ ] Single location business: No location selection prompt
- [ ] Multi-location: Shows location options
- [ ] Address input: Finds closest location
- [ ] Location selection: Routes to correct calendar
- [ ] Booking confirmation: Includes location name
- [ ] Leads table: Shows location badge
- [ ] CSV export: Includes location column

## Migration Notes

- Existing bookings without location continue to work
- New bookings automatically save location data
- AI prompts dynamically adjust based on location count
- Geocoding uses free OpenStreetMap (can upgrade to Google Maps API)

## Error Handling

The system gracefully handles:
- ✅ Invalid addresses (asks user to clarify)
- ✅ Geocoding failures (shows all locations as fallback)
- ✅ Missing calendar for location (error message with support contact)
- ✅ Locations without active calendars (filters them out)

---

**Implementation Time:** ~30 minutes
**Difficulty:** Medium
**Breaking Changes:** None (backward compatible)
