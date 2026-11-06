export default {
  async fetch(request, env) {
    // Production is public: serve the built application to every visitor.
    return env.ASSETS.fetch(request);
  }
};
