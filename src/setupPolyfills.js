// Node.js polyfills
import { Buffer } from 'buffer';
import process from 'process';

// Required polyfills for Solana Web3.js
window.Buffer = Buffer;
window.process = process;

// Fix for TextEncoder/TextDecoder in older browsers
if (typeof window.TextEncoder === 'undefined') {
  const TextEncodingPolyfill = require('text-encoding');
  window.TextEncoder = TextEncodingPolyfill.TextEncoder;
  window.TextDecoder = TextEncodingPolyfill.TextDecoder;
} 