import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.GPX = require('../../tools/gpx/gpx-lib.js');
