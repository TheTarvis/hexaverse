"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteRoadmapItem = exports.updateRoadmapItem = exports.addRoadmapItem = exports.fetchTilesByIds = exports.addTile = exports.createColony = exports.makeUppercase = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
// Import functions from other files
const colony_1 = require("./colony");
Object.defineProperty(exports, "createColony", { enumerable: true, get: function () { return colony_1.createColony; } });
const tiles_1 = require("./tiles");
Object.defineProperty(exports, "addTile", { enumerable: true, get: function () { return tiles_1.addTile; } });
Object.defineProperty(exports, "fetchTilesByIds", { enumerable: true, get: function () { return tiles_1.fetchTilesByIds; } });
const roadmap_1 = require("./roadmap");
Object.defineProperty(exports, "addRoadmapItem", { enumerable: true, get: function () { return roadmap_1.addRoadmapItem; } });
Object.defineProperty(exports, "updateRoadmapItem", { enumerable: true, get: function () { return roadmap_1.updateRoadmapItem; } });
Object.defineProperty(exports, "deleteRoadmapItem", { enumerable: true, get: function () { return roadmap_1.deleteRoadmapItem; } });
// Initialize Firebase Admin
admin.initializeApp();
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
//# sourceMappingURL=index.js.map