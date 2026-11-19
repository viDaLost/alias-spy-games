const retired = () => new Response('Gone', { status: 410 });

// Keep the migrated class so the retired endpoint can be deployed without deleting saved rooms.
export class KingdomsRoom {
  fetch() { return retired(); }
}

export default { fetch: retired };
