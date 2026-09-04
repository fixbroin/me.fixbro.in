
'use server';
/**
 * @fileOverview An AI flow to generate comprehensive details for a home service.
 *
 * - generateServiceDetails - A function that takes a service name and context, and returns generated content.
 * - GenerateServiceDetailsInput - The input type for the flow.
 * - GenerateServiceDetailsOutput - The return type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { cleanSeoString, truncateSeoString, stripBrandSuffix } from '@/lib/seoAdvancedUtils';

const GenerateServiceDetailsInputSchema = z.object({
  serviceName: z.string().describe("The name of the home service, e.g., 'AC Deep Cleaning' or 'Door Lock Repair'."),
  categoryName: z.string().describe("The main category the service belongs to, e.g., 'Carpentry' or 'Plumbing'."),
  subCategoryName: z.string().describe("The specific sub-category, e.g., 'Door Fittings'."),
  cityName: z.string().optional().describe("City name for localized SEO. Defaults to 'Bangalore' if not provided."),
});
export type GenerateServiceDetailsInput = z.infer<typeof GenerateServiceDetailsInputSchema>;

const GenerateServiceDetailsOutputSchema = z.object({
  shortDescription: z.string().describe("A concise, one-sentence description for the service card. Max 180 characters."),
  fullDescription: z.string().describe("A comprehensive marketing description for the service detail page highlighting benefits, verified experts, and quality guarantee. Under 280 characters."),
  pleaseNote: z.array(z.string()).describe("2-3 important notes or disclaimers for the customer."),
  imageHint: z.string().describe("One or two keywords for image search. Max 40 characters."),
  serviceHighlights: z.array(z.string()).describe("3-4 punchy strings highlighting key benefits."),
  includedItems: z.array(z.string()).describe("3-4 strings listing what is included in the service."),
  excludedItems: z.array(z.string()).describe("2-3 strings listing what is NOT included in the service."),
  taskTime: z.object({
    value: z.number().describe("Estimated task time value."),
    unit: z.enum(['minutes', 'hours']).describe("Time unit."),
  }),
  serviceFaqs: z.array(
    z.object({
      question: z.string().describe("Voice-search question about price, timeframe, or doorstep availability."),
      answer: z.string().describe("Clear, helpful localized answer."),
    })
  ).describe("3-4 high-intent local FAQs for Google 'People Also Ask' snippets."),
  seo: z.object({
    h1_title: z.string().describe("H1 title, e.g. '{{serviceName}} in {{cityName}}'."),
    seo_title: z.string().describe("Meta title strictly 35-48 characters. NEVER include company name (template appends it). Use '{{serviceName}} in {{cityName}} | Near Me'."),
    seo_description: z.string().describe("Meta description under 155 characters featuring '{{serviceName}} in {{cityName}} near you', verified pros, and 'Book online!'."),
    seo_keywords: z.string().describe("10 comma-separated keywords with city and 'near me' intent."),
  }),
  rating: z.coerce.number().min(4.7).max(5).describe("Rating between 4.7 and 5.0."),
  reviewCount: z.coerce.number().int().min(120).max(950).describe("Realistic review count."),
});
export type GenerateServiceDetailsOutput = z.infer<typeof GenerateServiceDetailsOutputSchema>;

export async function generateServiceDetails(input: GenerateServiceDetailsInput): Promise<GenerateServiceDetailsOutput> {
  return generateServiceDetailsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateServiceDetailsPrompt',
  input: { schema: GenerateServiceDetailsInputSchema },
  output: { schema: GenerateServiceDetailsOutputSchema },
  prompt: `Expert Local SEO Copywriter for Home Services.
Generate high-conversion content and local SEO metadata.

Service: {{serviceName}}
Category: {{categoryName}}
Sub-Category: {{subCategoryName}}
Target City: {{#if cityName}}{{cityName}}{{else}}Bangalore{{/if}}

RULES:
1. NEVER include brand/company names (like "Wecanfix", "Fixbro") in seo.seo_title. The website template automatically appends it.
2. seo.seo_title MUST be strictly between 35 and 48 characters. Structure: "{{serviceName}} in {{#if cityName}}{{cityName}}{{else}}Bangalore{{/if}} | Near Me".
3. seo.seo_description MUST be under 155 characters: "Book trusted {{serviceName}} in {{#if cityName}}{{cityName}}{{else}}Bangalore{{/if}} near you. Verified pros, upfront pricing & same-day visit. Book now!".
4. seo.seo_keywords MUST be 10 high-intent phrases: "{{serviceName}} near me, {{serviceName}} {{#if cityName}}{{cityName}}{{else}}Bangalore{{/if}}, best {{serviceName}} near me, doorstep {{serviceName}} near you, etc.".
5. FAQs must address realistic customer questions: visiting charges, service warranty, same-day doorstep availability.

Return ONLY valid JSON.`,
});

const generateServiceDetailsFlow = ai.defineFlow(
  {
    name: 'generateServiceDetailsFlow',
    inputSchema: GenerateServiceDetailsInputSchema,
    outputSchema: GenerateServiceDetailsOutputSchema,
  },
  async (input) => {
    const cityName = input.cityName || 'Bangalore';
    const { output } = await prompt({ ...input, cityName });
    if (!output) {
      throw new Error("AI failed to generate a valid response.");
    }

    const cleanTitle = stripBrandSuffix(cleanSeoString(output.seo.seo_title));

    return {
      ...output,
      seo: {
        h1_title: cleanSeoString(output.seo.h1_title),
        seo_title: truncateSeoString(cleanTitle, 48),
        seo_description: truncateSeoString(cleanSeoString(output.seo.seo_description), 155),
        seo_keywords: cleanSeoString(output.seo.seo_keywords),
      },
      shortDescription: truncateSeoString(cleanSeoString(output.shortDescription), 180),
      fullDescription: truncateSeoString(cleanSeoString(output.fullDescription), 280),
    };
  }
);
