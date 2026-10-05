// Small gaps in older browser engines (some TV / Cast firmware, older iOS).
// Imported first by every page so it runs before any other module.
if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, 'at', {
    configurable: true,
    writable: true,
    value(i) {
      const n = Math.trunc(i) || 0;
      return this[n < 0 ? this.length + n : n];
    },
  });
}
