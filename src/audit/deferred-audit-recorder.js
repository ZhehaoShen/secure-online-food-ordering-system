const inMemoryLogs = [];

export const deferredAuditRecorder = Object.freeze({
  async record(event) {
    inMemoryLogs.push(Object.freeze({ ...event, recordedAt: new Date() }));
  },

  getLogs() {
    return Object.freeze([...inMemoryLogs]);
  },

  clear() {
    inMemoryLogs.length = 0;
  },
});
