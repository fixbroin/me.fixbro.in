
'use server';
/**
 * @fileOverview A Genkit flow to send an email notification to the admin
 * when a new review is submitted.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import nodemailer from 'nodemailer';
import { getBaseUrl } from '@/lib/config';

const NewReviewAdminNotificationEmailInputSchema = z.object({
  reviewId: z.string().describe("The ID of the submitted review."),
  bookingId: z.string().describe("The human-readable booking ID."),
  serviceName: z.string().describe("The name of the service reviewed."),
  userName: z.string().describe("The name of the user who submitted the review."),
  rating: z.number().describe("The rating given by the user."),
  comment: z.string().describe("The comment left by the user."),
  adminUrl: z.string().url().describe("Direct URL to view the review in the admin panel."),
  // SMTP Settings
  smtpHost: z.string().optional().describe("SMTP host for sending emails."),
  smtpPort: z.string().optional().describe("SMTP port (e.g., '587', '465')."),
  smtpUser: z.string().optional().describe("SMTP username."),
  smtpPass: z.string().optional().describe("SMTP password."),
  senderEmail: z.string().email().optional().describe("The email address to send from."),
  siteName: z.string().optional(),
  logoUrl: z.string().url().optional(),
});

export type NewReviewAdminNotificationEmailInput = z.infer<typeof NewReviewAdminNotificationEmailInputSchema>;

export async function sendNewReviewAdminNotificationEmail(input: NewReviewAdminNotificationEmailInput): Promise<{ success: boolean; message: string }> {
  try {
    return await newReviewAdminNotificationEmailFlow(input);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to process review notification email flow: ${errorMessage}` };
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
        
        .button {
            display: inline-block; padding: 14px 28px; background-color: #0B5ED7; color: #ffffff !important;
            text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-top: 20px;
        }
        .star-rating { color: #FFC107; font-size: 24px; margin-bottom: 10px; }
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
                <table class="container" width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; margin: 20px 0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
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

const newReviewAdminNotificationEmailFlow = ai.defineFlow(
  {
    name: 'newReviewAdminNotificationEmailFlow',
    inputSchema: NewReviewAdminNotificationEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (details) => {
    try {
      const { smtpHost, smtpPort, smtpUser, smtpPass, senderEmail, siteName = "FixBro", logoUrl, ...reviewDetails } = details;

      const adminEmail = "fixbro.in@gmail.com"; 
      const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;

      const stars = "★".repeat(reviewDetails.rating) + "☆".repeat(5 - reviewDetails.rating);

      const emailSubject = `New Review Submitted for ${reviewDetails.serviceName} (${reviewDetails.rating} Stars)`;
      const emailBodyContent = `
        <p>A new service review has been submitted on ${siteName}.</p>
        <div class="summary-box">
            <div class="section-title">Review Summary</div>
            <div class="star-rating">${stars}</div>
            <p><strong>Service:</strong> ${reviewDetails.serviceName}</p>
            <p><strong>Booking ID:</strong> ${reviewDetails.bookingId}</p>
            <p><strong>Customer:</strong> ${reviewDetails.userName}</p>
            <p><strong>Rating:</strong> ${reviewDetails.rating}/5</p>
        </div>
        <h3>Customer Comment:</h3>
        <p style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #0B5ED7; font-style: italic;">
            "${reviewDetails.comment}"
        </p>
        <p>You can manage this review in the admin panel:</p>
        <p><a href="${reviewDetails.adminUrl}" class="button">View Reviews</a></p>
      `;

      const htmlBody = createHtmlTemplate("New Customer Review", emailBodyContent, siteName, logoUrl);

      if (!canAttemptRealEmail) {
        console.warn("SMTP configuration incomplete. Simulating admin review notification email.");
        return { success: false, message: "SMTP config incomplete. Email simulated." };
      }

      const portNumber = parseInt(smtpPort!, 10);
      if (isNaN(portNumber)) {
        return { success: false, message: "Invalid SMTP port." };
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost, port: portNumber, secure: portNumber === 465, auth: { user: smtpUser, pass: smtpPass },
      });
      
      await transporter.sendMail({
        from: `${siteName} Admin <${senderEmail}>`,
        to: adminEmail,
        subject: emailSubject,
        html: htmlBody,
      });
      
      return { success: true, message: "Admin review notification email sent successfully." };

    } catch (error: any) {
      console.error("Error in newReviewAdminNotificationEmailFlow:", error);
      return { success: false, message: `Email sending failed: ${error.message || 'Unknown nodemailer error'}.` };
    }
  }
);
