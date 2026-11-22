import type { APIRoute } from 'astro';
import demoCards from '../../data/generated/demo-cards.json';

// Only public demo fields reach the browser; the first question stays in HTML.
export const GET: APIRoute = () => new Response(JSON.stringify(demoCards.map((card) => ({
  qid: card.qid,
  sinav: card.sinav,
  ders: card.ders,
  activeCloze: card.activeCloze,
  parts: card.parts,
  extra: card.extra,
}))), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
