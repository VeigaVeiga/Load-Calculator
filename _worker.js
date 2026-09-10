export default {
  async fetch(request, env) {
    return new Response("WORKER TEST 2026", {
      status: 200,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }
};
