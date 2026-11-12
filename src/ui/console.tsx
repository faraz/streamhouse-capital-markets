import { createContext, useContext, type ReactNode } from 'react';
import GlareHover from '../reactbits/GlareHover';
import type { ConsoleInfo } from '../data/types';
import { PALETTE } from './format';

/**
 * Flink statements are named cm-<label>-<stamp> by scripts/regenerate.sh, where the stamp is
 * the time the stack was built. A rebuild changes it: read the new one from the script's last
 * line, or from Flink management in the console, and set it here. Everything else in a
 * console address is the object's own name.
 */
export const STATEMENT_STAMP = '123424';
const statementName = (label: string) => `cm-${label}-${STATEMENT_STAMP}`;

/**
 * Where each thing on screen lives in the Confluent Cloud console. Every pattern here was
 * opened in a logged-in console on 2026-11-11 and landed on the object it names.
 */
export function consoleLinks(i: ConsoleInfo) {
  const env = `https://confluent.cloud/environments/${i.environmentId}`;
  const cluster = `${env}/clusters/${i.clusterId}`;
  const where = `cloud=${i.cloud}&region=${i.region}`;
  return {
    connectors: `${cluster}/connectors`,
    topics: `${env}/topics?clusterId=${i.clusterId}&tab=cloud&topics_filter=showAll`,
    /** A topic's records, as the console's message viewer shows them. */
    topic: (name: string) => `${cluster}/topics/${name}/message-viewer`,
    schema: (name: string) => `${cluster}/topics/${name}/data-contract`,
    schemaRegistry: `${env}/stream-governance/schema-registry`,
    /** Flink management, filtered to what is running. */
    statements: `${env}/flink/statements?filter_status_${i.environmentId}=RUNNING`,
    statementName,
    statement: (label: string) => `${env}/flink/statements/${statementName(label)}/details?${where}`,
    materialized: (name: string) => `${env}/flink/materialized-tables/${name}/details?${where}&clusterId=${i.clusterId}`,
    lightning: `${cluster}/lightning-tables`,
    lightningTable: (name: string) => `${cluster}/lightning-tables/${name}/preview`,
    agent: (name: string) => `${env}/streaming-agents/${i.clusterId}/${name}/details/overview`,
    lineage: (topic: string) => `${cluster}/stream-lineage/view/topic-${topic}`,
  };
}

export type ConsoleLinks = ReturnType<typeof consoleLinks>;

/** Null wherever there is no console to open: the simulator, and the scripted before-world. */
export const ConsoleContext = createContext<ConsoleLinks | null>(null);
export const useConsole = () => useContext(ConsoleContext);

/**
 * A name that opens its own page in the Confluent Cloud console, in a new tab, for whoever is
 * logged in there. With no address it is the plain name, so nothing on screen ever points at
 * a page that is not there.
 */
export function Out({ href, title, children }: { href?: string | null; title?: string; children: ReactNode }) {
  if (!href) return <>{children}</>;
  // The glare crosses once when the link first shows, then only under the pointer or the
  // keyboard's focus: a door should say it is one, and then hold still.
  return (
    <GlareHover
      className="out"
      mode="hover"
      intro
      variant="streak"
      glareColor={PALETTE.text}
      glareOpacity={0.42}
      glareAngle={-52}
      glareSize={34}
      softness={0.7}
      transitionDuration={720}
      borderRadius="5px"
    >
      <a
        className="out-a"
        href={href}
        target="_blank"
        rel="noreferrer"
        title={title ?? 'Open in the Confluent Cloud console'}
        // A link inside a clickable row or panel opens the console and nothing else.
        onClick={(e) => e.stopPropagation()}
      >
        {children}
        <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
          <path d="M4 3h5v5M9 3L3 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </GlareHover>
  );
}
