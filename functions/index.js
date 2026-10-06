const { initializeApp } = require('firebase-admin/app');

initializeApp();

// Keep the backend focused on the live app requirements without the
// deprecated Facebook polling flow.
exports.pollAirQuality = require('./airQuality').pollAirQuality;
