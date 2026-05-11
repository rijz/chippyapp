import { SkillDefinition } from './types';

export const CORE_SKILLS: SkillDefinition[] = [
  {
    id: 'appointment-reminders',
    name: 'Appointment Reminders',
    version: '1.0',
    triggers: ['booking.created', 'booking.updated'],
    requiredData: ['customer.phone', 'booking.start_at'],
    permissions: {
      requiresMarketingConsent: false,
      channels: ['sms', 'email']
    },
    schedule: [
      { offset: '-24h' },
      { offset: '-2h' }
    ],
    guardrails: ['quiet_hours', 'opt_out', 'booking_status_active'],
    action: 'send_reminder'
  },
  {
    id: 'post-service-feedback',
    name: 'Post-Service Feedback',
    version: '1.0',
    triggers: ['booking.completed'],
    requiredData: ['customer.email'],
    permissions: {
      requiresMarketingConsent: false,
      channels: ['email', 'sms']
    },
    schedule: [
      { offset: '+2h' }
    ],
    guardrails: ['opt_out'],
    action: 'send_feedback_request'
  },
  {
    id: 'review-request',
    name: 'Review Request',
    version: '1.0',
    triggers: ['feedback.received'],
    requiredData: ['feedback.sentiment'],
    permissions: {
      requiresMarketingConsent: false,
      channels: ['email', 'sms']
    },
    guardrails: ['positive_sentiment_only', 'opt_out'],
    action: 'send_review_request'
  },
  {
    id: 'daily-admin-report',
    name: 'Daily Admin Report',
    version: '1.0',
    triggers: ['report.daily'],
    requiredData: [],
    permissions: {
      requiresMarketingConsent: false,
      channels: ['email']
    },
    schedule: [
      { cron: '0 7 * * *' }
    ],
    guardrails: [],
    action: 'send_admin_report'
  },
  {
    id: 'weekly-admin-report',
    name: 'Weekly Admin Report',
    version: '1.0',
    triggers: ['report.weekly'],
    requiredData: [],
    permissions: {
      requiresMarketingConsent: false,
      channels: ['email']
    },
    schedule: [
      { cron: '0 9 * * 1' }
    ],
    guardrails: [],
    action: 'send_admin_report'
  },
  {
    id: 'new-lead-followup',
    name: 'New Lead Follow-Up',
    version: '1.0',
    triggers: ['lead.created', 'lead.unbooked'],
    requiredData: ['customer.phone'],
    permissions: {
      requiresMarketingConsent: false,
      channels: ['sms', 'email']
    },
    schedule: [
      { offset: '+10m' },
      { offset: '+24h' }
    ],
    guardrails: ['quiet_hours', 'opt_out', 'owner_approval_for_high_risk'],
    action: 'send_lead_followup'
  },
  {
    id: 'unbooked-consult-recovery',
    name: 'Unbooked Consult Recovery',
    version: '1.0',
    triggers: ['lead.unbooked', 'lead.replied'],
    requiredData: ['customer.phone'],
    permissions: {
      requiresMarketingConsent: false,
      channels: ['sms', 'email']
    },
    schedule: [
      { offset: '+1h' },
      { offset: '+2d' }
    ],
    guardrails: ['quiet_hours', 'opt_out', 'consult_required_for_medical_advice'],
    action: 'send_consult_recovery'
  },
  {
    id: 'stale-lead-reactivation',
    name: 'Stale Lead Reactivation',
    version: '1.0',
    triggers: ['lead.followup_due'],
    requiredData: ['customer.phone'],
    permissions: {
      requiresMarketingConsent: true,
      channels: ['sms', 'email']
    },
    schedule: [
      { offset: '+30d' }
    ],
    guardrails: ['quiet_hours', 'opt_out', 'owner_approval_for_bulk'],
    action: 'send_reactivation'
  }
];
