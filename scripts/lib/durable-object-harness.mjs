// Обвязка Durable Object для проверок: хранилище, будильник и список сокетов.
//
// Повторяет ровно то, чем пользуется комната, и ничего сверх: put/get/deleteAll,
// setAlarm и getWebSockets. Время не ждём — будильник запускается вручную с тем
// моментом, который нужен проверке.

export function createContext() {
  const storage = new Map();
  const sockets = [];
  let alarmAt = null;

  return {
    sockets,
    get alarmAt() { return alarmAt; },
    /** Подключение с этим игроком — как принятый воркером сокет. */
    connect(playerId) {
      const socket = {
        playerId,
        closed: false,
        deserializeAttachment: () => ({ playerId }),
        serializeAttachment() {},
        send() {},
        close() { this.closed = true; },
      };
      sockets.push(socket);
      return socket;
    },
    /** Обрыв связи: сокет уходит из списка, как это делает рантайм. */
    disconnect(socket) {
      const index = sockets.indexOf(socket);
      if (index >= 0) sockets.splice(index, 1);
    },
    ctx: {
      storage: {
        async get(key) { return storage.get(key); },
        async put(key, value) { storage.set(key, value); },
        async delete(key) { storage.delete(key); },
        async deleteAll() { storage.clear(); },
        async setAlarm(at) { alarmAt = at; },
        async getAlarm() { return alarmAt; },
      },
      blockConcurrencyWhile: (fn) => fn(),
      getWebSockets: () => [...sockets],
      acceptWebSocket() {},
      waitUntil() {},
    },
    storage,
  };
}
