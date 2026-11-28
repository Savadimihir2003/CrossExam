export default {
  async scheduled(_event, env, ctx) {
    if (!env.RENDER_HEALTH_URL) return;
    ctx.waitUntil(
      fetch(env.RENDER_HEALTH_URL, {
        headers: { 'User-Agent': 'CrossExam-KeepAlive/1.0' },
      })
        .then((res) => console.log(`Keep-alive ping: ${res.status}`))
        .catch((err) => console.error(`Keep-alive failed: ${err.message}`))
    );
  },
};
