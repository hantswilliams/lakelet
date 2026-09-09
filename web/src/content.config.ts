// Content collections. `docs` is the developer documentation under /docs: one markdown
// file per page in src/content/docs/, grouped in the sidebar by `section` and sorted by
// `order`. `index.md` is the landing page at /docs itself.
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const docs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    section: z.enum(['Start', 'Guide', 'Reference', 'Develop']),
    order: z.number().default(99),
  }),
});

export const collections = { docs };
