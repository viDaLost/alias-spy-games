(() => {
  'use strict';

  class QuartetPollingSocket extends EventTarget {
    constructor(socketUrl) {
      super();
      const url = new URL(socketUrl);
      url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
      url.pathname = url.pathname.replace(/\/ws$/, '/poll');
      this.url = url;
      this.readyState = WebSocket.CONNECTING;
      this.lifecycle = new AbortController();
      this.queue = [];
      this.actionReadyAt = 0;
      this.failures = 0;
      this.status = 'lobby';
      document.addEventListener('visibilitychange', () => this.schedule(0), { signal: this.lifecycle.signal });
      this.schedule(0);
    }

    schedule(delay) {
      clearTimeout(this.timer);
      if (this.readyState === WebSocket.CLOSED || this.inFlight || (document.hidden && !this.queue.length)) return;
      const actionDelay = this.queue.length ? this.actionReadyAt - Date.now() : 0;
      this.timer = setTimeout(() => this.poll(), Math.max(delay, actionDelay));
    }

    async post(body, options) {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
        ...options,
      });
      if (response.status >= 500 || response.status === 429) throw new Error('Сервер временно недоступен');
      return { response, result: await response.json() };
    }

    notify(message) {
      this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
    }

    async poll() {
      const request = this.queue.shift() || {};
      const controller = new AbortController();
      this.inFlight = controller;
      const timeout = setTimeout(() => controller.abort(), 6500);
      try {
        const { response, result } = await this.post(request, { signal: controller.signal });
        if (this.readyState === WebSocket.CLOSED) return;
        if ([401, 403, 404].includes(response.status) || result.closed) {
          this.close();
          return;
        }
        if (!result.ok || !result.state) {
          this.notify({ type: 'error', error: result.error });
          return;
        }
        if (this.readyState === WebSocket.CONNECTING) {
          this.readyState = WebSocket.OPEN;
          this.dispatchEvent(new Event('open'));
        }
        this.failures = 0;
        this.status = result.state.status;
        this.notify({ type: 'state', state: result.state });
      } catch {
        if (this.readyState === WebSocket.CLOSED) return;
        if (request.action) this.notify({ type: 'error', error: 'Ответ задержался. Проверяем состояние партии.' });
        this.failures += 1;
        if (this.failures >= 3) this.close();
      } finally {
        clearTimeout(timeout);
        this.inFlight = null;
        // The room rate-limits successive actions from the same player.
        if (request.action) this.actionReadyAt = Date.now() + 275;
        const interval = this.status === 'playing' ? 1500 : this.status === 'finished' ? 4000 : 2400;
        this.schedule(this.queue.length ? 0 : this.failures ? Math.min(this.failures * 2200, 6000) : interval);
      }
    }

    send(data) {
      const { action, payload } = JSON.parse(data);
      const request = { action, payload, requestId: crypto.randomUUID() };
      if (action === 'leave') {
        // The game closes its connection as soon as the player leaves.
        this.post(request, { keepalive: true }).catch(() => {});
        return;
      }
      this.queue.push(request);
      this.schedule(0);
    }

    close() {
      if (this.readyState === WebSocket.CLOSED) return;
      this.readyState = WebSocket.CLOSED;
      clearTimeout(this.timer);
      this.inFlight?.abort();
      this.lifecycle.abort();
      this.queue.length = 0;
      this.dispatchEvent(new Event('close'));
    }
  }

  window.QuartetPollingSocket = QuartetPollingSocket;
})();
