
import { supabase } from './supabaseClient';
import { KnowledgeBaseData, TenantConfig, WidgetConfig, CalendarSettings, ChatSessionRecord, ReviewItem, ChartDataPoint, Lead } from '../types';

/**
 * Uploads a file to the 'knowledge-assets' Supabase Storage bucket.
 * Returns the public URL of the uploaded file.
 */
export const uploadKnowledgeAsset = async (file: File, userId: string): Promise<string | null> => {
  try {
    // Sanitize filename to prevent issues
    const fileExt = file.name.split('.').pop();
    const safeName = file.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
    const filePath = `${userId}/${Date.now()}_${safeName}`;

    // 1. Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('knowledge-assets')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) throw uploadError;

    // 2. Get Public URL
    const { data } = supabase.storage
      .from('knowledge-assets')
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (error) {
    console.error('Supabase Storage Upload Error:', error);
    // Return null to allow the app to continue gracefully without the remote file
    return null;
  }
};

/**
 * KNOWLEDGE BASE SYNC
 */
export const syncKnowledgeBase = async (data: KnowledgeBaseData, userId: string) => {
  try {
    const { error } = await supabase
      .from('knowledge_bases')
      .upsert({
        user_id: userId,
        content: data,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) throw error;
  } catch (error) {
    console.error('Knowledge Sync Error:', error);
  }
};

export const fetchKnowledgeBase = async (userId: string): Promise<KnowledgeBaseData | null> => {
  try {
    const { data, error } = await supabase
      .from('knowledge_bases')
      .select('content')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data?.content || null;
  } catch (error) {
    console.error('Knowledge Fetch Error:', error);
    return null;
  }
};

export const deleteKnowledgeBase = async (userId: string) => {
  try {
    // Use upsert with null content instead of delete
    // This bypasses RLS delete restrictions while effectively clearing the data
    const { error } = await supabase
      .from('knowledge_bases')
      .upsert({
        user_id: userId,
        content: null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) throw error;
    console.log('[Supabase] Knowledge base cleared for user:', userId);
  } catch (error) {
    console.error('Knowledge Delete Error:', error);
  }
};

/**
 * SETTINGS SYNC (Tenant, Widget, Calendar)
 */
export const syncSettings = async (
  userId: string,
  tenantConfig: TenantConfig,
  widgetConfig: WidgetConfig,
  calendarSettings: CalendarSettings | null
) => {
  try {
    const { error } = await supabase
      .from('settings')
      .upsert({
        user_id: userId,
        tenant_config: tenantConfig,
        widget_config: widgetConfig,
        calendar_settings: calendarSettings,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) throw error;
  } catch (error) {
    console.error('Settings Sync Error:', error);
  }
};

export const fetchSettings = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Settings Fetch Error:', error);
    return null;
  }
};

/**
 * CHAT SESSIONS SYNC
 */
export const syncChatSessions = async (sessions: ChatSessionRecord[], userId: string) => {
  // Upsert each session individually
  // In a real high-scale app, we might just sync the changed ones, 
  // but for MVP we iterate the list.
  try {
    const records = sessions.map(s => ({
      id: s.id,
      user_id: userId,
      customer_name: s.customerName,
      messages: s.messages,
      summary: s.summary,
      type: s.type,
      sentiment: s.sentiment,
      status: s.status,
      created_at: s.timestamp
    }));

    const { error } = await supabase
      .from('chat_sessions')
      .upsert(records, { onConflict: 'id' });

    if (error) throw error;
  } catch (error) {
    console.error('Chat Sync Error:', error);
  }
};

export const fetchChatSessions = async (userId: string): Promise<ChatSessionRecord[]> => {
  try {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      customerName: row.customer_name,
      messages: row.messages,
      summary: row.summary,
      type: row.type as any,
      sentiment: row.sentiment as any,
      status: row.status as any,
      timestamp: new Date(row.created_at)
    }));
  } catch (error) {
    console.error('Chat Fetch Error:', error);
    return [];
  }
}

/**
 * REVIEW QUEUE SYNC
 */
export const syncReviewItems = async (items: ReviewItem[], userId: string) => {
  try {
    const records = items.map(item => ({
      id: item.id,
      user_id: userId,
      query: item.query,
      response: item.response,
      confidence: item.confidence,
      sentiment: item.sentiment,
      topics: item.topics,
      status: item.status,
      suggested_correction: item.suggestedCorrection,
      created_at: item.timestamp
    }));

    const { error } = await supabase
      .from('review_items')
      .upsert(records, { onConflict: 'id' });

    if (error) throw error;
  } catch (error) {
    console.error('Review Sync Error:', error);
  }
};

export const fetchReviewItems = async (userId: string): Promise<ReviewItem[]> => {
  try {
    const { data, error } = await supabase
      .from('review_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      query: row.query,
      response: row.response,
      confidence: row.confidence,
      sentiment: row.sentiment as any,
      topics: row.topics,
      status: row.status as any,
      suggestedCorrection: row.suggested_correction,
      timestamp: new Date(row.created_at)
    }));
  } catch (error) {
    console.error('Review Fetch Error:', error);
    return [];
  }
}

/**
 * ANALYTICS SYNC
 */
export const syncAnalytics = async (userId: string, dashboardData: ChartDataPoint[], totalChats: number, totalBookings: number) => {
  try {
    const { error } = await supabase
      .from('analytics')
      .upsert({
        user_id: userId,
        dashboard_data: dashboardData,
        total_chats: totalChats,
        total_bookings: totalBookings,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) throw error;
  } catch (error) {
    console.error('Analytics Sync Error:', error);
  }
};

export const fetchAnalytics = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('analytics')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Analytics Fetch Error:', error);
    return null;
  }
};

/**
 * LEADS SYNC
 */
export const syncLeads = async (leads: Lead[], userId: string) => {
  try {
    // Upsert each lead
    const records = leads.map(lead => ({
      id: lead.id,
      user_id: userId,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      status: lead.status,
      source: lead.source,
      notes: lead.notes,
      created_at: typeof lead.date === 'string' ? lead.date : lead.date.toISOString(),
      updated_at: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('leads')
      .upsert(records, { onConflict: 'id' });

    if (error) throw error;
  } catch (error) {
    console.error('Leads Sync Error:', error);
  }
};

export const fetchLeads = async (userId: string): Promise<Lead[] | null> => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (data) {
      // Map database fields back to Lead interface
      return data.map(row => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        status: row.status,
        source: row.source,
        date: new Date(row.created_at),
        notes: row.notes || ''
      }));
    }
    return null;
  } catch (error) {
    console.error('Leads Fetch Error:', error);
    return null;
  }
};
