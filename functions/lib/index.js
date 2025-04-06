"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.countUsers = exports.makeUppercase = exports.helloWorld = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
// Initialize Firebase Admin
admin.initializeApp();
// HTTP callable function example
exports.helloWorld = (0, https_1.onRequest)((request, response) => {
    logger.info("Hello logs!", { structuredData: true });
    response.json({
        message: "Hello from Firebase!",
        timestamp: new Date().toISOString(),
    });
});
// Firestore trigger function example
// This function will be triggered when a new document is created in the 'messages' collection
// It will take the 'original' field and create an uppercase version in the same document
exports.makeUppercase = (0, firestore_1.onDocumentCreated)("messages/{documentId}", (event) => {
    // Check if data exists
    if (!event.data) {
        logger.error("No data found in event");
        return null;
    }
    // Get the data from the document
    const data = event.data.data();
    // Check if the data has an 'original' field
    if (!data.original) {
        logger.error("No original field found");
        return null;
    }
    const original = data.original;
    logger.info("Uppercasing", event.params.documentId, original);
    // Convert to uppercase
    const uppercase = original.toUpperCase();
    // Update the document with the uppercase field
    return event.data.ref.set({ uppercase }, { merge: true });
});
// Example function to count users
exports.countUsers = (0, https_1.onRequest)(async (req, res) => {
    try {
        const snapshot = await admin.firestore().collection('users').count().get();
        const count = snapshot.data().count;
        res.json({
            count: count,
            message: `Total users count: ${count}`
        });
    }
    catch (error) {
        logger.error("Error counting users:", error);
        res.status(500).json({ error: "Failed to count users" });
    }
});
//# sourceMappingURL=index.js.map