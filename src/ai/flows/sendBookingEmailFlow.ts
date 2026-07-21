
'use server';
/**
 * @fileOverview A Genkit flow to send booking confirmation and completion emails.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import nodemailer from 'nodemailer';
import { getBaseUrl } from '@/lib/config';
import { formatScheduledDate } from '@/lib/utils';

// Define Zod schema for individual service items
const EmailBookingServiceItemSchema = z.object({
  serviceId: z.string(),
  name: z.string(),
  quantity: z.number(),
  pricePerUnit: z.number(),
  discountedPricePerUnit: z.number().optional(),
  imageUrl: z.string().optional().nullable(),
  total: z.number().optional(),
});

// Define Zod schema for applied platform fees
const EmailPlatformFeeItemSchema = z.object({
  name: z.string(),
  amount: z.number(), 
});

// Define Zod schema for the input
const BookingConfirmationEmailInputSchema = z.object({
  bookingId: z.string(),
  customerName: z.string(),
  customerEmail: z.string().email(),
  customerPhone: z.string(),
  addressLine1: z.string(),
  addressLine2: z.string().optional(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  scheduledDate: z.string(),
  scheduledTimeSlot: z.string(),
  services: z.array(EmailBookingServiceItemSchema),
  subTotal: z.number(), 
  visitingCharge: z.number().optional(),
  discountAmount: z.number().optional(),
  discountCode: z.string().optional(),
  appliedPlatformFees: z.array(EmailPlatformFeeItemSchema).optional(),
  additionalCharges: z.array(z.object({ name: z.string(), amount: z.number() })).optional(),
  taxAmount: z.number(),
  totalAmount: z.number(),
  paymentMethod: z.string(),
  status: z.string(),
  smtpHost: z.string().optional(),
  smtpPort: z.string().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  senderEmail: z.string().optional(),
  emailType: z.enum(['booking_confirmation', 'booking_completion', 'booking_rescheduled', 'booking_cancelled_by_admin', 'booking_cancelled_by_user', 'booking_status_update']).optional().default('booking_confirmation'),
  invoicePdfBase64: z.string().optional(),
  previousScheduledDate: z.string().optional(),
  previousScheduledTimeSlot: z.string().optional(),
  cancellationReason: z.string().optional(),
  siteName: z.string().optional(),
  logoUrl: z.string().optional(),
});

export type BookingConfirmationEmailInput = z.infer<typeof BookingConfirmationEmailInputSchema>;

export async function sendBookingConfirmationEmail(input: BookingConfirmationEmailInput): Promise<{ success: boolean; message: string }> {
  try {
    const result = await bookingEmailFlow(input);
    return result;
  } catch (error) {
    console.error("sendBookingConfirmationEmail Error:", error);
    return { success: false, message: `Failed to process email flow.` };
  }
}

const createHtmlTemplate = (title: string, bodyContent: string, siteName: string, logoUrl?: string) => {
    const finalLogoUrl = logoUrl || `${getBaseUrl()}/default-image.png`;
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { margin: 0; padding: 0; background-color: #F8F9FA; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .inner-container { padding: 25px; }
        .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #f0f0f0; }
        .header img { max-width: 140px; height: auto; }
        .content { padding: 25px 0; color: #333333; line-height: 1.6; }
        .content h2 { color: #111111; font-size: 22px; margin-bottom: 15px; }
        .footer { text-align: center; font-size: 12px; color: #999999; padding: 25px; border-top: 1px solid #eeeeee; }
        .summary-box { background-color: #fcfcfc; border: 1px solid #eeeeee; padding: 20px; border-radius: 10px; margin: 20px 0; }
        .section-title { font-size: 16px; font-weight: bold; border-bottom: 1px solid #f0f0f0; padding-bottom: 8px; margin-bottom: 12px; color: #111111; text-transform: uppercase; letter-spacing: 0.5px; }
        
        .service-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        .service-row { border-bottom: 1px solid #f5f5f5; }
        .service-img-cell { width: 70px; padding: 12px 0; vertical-align: top; }
        .service-img-cell img { width: 60px; height: 60px; object-fit: cover; border-radius: 8px; display: block; background-color: #f0f0f0; }
        .service-info-cell { padding: 12px 0 12px 15px; vertical-align: top; }
        .service-name { font-weight: 600; color: #222222; font-size: 15px; margin-bottom: 3px; }
        .service-meta { color: #888888; font-size: 13px; margin-bottom: 2px; }
        .service-price { font-weight: 600; color: #0B5ED7; font-size: 14px; }
        
        .button {
            display: inline-block; padding: 14px 28px; background-color: #0B5ED7; color: #ffffff !important;
            text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-top: 20px;
        }
        .button-secondary {
            display: inline-block; padding: 8px 16px; background-color: #ffffff; color: #0B5ED7 !important;
            text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px; border: 1px solid #0B5ED7; margin-top: 10px;
        }
        @media only screen and (max-width: 600px) {
            .inner-container { padding: 15px !important; }
            .container { width: 100% !important; }
        }
    </style>
</head>
<body>
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8F9FA;">
        <tr>
            <td align="center">
                <table class="container" width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; margin: 20px 0; border-radius: 12px; overflow: hidden;">
                    <tr>
                        <td class="inner-container">
                            <div class="header">
                                <a href="${getBaseUrl()}" target="_blank">
                                    <img src="${finalLogoUrl}" alt="${siteName} Logo">
                                </a>
                            </div>
                            <div class="content">
                                <h2>${title}</h2>
                                ${bodyContent}
                            </div>
                            <div class="footer">
                                <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
                                <p>This is an automated email. Please do not reply directly.</p>
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;
};


const bookingEmailFlow = ai.defineFlow(
  {
    name: 'bookingEmailFlow',
    inputSchema: BookingConfirmationEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (bookingDetails) => {
    try { 
      const {
        smtpHost, smtpPort, smtpUser, smtpPass, senderEmail,
        emailType = 'booking_confirmation', 
        invoicePdfBase64,
        previousScheduledDate,
        previousScheduledTimeSlot,
        siteName = "FixBro",
        cancellationReason,
        logoUrl,
      } = bookingDetails;

      const paymentSummaryHtml = `
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="font-family: 'Roboto', sans-serif; line-height: 1.6; font-size: 14px; color: #444444;">
          <tr><td style="padding: 4px 0;">Items Total:</td><td align="right" style="padding: 4px 0;">Rs. ${bookingDetails.subTotal.toFixed(2)}</td></tr>
          ${bookingDetails.discountAmount && bookingDetails.discountAmount > 0 ? `<tr><td style="padding: 4px 0; color: #198754;">Discount (${bookingDetails.discountCode || 'Applied'}):</td><td align="right" style="padding: 4px 0; color: #198754;">- Rs. ${bookingDetails.discountAmount.toFixed(2)}</td></tr>` : ''}
          ${bookingDetails.visitingCharge && bookingDetails.visitingCharge > 0 ? `<tr><td style="padding: 4px 0;">Visiting Charge:</td><td align="right">+ Rs. ${bookingDetails.visitingCharge.toFixed(2)}</td></tr>` : ''}
          
          ${bookingDetails.appliedPlatformFees && bookingDetails.appliedPlatformFees.length > 0 ? bookingDetails.appliedPlatformFees.map(fee => `<tr><td style="padding: 4px 0;">${fee.name}:</td><td align="right">+ Rs. ${fee.amount.toFixed(2)}</td></tr>`).join('') : ''}
          
          ${bookingDetails.additionalCharges && bookingDetails.additionalCharges.length > 0 ? `
            <tr><td colspan="2" style="padding: 10px 0 5px 0; font-size: 12px; color: #888888; text-transform: uppercase; font-weight: bold;">Additional Service Charges:</td></tr>
            ${bookingDetails.additionalCharges.map(charge => `
              <tr><td style="padding: 2px 0;">${charge.name}:</td><td align="right">+ Rs. ${charge.amount.toFixed(2)}</td></tr>
            `).join('')}
          ` : ''}

          <tr><td style="padding: 4px 0;">Total Tax:</td><td align="right">+ Rs. ${bookingDetails.taxAmount.toFixed(2)}</td></tr>
          <tr><td colspan="2" style="border-top: 1px solid #eeeeee; padding-top: 10px; margin-top: 10px;"></td></tr>
          <tr style="font-size: 18px; font-weight: bold; color: #111111;">
            <td style="padding: 5px 0;">Total Amount:</td>
            <td align="right" style="padding: 5px 0;">Rs. ${bookingDetails.totalAmount.toFixed(2)}</td>
          </tr>
        </table>
      `;
      
      const servicesHtml = `
        <table class="service-table">
          ${bookingDetails.services.map(s => {
            const itemTotal = (typeof s.total === 'number') ? s.total : (s.pricePerUnit * s.quantity);
            const avgPrice = s.quantity > 0 ? itemTotal / s.quantity : 0;
            return `
            <tr class="service-row">
              <td class="service-img-cell">
                <img src="${s.imageUrl || (getBaseUrl() + '/default-image.png')}" alt="${s.name}">
              </td>
              <td class="service-info-cell">
                <div class="service-name">${s.name} (x${s.quantity})</div>
                <div class="service-meta">Avg: Rs. ${avgPrice.toFixed(2)}</div>
                <div class="service-price">Total: Rs. ${itemTotal.toFixed(2)}</div>
              </td>
            </tr>
            `;
          }).join('')}
        </table>
      `;


      let customerEmailSubject = "";
      let customerEmailBody = "";
      const adminEmail = "fixbro.in@gmail.com"; 
      let adminEmailSubject = "";
      let adminEmailBody = "";
      const attachments: any[] = [];

      if (emailType === 'booking_completion') {
        customerEmailSubject = `Your ${siteName} Service Completed! (ID: ${bookingDetails.bookingId})`;
        customerEmailBody = createHtmlTemplate('Service Completed!', `
          <p>Hi ${bookingDetails.customerName},</p>
          <p>We're pleased to inform you that your service booking (ID: <strong>${bookingDetails.bookingId}</strong>) has been successfully completed!</p>
          <div class="summary-box">
            <div class="section-title">Booking Details</div>
            <p style="margin: 5px 0;"><strong>Booking ID:</strong> ${bookingDetails.bookingId}</p>
            <p style="margin: 5px 0;"><strong>Scheduled:</strong> ${formatScheduledDate(bookingDetails.scheduledDate)} at ${bookingDetails.scheduledTimeSlot}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> Completed</p>
            
            <div class="section-title" style="margin-top: 25px;">Final Payment Summary</div>
            ${paymentSummaryHtml}
          </div>
          <p style="text-align: center; margin-top: 30px;">
            <a href="${getBaseUrl()}/my-bookings" class="button">Manage Your Booking</a>
          </p>
          <p>Thank you for choosing ${siteName}!</p>
        `, siteName, logoUrl);
        adminEmailSubject = `Booking Completed (ID: ${bookingDetails.bookingId})`;
        adminEmailBody = createHtmlTemplate('Admin Alert: Booking Completed', `<p>Booking ID <strong>${bookingDetails.bookingId}</strong> for <strong>${bookingDetails.customerName}</strong> has been marked as COMPLETED.</p><p>Total: Rs. ${bookingDetails.totalAmount.toFixed(2)}.</p>`, siteName, logoUrl);
        if (invoicePdfBase64) attachments.push({ filename: `invoice-${bookingDetails.bookingId}.pdf`, content: invoicePdfBase64, encoding: 'base64', contentType: 'application/pdf' });
      } else if (emailType === 'booking_rescheduled') {
        customerEmailSubject = `Your ${siteName} Booking Rescheduled (ID: ${bookingDetails.bookingId})`;
        customerEmailBody = createHtmlTemplate('Booking Rescheduled', `
            <p>Hi ${bookingDetails.customerName},</p>
            <p>Your service booking (ID: <strong>${bookingDetails.bookingId}</strong>) has been rescheduled.</p>
            <div class="summary-box">
              <div class="section-title">Reschedule Info</div>
              <p style="margin: 5px 0;"><strong>Previous Schedule:</strong> ${formatScheduledDate(previousScheduledDate)} at ${previousScheduledTimeSlot || 'N/A'}</p>
              <p style="margin: 5px 0;"><strong>New Schedule:</strong> ${formatScheduledDate(bookingDetails.scheduledDate)} at ${bookingDetails.scheduledTimeSlot}</p>
            </div>
            <p>If you have any questions, please contact us.</p>
        `, siteName, logoUrl);
        adminEmailSubject = `Booking Rescheduled (ID: ${bookingDetails.bookingId})`;
        adminEmailBody = createHtmlTemplate('Admin Alert: Booking Rescheduled', `
            <p>Booking ID <strong>${bookingDetails.bookingId}</strong> for <strong>${bookingDetails.customerName}</strong> has been RESCHEDULED.</p>
            <p><strong>Previous Schedule:</strong> ${formatScheduledDate(previousScheduledDate)} at ${previousScheduledTimeSlot || 'N/A'}</p>
            <p><strong>New Schedule:</strong> ${formatScheduledDate(bookingDetails.scheduledDate)} at ${bookingDetails.scheduledTimeSlot}</p>
            <p style="margin-top: 20px;">
              <a href="${getBaseUrl()}/admin/bookings" class="button">View in Admin Panel</a>
            </p>
        `, siteName, logoUrl);
      } else if (emailType === 'booking_cancelled_by_admin') {
        customerEmailSubject = `Your Booking Has Been Cancelled`;
        customerEmailBody = createHtmlTemplate('Booking Cancelled', `
            <p>Dear ${bookingDetails.customerName},</p>
            <p>We regret to inform you that your booking #${bookingDetails.bookingId} has been cancelled.</p>
            ${cancellationReason ? `<p><strong>Reason:</strong> ${cancellationReason}</p>` : ''}
            <p>If you did not request this cancellation, please note that it may have been cancelled by our system or service provider due to technician unavailability or service coverage limitations in your area. We sincerely apologize for the inconvenience and will try our best to serve you again soon.</p>
            <p>If you have paid online, your refund will be processed within 7 working days.</p>
        `, siteName, logoUrl);
        adminEmailSubject = `Booking Cancelled by Admin (ID: ${bookingDetails.bookingId})`;
        adminEmailBody = createHtmlTemplate('Admin Alert: Booking Cancelled', `<p>Booking ID <strong>${bookingDetails.bookingId}</strong> for <strong>${bookingDetails.customerName}</strong> was cancelled by an admin.</p>`, siteName, logoUrl);
      } else if (emailType === 'booking_status_update') {
        customerEmailSubject = `Update on your ${siteName} booking (ID: ${bookingDetails.bookingId})`;
        customerEmailBody = createHtmlTemplate('Booking Status Updated', `
            <p>Hi ${bookingDetails.customerName},</p>
            <p>The status of your service booking (ID: <strong>${bookingDetails.bookingId}</strong>) has been updated to: <strong>${bookingDetails.status}</strong>.</p>
            <p style="text-align: center; margin-top: 30px;">
              <a href="${getBaseUrl()}/my-bookings" class="button">View Booking Status</a>
            </p>
        `, siteName, logoUrl);
        adminEmailSubject = `Booking Status Updated (ID: ${bookingDetails.bookingId})`;
        adminEmailBody = createHtmlTemplate('Admin Alert: Status Updated', `<p>Booking ID <strong>${bookingDetails.bookingId}</strong> status changed to <strong>${bookingDetails.status}</strong>.</p>`, siteName, logoUrl);
      } else { // booking_confirmation (default)
        customerEmailSubject = `Your ${siteName} Booking Confirmed! (ID: ${bookingDetails.bookingId})`;
        customerEmailBody = createHtmlTemplate('Booking Confirmed!', `
          <p>Hi ${bookingDetails.customerName},</p>
          <p>Thank you for booking with ${siteName}! Your service has been scheduled successfully.</p>
          <div class="summary-box">
            <div class="section-title">Booking Details</div>
            <p style="margin: 5px 0;"><strong>Booking ID:</strong> ${bookingDetails.bookingId}</p>
            <p style="margin: 5px 0;"><strong>Scheduled:</strong> ${formatScheduledDate(bookingDetails.scheduledDate)} | ${bookingDetails.scheduledTimeSlot}</p>
            <p style="margin: 5px 0;"><strong>Address:</strong> ${bookingDetails.addressLine1}${bookingDetails.addressLine2 ? ', ' + bookingDetails.addressLine2 : ''}, ${bookingDetails.city}</p>
            
            <div class="section-title" style="margin-top: 25px;">Services</div>
            ${servicesHtml}
            
            <div class="section-title" style="margin-top: 25px;">Payment Summary</div>
            ${paymentSummaryHtml}
          </div>
          <p style="text-align: center;">
            <a href="${getBaseUrl()}/my-bookings" class="button">Manage Your Booking</a>
          </p>
        `, siteName, logoUrl);
        
        // --- ADMIN EMAIL ---
        let addressBlock = `<li><strong>Address:</strong> ${bookingDetails.addressLine1}${bookingDetails.addressLine2 ? ', ' + bookingDetails.addressLine2 : ''}, ${bookingDetails.city}, ${bookingDetails.state} - ${bookingDetails.pincode}</li>`;
        if (bookingDetails.latitude && bookingDetails.longitude) {
            const mapsUrl = `https://www.google.com/maps?q=${bookingDetails.latitude},${bookingDetails.longitude}`;
            addressBlock += `<li style="margin-top: 10px;"><a href="${mapsUrl}" target="_blank" class="button-secondary">📍 View on Google Maps</a></li>`;
        }

        adminEmailSubject = `New Booking Received (ID: ${bookingDetails.bookingId})`;
        adminEmailBody = createHtmlTemplate('Admin Alert: New Booking', `
          <p>A new booking has been made on ${siteName}. Here are the full details:</p>
          <div class="summary-box">
            <div class="section-title">Customer & Schedule</div>
            <ul style="list-style: none; padding: 0; margin: 0; font-size: 14px;">
              <li style="margin-bottom: 5px;"><strong>Booking ID:</strong> ${bookingDetails.bookingId}</li>
              <li style="margin-bottom: 5px;"><strong>Customer:</strong> ${bookingDetails.customerName}</li>
              <li style="margin-bottom: 5px;"><strong>Email:</strong> ${bookingDetails.customerEmail}</li>
              <li style="margin-bottom: 5px;"><strong>Phone:</strong> ${bookingDetails.customerPhone}</li>
              <li style="margin-bottom: 5px;"><strong>Scheduled:</strong> ${formatScheduledDate(bookingDetails.scheduledDate)} at ${bookingDetails.scheduledTimeSlot}</li>
              ${addressBlock}
              <li style="margin-bottom: 5px; margin-top: 10px;"><strong>Payment:</strong> ${bookingDetails.paymentMethod}</li>
              <li style="margin-bottom: 5px;"><strong>Status:</strong> ${bookingDetails.status}</li>
            </ul>
            
            <div class="section-title" style="margin-top: 25px;">Services Requested</div>
            ${servicesHtml}
            
            <div class="section-title" style="margin-top: 25px;">Payment Details</div>
            ${paymentSummaryHtml}
          </div>
          <p style="text-align: center;">
            <a href="${getBaseUrl()}/admin/bookings" class="button">Open Admin Panel</a>
          </p>
        `, siteName, logoUrl);
      }

      if (!smtpHost || !smtpUser || !smtpPass || !senderEmail) {
        return { success: false, message: "SMTP configuration incomplete. Email sending simulated." };
      }

      const portNumber = parseInt(smtpPort!, 10) || 587;
      const transporter = nodemailer.createTransport({ host: smtpHost, port: portNumber, secure: portNumber === 465, auth: { user: smtpUser, pass: smtpPass }});
      
      const customerMailOptions = { from: `${siteName} <${senderEmail}>`, to: bookingDetails.customerEmail, subject: customerEmailSubject, html: customerEmailBody, attachments };

      await Promise.all([
          transporter.sendMail(customerMailOptions),
          transporter.sendMail({ from: `${siteName} Admin <${senderEmail}>`, to: adminEmail, subject: adminEmailSubject, html: adminEmailBody })
      ]);
      
      return { success: true, message: "Booking emails sent successfully." };

    } catch (flowError) { 
      console.error("Error in email flow:", flowError);
      return { success: false, message: `Error in email flow.` };
    }
  }
);
