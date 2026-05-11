const DEFAULT_ON_SKILLS = new Set(['appointment-reminders', 'daily-admin-report', 'weekly-admin-report']);

const getValueAtPath = (payload, path) => {
  if (!payload || !path) return undefined;
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), payload);
};

const hasRequiredData = (payload, requiredData = []) => {
  return requiredData.every(path => {
    const value = getValueAtPath(payload, path);
    return value !== undefined && value !== null && value !== '';
  });
};

const hasReminderContact = (payload = {}) => {
  const customer = payload?.customer && typeof payload.customer === 'object' ? payload.customer : {};
  const email = typeof customer.email === 'string' ? customer.email.trim() : '';
  const phone = typeof customer.phone === 'string' ? customer.phone.trim() : '';
  return Boolean(email || phone);
};

const resolveReminderDelivery = (payload = {}) => {
  const customer = payload?.customer && typeof payload.customer === 'object' ? payload.customer : {};
  const email = typeof customer.email === 'string' ? customer.email.trim() : '';
  const phone = typeof customer.phone === 'string' ? customer.phone.trim() : '';
  const customerName = typeof customer.name === 'string' && customer.name.trim()
    ? customer.name.trim()
    : 'Customer';

  if (email) {
    return { channel: 'email', target: email, customerName };
  }

  if (phone) {
    return { channel: 'sms', target: phone, customerName };
  }

  return { channel: null, target: '', customerName };
};

const daysAgoDate = (days) => {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return since;
};

export const createBdlProcessor = ({
  supabaseAdmin,
  emailService,
  fetchKnowledgeBase,
  getBusinessHoursForDate,
  parseHoursRange,
  isWithinBusinessHours,
  logger = console
} = {}) => {
  if (!supabaseAdmin) throw new Error('createBdlProcessor requires supabaseAdmin');
  if (!emailService) throw new Error('createBdlProcessor requires emailService');
  if (typeof fetchKnowledgeBase !== 'function') throw new Error('createBdlProcessor requires fetchKnowledgeBase');
  if (typeof getBusinessHoursForDate !== 'function') throw new Error('createBdlProcessor requires getBusinessHoursForDate');
  if (typeof parseHoursRange !== 'function') throw new Error('createBdlProcessor requires parseHoursRange');
  if (typeof isWithinBusinessHours !== 'function') throw new Error('createBdlProcessor requires isWithinBusinessHours');

  const isSkillDefaultOn = (skillId) => DEFAULT_ON_SKILLS.has(skillId);

  const isSkillActive = async (tenantId, skillId) => {
    const { data, error } = await supabaseAdmin
      .from('skill_subscriptions')
      .select('status')
      .eq('tenant_id', tenantId)
      .eq('skill_id', skillId)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('[BDL] Skill lookup error:', error);
      return false;
    }

    if (!data) return isSkillDefaultOn(skillId);
    return data.status === 'active';
  };

  const getHoursTextForDate = (knowledge, date) => {
    if (knowledge?.businessHoursByDay) {
      return getBusinessHoursForDate(date, knowledge.businessHoursByDay);
    }
    return knowledge?.businessHours || null;
  };

  const getNextBusinessOpenTime = (fromDate, knowledge) => {
    if (!fromDate) return null;
    for (let offset = 0; offset < 7; offset += 1) {
      const candidate = new Date(fromDate);
      candidate.setDate(candidate.getDate() + offset);
      const hoursText = getHoursTextForDate(knowledge, candidate);
      if (!hoursText) continue;
      const range = parseHoursRange(hoursText);
      if (!range) continue;

      const candidateMinutes = candidate.getHours() * 60 + candidate.getMinutes();
      if (offset === 0 && candidateMinutes >= range.start && candidateMinutes <= range.end) {
        return candidate;
      }

      if (offset === 0 && candidateMinutes < range.start) {
        const nextOpen = new Date(candidate);
        nextOpen.setHours(Math.floor(range.start / 60), range.start % 60, 0, 0);
        return nextOpen;
      }

      if (offset > 0) {
        const nextOpen = new Date(candidate);
        nextOpen.setHours(Math.floor(range.start / 60), range.start % 60, 0, 0);
        return nextOpen;
      }
    }
    return null;
  };

  const deferJobForQuietHours = async (job, knowledge) => {
    const executeAt = job.execute_at ? new Date(job.execute_at) : new Date();
    const hoursText = getHoursTextForDate(knowledge, executeAt);
    if (!hoursText) return false;
    if (isWithinBusinessHours(executeAt, hoursText)) return false;

    const nextOpen = getNextBusinessOpenTime(executeAt, knowledge);
    if (!nextOpen) return false;

    await supabaseAdmin
      .from('bdl_jobs')
      .update({ status: 'queued', execute_at: nextOpen.toISOString() })
      .eq('id', job.id);
    return true;
  };

  const updateBdlJobStatus = async (jobId, status) => {
    const { error } = await supabaseAdmin
      .from('bdl_jobs')
      .update({ status })
      .eq('id', jobId);

    if (error) {
      logger.error(`[BDL] Failed to set job ${jobId} status=${status}:`, error);
    }
  };

  const claimBdlJob = async (jobId) => {
    const { data, error } = await supabaseAdmin
      .from('bdl_jobs')
      .update({ status: 'running' })
      .eq('id', jobId)
      .eq('status', 'queued')
      .select('id')
      .maybeSingle();

    if (error) {
      logger.error(`[BDL] Job claim error for ${jobId}:`, error);
      return false;
    }

    return Boolean(data?.id);
  };

  const getTenantOwnerEmail = async (tenantId) => {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(tenantId);
    if (error) {
      logger.error(`[BDL] Failed to load owner email for tenant ${tenantId}:`, error);
      return null;
    }
    return data?.user?.email || null;
  };

  const countTenantRowsSince = async ({ tenantId, table, since }) => {
    const { count, error } = await supabaseAdmin
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', tenantId)
      .gte('created_at', since.toISOString());

    if (error) {
      logger.error(`[BDL] Count query failed tenant=${tenantId} table=${table}:`, error);
      return 0;
    }

    return count || 0;
  };

  const executeAppointmentReminderJob = async (job) => {
    const delivery = resolveReminderDelivery(job.payload || {});
    if (delivery.channel === 'email') {
      await emailService.sendAppointmentReminder(delivery.target, delivery.customerName, {
        startTime: job.payload?.start_at,
        service: job.payload?.service
      });
      return;
    }

    if (delivery.channel === 'sms') {
      logger.warn(
        `[BDL] SMS reminder requested but SMS transport is not configured. job=${job.id} tenant=${job.tenant_id} target=${delivery.target}`
      );
      return;
    }

    throw new Error(`No reminder delivery channel resolved for job ${job.id}`);
  };

  const executeDailyAdminReportJob = async (job) => {
    const ownerEmail = await getTenantOwnerEmail(job.tenant_id);
    if (!ownerEmail) return;

    const since = daysAgoDate(1);
    const [bookings, leads, chats] = await Promise.all([
      countTenantRowsSince({ tenantId: job.tenant_id, table: 'bookings', since }),
      countTenantRowsSince({ tenantId: job.tenant_id, table: 'leads', since }),
      countTenantRowsSince({ tenantId: job.tenant_id, table: 'chat_sessions', since })
    ]);

    await emailService.sendDailyReport(ownerEmail, { bookings, leads, chats });
  };

  const executeWeeklyAdminReportJob = async (job) => {
    const ownerEmail = await getTenantOwnerEmail(job.tenant_id);
    if (!ownerEmail) return;

    const since = daysAgoDate(7);
    const [bookings, leads] = await Promise.all([
      countTenantRowsSince({ tenantId: job.tenant_id, table: 'bookings', since }),
      countTenantRowsSince({ tenantId: job.tenant_id, table: 'leads', since })
    ]);

    await emailService.sendWeeklyReport(ownerEmail, { bookings, leads });
  };

  const BDL_JOB_HANDLERS = {
    'appointment-reminder': executeAppointmentReminderJob,
    'daily-admin-report': executeDailyAdminReportJob,
    'weekly-admin-report': executeWeeklyAdminReportJob
  };

  const BDL_JOB_DEFINITIONS = {
    'appointment-reminder': {
      skillId: 'appointment-reminders',
      requiredData: ['start_at'],
      guardrails: ['quiet_hours'],
      validatePayload: (payload = {}) => hasRequiredData(payload, ['start_at']) && hasReminderContact(payload)
    },
    'daily-admin-report': {
      skillId: 'daily-admin-report',
      requiredData: [],
      guardrails: []
    },
    'weekly-admin-report': {
      skillId: 'weekly-admin-report',
      requiredData: [],
      guardrails: []
    }
  };

  const enqueueBdlJob = async (tenantId, type, executeAt, payload, idempotencyKey) => {
    const { error } = await supabaseAdmin
      .from('bdl_jobs')
      .insert({
        tenant_id: tenantId,
        type,
        execute_at: executeAt,
        status: 'queued',
        payload,
        idempotency_key: idempotencyKey
      });

    if (error && error.code !== '23505') {
      logger.error('[BDL] Job enqueue error:', error);
    }
  };

  const processBdlEvents = async () => {
    try {
      const since = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
      const { data: events, error } = await supabaseAdmin
        .from('bdl_events')
        .select('id, tenant_id, type, occurred_at, payload')
        .gte('occurred_at', since)
        .order('occurred_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      if (!events || events.length === 0) return;

      for (const event of events) {
        if (event.type === 'booking.created') {
          const active = await isSkillActive(event.tenant_id, 'appointment-reminders');
          if (!active) continue;

          const startAt = event.payload?.start_at || event.payload?.startAt;
          if (!startAt) continue;

          const startTime = new Date(startAt);
          const offsets = [
            { label: '24h', ms: 24 * 60 * 60 * 1000 },
            { label: '2h', ms: 2 * 60 * 60 * 1000 }
          ];

          for (const offset of offsets) {
            const executeAt = new Date(startTime.getTime() - offset.ms).toISOString();
            if (new Date(executeAt) < new Date()) continue;

            await enqueueBdlJob(
              event.tenant_id,
              'appointment-reminder',
              executeAt,
              {
                booking_id: event.payload?.booking_id,
                customer: event.payload?.customer,
                service: event.payload?.service,
                location_id: event.payload?.location_id,
                start_at: startAt
              },
              `${event.id}:appointment-reminder:${offset.label}`
            );
          }
        }

        if (event.type === 'report.daily') {
          const active = await isSkillActive(event.tenant_id, 'daily-admin-report');
          if (!active) continue;

          await enqueueBdlJob(
            event.tenant_id,
            'daily-admin-report',
            event.occurred_at,
            { date: event.payload?.date || event.occurred_at },
            `${event.id}:daily-admin-report`
          );
        }

        if (event.type === 'report.weekly') {
          const active = await isSkillActive(event.tenant_id, 'weekly-admin-report');
          if (!active) continue;

          await enqueueBdlJob(
            event.tenant_id,
            'weekly-admin-report',
            event.occurred_at,
            { date: event.payload?.date || event.occurred_at },
            `${event.id}:weekly-admin-report`
          );
        }
      }
    } catch (error) {
      logger.error('[BDL] Event processor error:', error);
    }
  };

  const processBdlJobs = async () => {
    try {
      const { data: jobs, error } = await supabaseAdmin
        .from('bdl_jobs')
        .select('*')
        .eq('status', 'queued')
        .lte('execute_at', new Date().toISOString())
        .order('execute_at', { ascending: true })
        .limit(20);

      if (error) throw error;
      if (!jobs || jobs.length === 0) return;

      for (const job of jobs) {
        const claimed = await claimBdlJob(job.id);
        if (!claimed) continue;

        try {
          const definition = BDL_JOB_DEFINITIONS[job.type];
          if (!definition) {
            await updateBdlJobStatus(job.id, 'failed');
            continue;
          }

          const active = await isSkillActive(job.tenant_id, definition.skillId);
          if (!active) {
            await updateBdlJobStatus(job.id, 'completed');
            continue;
          }

          const payloadValid = typeof definition.validatePayload === 'function'
            ? definition.validatePayload(job.payload || {})
            : hasRequiredData(job.payload || {}, definition.requiredData);

          if (!payloadValid) {
            await updateBdlJobStatus(job.id, 'failed');
            continue;
          }

          const knowledge = await fetchKnowledgeBase(job.tenant_id);
          if (definition.guardrails.includes('quiet_hours')) {
            const deferred = await deferJobForQuietHours(job, knowledge);
            if (deferred) continue;
          }

          const handler = BDL_JOB_HANDLERS[job.type];
          if (!handler) {
            await updateBdlJobStatus(job.id, 'failed');
            continue;
          }
          await handler(job);

          await updateBdlJobStatus(job.id, 'completed');
        } catch (jobErr) {
          logger.error('[BDL] Job execution error:', jobErr);
          await updateBdlJobStatus(job.id, 'failed');
        }
      }
    } catch (error) {
      logger.error('[BDL] Job processor error:', error);
    }
  };

  return {
    isSkillActive,
    isSkillDefaultOn,
    processBdlEvents,
    processBdlJobs
  };
};
