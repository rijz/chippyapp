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
  }
];
