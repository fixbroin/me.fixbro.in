
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
  serviceName: z.string().describe("The name of the home service, e.g., 'TV Installation – 33 to 43 Inches' or 'Washing Machine Installation'."),
  categoryName: z.string().describe("The main category the service belongs to, e.g., 'Appliance Repair', 'Carpentry' or 'Plumbing'."),
  subCategoryName: z.string().describe("The specific sub-category, e.g., 'Television' or 'Washing Machine'."),
  cityName: z.string().optional().describe("City name for localized SEO. Defaults to 'Bangalore' if not provided."),
});
export type GenerateServiceDetailsInput = z.infer<typeof GenerateServiceDetailsInputSchema>;

const GenerateServiceDetailsOutputSchema = z.object({
  shortDescription: z.string().describe("Concise short description for service cards (max 200 characters). Format: 'Get your [item/service] professionally [action] by an experienced technician...'"),
  fullDescription: z.string().describe("Detailed introductory description for the service detail page (max 300 characters). Format: 'Book a professional [service name] for [purpose]. Our technician will [key actions]...'"),
  pleaseNote: z.array(z.string()).describe("6 to 8 clear, realistic terms, physical conditions, and disclaimers. Labour charges only, ladder requirement if applicable, extra materials additional, specific technical exclusions. ABSOLUTELY NO WARRANTY OR MONEY-BACK GUARANTEE MENTIONS."),
  imageHint: z.string().describe("Concise 4 to 8 words describing a realistic photo of the service being performed, e.g., 'installing wall mounted smart TV on wall'."),
  serviceHighlights: z.array(z.string()).describe("5 to 6 punchy strings highlighting key benefits, suitability, and workmanship."),
  includedItems: z.array(z.string()).describe("5 to 7 specific items or steps included in the service."),
  excludedItems: z.array(z.string()).describe("6 to 8 clear physical or scope exclusions (parts, shifting/transportation, civil repair/painting, wiring modification, ladder, etc.)."),
  taskTime: z.object({
    value: z.number().describe("Estimated task time value, e.g. 30, 45, 60."),
    unit: z.enum(['minutes', 'hours']).describe("Time unit."),
  }),
  serviceFaqs: z.array(
    z.object({
      question: z.string().describe("Realistic, practical customer question about the service."),
      answer: z.string().describe("Direct, helpful answer in 1-2 sentences. Never mention warranty."),
    })
  ).describe("5 to 6 high-intent local FAQs addressing real user questions."),
  seo: z.object({
    h1_title: z.string().describe("H1 title, e.g. '{{serviceName}} in {{cityName}}'."),
    seo_title: z.string().describe("Meta title strictly 35 to 48 characters. Format: '[Service Name] Near Me | [Action] [City]'. NEVER include company/brand name."),
    seo_description: z.string().describe("Meta description strictly under 155 characters featuring '{{serviceName}} in {{cityName}}', key actions, and 'Book online' call-to-action."),
    seo_keywords: z.string().describe("8 to 10 comma-separated high-intent local search keywords."),
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
  prompt: `You are an expert Home Services operations manager and SEO copywriter.
Generate comprehensive, highly realistic service details and localized SEO metadata.

Service Name: {{serviceName}}
Category: {{categoryName}}
Sub-Category: {{subCategoryName}}
Target City: {{#if cityName}}{{cityName}}{{else}}Bangalore{{/if}}

STRUCTURAL & CONTENT GUIDELINES (BASED ON REAL PRODUCTION STANDARDS):

1. SHORT DESCRIPTION (for service cards, under 200 chars):
   - Pattern: "Get your [item/service] [safely/professionally] [installed/uninstalled/repaired/serviced] by an experienced technician. Suitable for [specifications/details], including [key handling action]."
   - Keep it direct, crisp, and strictly under 200 characters.

2. DETAILED DESCRIPTION (for service page description intro, under 300 chars):
   - Pattern: "Book a professional [service name] for [purpose/appliance type]. Our technician will [step 1], [step 2], and carefully [step 3] with [quality check/testing]. Suitable for [compatibility/types]."
   - Crisp, professional, and strictly under 300 characters.

3. COMPREHENSIVE CATEGORY-SPECIFIC OPERATIONS & TRADE RULES:

   A. CARPENTRY & FURNITURE:
      - Sub-trades: Locks & Latches (cylindrical, mortise, deadbolt), Doors & Windows (trimming floor-scraping doors, planer/randha, hinge adjustment, sliding rollers), Furniture Assembly & Repair (hydraulic beds, wardrobes, study tables, soft-close hinges, drawer channels), Wall Drilling (curtain rods, shelves, mirrors).
      - Trade rules: Pilot drilling to prevent wood cracking, spirit-level alignment, smooth swing checks.
      - Disclaimers: Labour charges only; replacement hardware, locks, hinges, channels, raw timber extra; no ladders >8ft; no civil masonry/wall painting; no polishing/varnishing; no heavy furniture shifting.

   B. PLUMBING:
      - Sub-trades: Taps, mixers, showers, concealed pipe leaks, wash basins, toilets/commodes, flush cisterns, drain blockages, water tank cleaning, pressure pumps.
      - Trade rules: Inspection of washers, O-rings, spindle/cartridge; Teflon tape sealing; post-service water pressure & leak testing.
      - Disclaimers: Labour charges only; replacement fittings, taps, valves, and spare parts extra; main water supply valve must be accessible; no civil tile breaking or wall painting; no ladders >8ft; strictly for plumbing.

   C. ELECTRICAL:
      - Sub-trades: Ceiling/exhaust fans, decorative lighting, MCB/fuse trip diagnosis, switchboards, inverter wiring, geyser power connections, earthing checks.
      - Trade rules: Voltage/phase testing, circuit isolation, secure terminal tightening, polarity check.
      - Disclaimers: Labour charges only; replacement switches, sockets, wires, and MCBs extra; main power supply will be turned off during service; no concealed wall grooving/re-plastering; no ladders >8ft; strictly for electrical work.

   D. APPLIANCE REPAIR & INSTALLATION:
      - Sub-trades: TV mounting/unmounting, washing machine (inlet/outlet hoses, leveling, spin test), refrigerator, microwave, water purifier/RO filter, chimney, geyser.
      - Trade rules: Pre-service physical inspection, leveling, safe connection to water/power, basic operational run test.
      - Disclaimers: Labour charges only; brackets, inlet pipes, filters, and spare parts extra; appliance must be located near connection point; no room-to-room shifting or transport; no wall repair post-uninstallation; no ladders >8ft.

   E. AC SERVICES:
      - Sub-trades: Split/window AC jet cleaning, installation, uninstallation, gas top-up/refill, water leakage repair.
      - Trade rules: High-pressure jet pump cleaning, protective service jacket setup, evaporator & condenser coil wash, drain tray flushing, cooling check.
      - Disclaimers: Labour charges only; refrigerant gas, copper piping, and spare parts extra; customer must provide continuous water and power connection; high-reach scaffolding or ladders for outdoor high-rise units must be arranged by customer.

   F. CLEANING & PEST CONTROL:
      - Sub-trades: Full home deep cleaning, kitchen deep cleaning, bathroom sanitization, sofa/carpet shampooing, pest control (cockroach gel, bedbug spray, termite treatment).
      - Trade rules: Degreasing, grout scrubbing, surface sanitization, foam extraction for upholstery, targeted gel/spray application.
      - Disclaimers: Labour and standard cleaning solutions included; interior cleaning of filled wardrobes/cabinets excluded; heavy appliance/furniture moving excluded; continuous water and electricity required; stain removal efficiency depends on surface age; pesticide aeration instructions must be followed.

   G. PAINTING & WATERPROOFING:
      - Sub-trades: Interior wall painting, exterior painting, crack filling, dampness waterproofing, touch-up painting.
      - Disclaimers: Labour only (or specified paint package); moving heavy furniture excluded; high-reach scaffolding for exterior multi-story work extra.

   H. DIGITAL & WEB SERVICES:
      - Sub-trades: Website design, web development, CMS setup, bug fixing.
      - Disclaimers: Domain name, web hosting, paid third-party API subscriptions, and premium stock assets are not included in service charge.

4. PLEASE NOTE (6 to 8 clean disclaimers):
   - Realistic physical disclaimers and scope boundaries tailored to this specific service.
   - Core clauses to include where applicable:
     * "Labour charges only."
     * "Service is for 1 [unit] at 1 location." (or minimum booking duration if hourly service).
     * "Material or spare part charges, if any, are additional."
     * Physical limitations: e.g. "Our technicians do not carry ladders; please arrange one if required."
     * Technical boundaries: e.g. "Electrical wiring modification or socket removal is not included." / "Wall repair, patching, or painting after bracket/fitting removal is not included."
     * Scope restrictions: e.g. "Technicians are strictly for service-related work; please do not use for cleaning, shifting, or general moving."
   - STRICT RULE: DO NOT mention any 30-day warranty, warranty period, or money-back guarantee anywhere.

5. WHAT'S INCLUDED (5 to 7 specific items):
   - Precise checklist tailored to {{serviceName}}.
   - E.g. Measurement, leveling, testing, basic post-service cleanup.

6. WHAT'S NOT INCLUDED (6 to 8 specific exclusions):
   - Material/hardware costs, furniture shifting or transportation, civil/masonry wall repair or repainting, concealed electrical wiring, polishing/varnishing, scaffolding or tall ladders.

7. SERVICE HIGHLIGHTS (5 to 6 items):
   - Professional [service name], Suitable for [types/brands], Safe and secure precision work, Smooth operation check, Quick & convenient doorstep service, Neat & tidy workmanship.

8. SERVICE FAQS (5 to 6 practical Q&As):
   - Practical voice-search questions that real customers ask (e.g. materials/hardware provided, ladder requirements, testing after completion, duration).
   - Direct, helpful answers (1 to 2 sentences max). DO NOT mention warranty or guarantees.

9. IMAGE HINT (4 to 8 words):
   - Concise prompt for realistic photo, e.g. "technician installing smart TV on wall" or "carpenter fixing wooden door lock".

10. SEO METADATA:
   - h1_title: "{{serviceName}} in {{#if cityName}}{{cityName}}{{else}}Bangalore{{/if}}"
   - seo_title: STRICTLY 35 to 48 characters. NEVER INCLUDE ANY COMPANY OR BRAND NAME (e.g. no "Fixbro", no "Wecanfix", etc., because the website layout appends it automatically). Format: "{{serviceName}} Near Me | {{#if cityName}}{{cityName}}{{else}}Bangalore{{/if}}" (shortened if necessary to stay under 48 chars).
   - seo_description: STRICTLY under 155 characters. Local intent, highlighting verified pros and online booking.
   - seo_keywords: 8 to 10 comma-separated phrases with city and "near me" intent.

Return ONLY valid JSON matching the schema.`,
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
      shortDescription: truncateSeoString(cleanSeoString(output.shortDescription), 200),
      fullDescription: truncateSeoString(cleanSeoString(output.fullDescription), 300),
      pleaseNote: (output.pleaseNote || []).map(item => cleanSeoString(item)),
      serviceHighlights: (output.serviceHighlights || []).map(item => cleanSeoString(item)),
      includedItems: (output.includedItems || []).map(item => cleanSeoString(item)),
      excludedItems: (output.excludedItems || []).map(item => cleanSeoString(item)),
      serviceFaqs: (output.serviceFaqs || []).map(faq => ({
        question: cleanSeoString(faq.question),
        answer: cleanSeoString(faq.answer),
      })),
    };
  }
);
