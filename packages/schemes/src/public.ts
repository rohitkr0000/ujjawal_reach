import type { Scheme } from './types';

/** The scheme data the public website needs (no internal notes, no admin fields). */
export interface PublicScheme {
  id: string;
  state: string;
  name: string;
  sector: string;
  level: Scheme['level'];
  scope: Scheme['scope'];
  channel: string;
  url: string;
  description: string;
  descriptionHi: string;
  lastVerified: string | null;
  tags: string[];
  conditions: Scheme['conditions'];
}

export interface PublicSchemesFile {
  state: string;
  version: number;
  generatedAt: string;
  schemes: PublicScheme[];
}

/** Only active and reviewed schemes are ever published. */
export function toPublicSchemes(schemes: Scheme[]): PublicScheme[] {
  return schemes
    .filter((s) => s.status === 'active' && s.reviewStatus === 'ok')
    .map((s) => ({
      id: s.id,
      state: s.state,
      name: s.name,
      sector: s.sector,
      level: s.level,
      scope: s.scope,
      channel: s.channel,
      url: s.url,
      description: s.description,
      descriptionHi: s.descriptionHi,
      lastVerified: s.lastVerified,
      tags: s.tags,
      conditions: s.conditions,
    }));
}
