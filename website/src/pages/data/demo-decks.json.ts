import type { APIRoute } from 'astro';
import demoDecks from '../../data/generated/demo-decks.json';

// The tablet demo's decks and cards, loaded after the page so the home HTML stays small.
export const GET: APIRoute = () => new Response(JSON.stringify(demoDecks), {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
