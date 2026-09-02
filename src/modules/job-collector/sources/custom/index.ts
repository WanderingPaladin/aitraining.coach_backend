import { SafeFetchError } from '../../http.js';
import type { JobSourceAdapter, NormalizedJob, RawJob, SourceConfig } from '../../types.js';

/**
 * Custom sources should be added as dedicated modules and registered here.
 * Do not add brittle CSS-selector scrapers for large numbers of sites.
 */
export const customAdapters = new Map<string, JobSourceAdapter>();

export function registerCustomAdapter(key: string, adapter: JobSourceAdapter): void {
  customAdapters.set(key.trim().toLowerCase(), adapter);
}

export class CustomAdapter implements JobSourceAdapter {
  async fetchJobs(source: SourceConfig): Promise<RawJob[]> {
    const key = source.boardToken.trim().toLowerCase();
    const adapter = customAdapters.get(key);
    if (!adapter) {
      throw new SafeFetchError(
        'BAD_SOURCE',
        `No custom adapter is registered for "${source.boardToken || source.companySlug}". Add one under job-collector/sources/custom.`,
      );
    }
    return adapter.fetchJobs(source);
  }

  normalize(rawJob: RawJob, source: SourceConfig): NormalizedJob | null {
    const key = source.boardToken.trim().toLowerCase();
    const adapter = customAdapters.get(key);
    if (!adapter) {
      return null;
    }
    return adapter.normalize(rawJob, source);
  }
}
