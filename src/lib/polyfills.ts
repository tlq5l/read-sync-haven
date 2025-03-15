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
  
  // Add JSDOM-related polyfills if needed
  if (typeof window.TextEncoder === 'undefined') {
    try {
      // Use the global TextEncoder if available
      (window as any).TextEncoder = TextEncoder;
      (window as any).TextDecoder = TextDecoder;
    } catch (e) {
      console.warn('TextEncoder/TextDecoder not available in this environment');
    }
  }
  
  // Required for PouchDB in some environments
  if (typeof window.crypto === 'undefined' || typeof window.crypto.getRandomValues === 'undefined') {
    // Simple polyfill for crypto.getRandomValues
    (window as any).crypto = {
      ...(window as any).crypto,
      getRandomValues: function(buffer: Uint8Array) {
        for (let i = 0; i < buffer.length; i++) {
          buffer[i] = Math.floor(Math.random() * 256);
        }
        return buffer;
      }
    };
  }
}

export { };