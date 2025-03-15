// Browser polyfills for JSDOM
if (typeof window !== 'undefined') {
  // Ensure process is defined
  if (typeof window.process === 'undefined') {
    (window as any).process = {
      env: {},
      browser: true,
      version: 'v16.0.0',
      nextTick: (cb: Function) => setTimeout(cb, 0)
    };
  }
}

export { };
