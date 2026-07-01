import { z } from 'zod';

/** Target platform(s) a generated framework should cover. */
export const PLATFORMS = ['web', 'mobile', 'api', 'web-api', 'mobile-api', 'all'] as const;
export const PlatformSchema = z.enum(PLATFORMS);
export type Platform = z.infer<typeof PlatformSchema>;

export const LANGUAGES = ['typescript', 'javascript', 'python', 'java'] as const;
export const LanguageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof LanguageSchema>;

/**
 * A stack selection for the framework generator (spec §4.3). `framework` and
 * `reporter` are open strings (validated against the registry at generate time)
 * so adding a new cell needs no change here.
 */
export const SelectionSchema = z.object({
  platform: PlatformSchema,
  language: LanguageSchema,
  framework: z.string().min(1),
  reporter: z.string().min(1),
  projectName: z.string().optional(),
  webBaseUrl: z.string().url().optional(),
  apiBaseUrl: z.string().url().optional(),
});
export type Selection = z.infer<typeof SelectionSchema>;
