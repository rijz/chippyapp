import { createClient } from '@supabase/supabase-js';

function normalizeLead(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || null,
    email: row.email || null,
    phone: row.phone || null,
    status: row.status || null,
    source: row.source || null,
    serviceInterest: row.service || row.service_interest || row.serviceInterest || null,
    locationId: row.location_id || null,
    locationName: row.location_name || null,
    notes: row.notes || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function normalizeEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  return value || null;
}

export class SupabaseStorageAdapter {
  constructor({ url, serviceRoleKey } = {}) {
    this.url = url || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
    this.serviceRoleKey = serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    this.client = null;
  }

  isConfigured() {
    return Boolean(this.url && this.serviceRoleKey);
  }

  getClient() {
    if (!this.isConfigured()) return null;
    if (this.client) return this.client;
    this.client = createClient(this.url, this.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    return this.client;
  }

  async lookupLead({ tenantId, leadId, email } = {}) {
    const client = this.getClient();
    if (!client) {
      return {
        lead: null,
        source: 'supabase',
        warning: 'supabase_not_configured',
      };
    }

    const tenant = String(tenantId || '').trim();
    if (!tenant) {
      return {
        lead: null,
        source: 'supabase',
        warning: 'missing_tenant_id',
      };
    }

    try {
      let query = client
        .from('leads')
        .select('id, name, email, phone, status, source, service, location_id, location_name, notes, created_at, updated_at')
        .eq('user_id', tenant)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (leadId) {
        query = query.eq('id', String(leadId));
      } else if (email) {
        query = query.eq('email', normalizeEmail(email));
      }

      const { data, error } = await query;
      if (error) {
        return {
          lead: null,
          source: 'supabase',
          warning: error.message || 'supabase_lookup_failed',
        };
      }

      if (!Array.isArray(data) || data.length === 0) {
        return {
          lead: null,
          source: 'supabase',
        };
      }

      return {
        lead: normalizeLead(data[0]),
        source: 'supabase',
      };
    } catch (error) {
      return {
        lead: null,
        source: 'supabase',
        warning: error.message || 'supabase_lookup_exception',
      };
    }
  }
}

