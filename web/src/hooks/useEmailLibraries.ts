import { useEffect, useState } from 'react';
import { api, type EmailStyle, type EmailPersonaInfo, type LeadMagnetInfo } from '../api.js';

/**
 * Loads the cold-email IP libraries (styles, personas, lead magnets) once.
 * Shared by the from-scratch generator and the edit-mode rewriter so neither
 * duplicates the fetch logic. Also exposes name resolvers used to render keys nicely.
 */
export function useEmailLibraries() {
  const [styles, setStyles] = useState<EmailStyle[]>([]);
  const [personas, setPersonas] = useState<EmailPersonaInfo[]>([]);
  const [magnets, setMagnets] = useState<LeadMagnetInfo[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.emailStyles(), api.emailPersonas(), api.leadMagnets()])
      .then(([s, p, m]) => { setStyles(s.styles); setPersonas(p.personas); setMagnets(m.leadMagnets); })
      .catch((e) => setError(String(e)));
  }, []);

  const styleName = (k?: string | null) => styles.find((s) => s.key === k)?.name ?? k ?? '';
  const personaName = (k?: string | null) => personas.find((p) => p.key === k)?.name ?? k ?? '';
  const magnetName = (id?: string | null) => magnets.find((m) => m.id === id)?.title ?? id ?? '';

  return { styles, personas, magnets, error, styleName, personaName, magnetName };
}
