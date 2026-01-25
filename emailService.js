import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

// Lazy init function
const getResendClient = () => {
    if (!process.env.RESEND_API_KEY) return null;
    return new Resend(process.env.RESEND_API_KEY);
};

const FROM_EMAIL = 'Chippy <notifications@hellochippy.com>'; // Or 'onboarding@resend.dev' for testing

export const emailService = {
    /**
     * Send a booking confirmation to the user (patient/client)
     */
    async sendBookingConfirmation(toEmail, customerName, details) {
        const resend = getResendClient();
        if (!resend) {
            console.warn('[Email] Skipping email (No API Key)');
            return;
        }

        try {
            const { data, error } = await resend.emails.send({
                from: FROM_EMAIL,
                to: [toEmail],
                subject: 'Appointment Confirmed via Chippy',
                html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Appointment Confirmed! ✅</h2>
            <p>Hi ${customerName},</p>
            <p>Your appointment has been successfully scheduled.</p>
            
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Date:</strong> ${new Date(details.startTime).toLocaleDateString()}</p>
              <p><strong>Time:</strong> ${new Date(details.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              <p><strong>Service:</strong> ${details.description || 'Consultation'}</p>
            </div>

            <p>Need to reschedule? Reply to this email or visit our website.</p>
            <p>Best,<br>The Team</p>
          </div>
        `
            });

            if (error) throw error;
            console.log(`[Email] Booking confirmation sent to ${toEmail}`);
            return data;
        } catch (error) {
            console.error('[Email] Failed to send booking confirmation:', error);
        }
    },

    /**
     * Send a notification to the business owner about a new lead/booking
     */
    async sendOwnerNotification(ownerEmail, type, data) {
        if (!process.env.RESEND_API_KEY) return;

        try {
            const subject = type === 'booking' ? '🎉 New Booking Received!' : '🔔 New Lead Captured';

            await resend.emails.send({
                from: FROM_EMAIL,
                to: [ownerEmail],
                subject: subject,
                html: `
          <div style="font-family: sans-serif;">
            <h3>${subject}</h3>
            <p>You have a new interaction from your AI Agent.</p>
            
            <ul>
              <li><strong>Name:</strong> ${data.customerName || 'Unknown'}</li>
              <li><strong>Email:</strong> ${data.customerEmail}</li>
              <li><strong>Phone:</strong> ${data.customerPhone || 'N/A'}</li>
              ${data.startTime ? `<li><strong>Time:</strong> ${new Date(data.startTime).toLocaleString()}</li>` : ''}
              ${data.description ? `<li><strong>Notes:</strong> ${data.description}</li>` : ''}
            </ul>

            <a href="https://app.hellochippy.com/dashboard" style="display: inline-block; background: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View in Dashboard</a>
          </div>
        `
            });
            console.log(`[Email] Owner notification sent to ${ownerEmail}`);
        } catch (error) {
            console.error('[Email] Failed to send owner notification:', error);
        }
    },

    /**
     * Send weekly analytics report to business owner
     */
    async sendWeeklyReport(ownerEmail, stats) {
        if (!process.env.RESEND_API_KEY) return;
        const resend = getResendClient();
        if (!resend) return;

        try {
            await resend.emails.send({
                from: FROM_EMAIL,
                to: [ownerEmail],
                subject: '📈 Chippy Weekly Report',
                html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Weekly Performance Report 📈</h2>
            <p>Here is how your AI Agent performed this week:</p>
            
            <div style="display: flex; gap: 20px; margin: 20px 0;">
                <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; flex: 1; text-align: center;">
                    <h3 style="margin: 0; font-size: 24px;">${stats.bookings}</h3>
                    <p style="margin: 5px 0 0; color: #666;">Bookings</p>
                </div>
                <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; flex: 1; text-align: center;">
                    <h3 style="margin: 0; font-size: 24px;">${stats.leads || 0}</h3>
                    <p style="margin: 5px 0 0; color: #666;">Leads</p>
                </div>
            </div>

            <p><strong>Est. Value Generated:</strong> $${(stats.bookings * 150) + (stats.leads * 20)} (Approx)</p>

            <a href="https://app.hellochippy.com/dashboard" style="display: block; text-align: center; background: #000; color: #fff; padding: 12px; text-decoration: none; border-radius: 5px; margin-top: 20px;">View Full Analytics</a>
          </div>
        `
            });
            console.log(`[Email] Weekly report sent to ${ownerEmail}`);
        } catch (error) {
            console.error('[Email] Failed to send weekly report:', error);
        }
    }
};
