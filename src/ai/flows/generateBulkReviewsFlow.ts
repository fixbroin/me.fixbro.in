
'use server';
/**
 * @fileOverview An AI flow to generate a batch of realistic reviews for a service.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { adminDb } from '@/lib/firebaseAdmin';

// Input schema for generating reviews
const GenerateBulkReviewsInputSchema = z.object({
  serviceId: z.string().describe("The ID of the service to generate reviews for."),
  serviceName: z.string().describe("The name of the service to generate reviews for."),
  categoryName: z.string().describe("The category the service belongs to, for context."),
  subCategoryName: z.string().describe("The sub-category the service belongs to."),
  numberOfReviews: z.coerce.number().int().min(1).max(20).describe("The number of reviews to generate (1-20)."),
});
export type GenerateBulkReviewsInput = z.infer<typeof GenerateBulkReviewsInputSchema>;

// Schema for a single generated review
const GeneratedReviewSchema = z.object({
  userName: z.string().describe("A realistic Indian full name (e.g. Srikanth, Priya Sharma, Rohan Kumar)."),
  rating: z.number().min(3).max(5).describe("A rating between 4 and 5."),
  comment: z.string().describe("A concise review comment (15-40 words) sounding natural and authentic."),
});

// Output schema for the flow
const GenerateBulkReviewsOutputSchema = z.object({
  reviews: z.array(GeneratedReviewSchema).describe("An array of generated reviews."),
});
export type GenerateBulkReviewsOutput = z.infer<typeof GenerateBulkReviewsOutputSchema>;


// The main function to be called from the frontend
export async function generateBulkReviews(input: GenerateBulkReviewsInput): Promise<GenerateBulkReviewsOutput> {
  return generateBulkReviewsFlow(input);
}


const generateReviewsPrompt = ai.definePrompt({
    name: 'generateBulkReviewsPrompt',
    input: { 
      schema: GenerateBulkReviewsInputSchema.extend({
        existingNames: z.array(z.string()).optional()
      }) 
    },
    output: { schema: GenerateBulkReviewsOutputSchema },
    prompt: `Expert review generator for home doorstep services.
Generate authentic customer reviews for: {{serviceName}} ({{categoryName}} / {{subCategoryName}}).

{{#if existingNames}}
Avoid these already used names:
{{#each existingNames}}
- {{this}}
{{/each}}
{{/if}}

Generate {{numberOfReviews}} unique reviews with common Indian names (mix of male and female).
Ratings: mostly 4-5 stars.
Comments: concise, natural (15-40 words).

Return ONLY valid JSON.`,
});

const generateBulkReviewsFlow = ai.defineFlow(
  {
    name: 'generateBulkReviewsFlow',
    inputSchema: GenerateBulkReviewsInputSchema,
    outputSchema: GenerateBulkReviewsOutputSchema,
  },
  async (input) => {
    // Fetch existing reviewer names from the database to avoid duplicates
    let existingNames: string[] = [];
    try {
      const reviewsRef = adminDb.collection("adminReviews");
      const q = reviewsRef.where("serviceId", "==", input.serviceId).limit(100);
      const querySnapshot = await q.get();
      existingNames = querySnapshot.docs.map(doc => doc.data().userName as string);
    } catch (error) {
      console.error("Error fetching existing names for review generation:", error);
      // Proceed with empty list on error to not block generation
    }

    const { output } = await generateReviewsPrompt({
      ...input,
      existingNames
    });

    if (!output || !output.reviews) {
      throw new Error("AI failed to generate a valid review list.");
    }
    return output;
  }
);
