// src/content.config.ts
import { defineCollection} from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const tools = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/tools/' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    url: z.string().url(),
    author: z.string(),
    status: z.enum(['live', 'down']),
    tags: z.array(z.string()),
    audience: z.enum(['students', 'staff', 'both']),
    internal: z.boolean(),
    addedAt: z.coerce.date(),
  }),
});

export const collections = { tools };