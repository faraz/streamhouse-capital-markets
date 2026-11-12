/**
 * The five pillars, in the words on the official architecture picture and on every label in
 * the talk this demo sits inside. The room has just been taught these five names; the screen
 * uses them so a seller can lay the demo over the slide.
 */
export const PILLARS = [
  { id: 'Connect', does: 'Each source captured as records' },
  { id: 'Stream', does: 'One topic per source, kept in order' },
  { id: 'Process', does: 'Flink reshapes, then keeps the total' },
  { id: 'Govern', does: 'Schema checked, wrong records turned away' },
  { id: 'Query', does: 'Lightning Tables, asked in SQL' },
] as const;

export type Pillar = (typeof PILLARS)[number]['id'];
