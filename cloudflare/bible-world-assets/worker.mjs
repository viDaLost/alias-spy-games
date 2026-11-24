export default {
  fetch(request, env) {
    return env.PANORAMAS.fetch(request);
  },
};
