import { PubSub } from '@google-cloud/pubsub';
import * as logger from "firebase-functions/logger";

// Initialize PubSub client
const pubSubClient = new PubSub({
  projectId: process.env.PUBSUB_PROJECT_ID || 'hexaverse'
});


/**
 * Enum for all event types used in PubSub messages
 */
export enum EventType {
    TILE_UPDATED = 'TILE_UPDATED',
    // Add other event types here as needed
  }

  
/**
 * Creates a PubSub topic if it doesn't exist
 */
export async function createTopicIfNotExists(topicName: string) {
  try {
    const [exists] = await pubSubClient.topic(topicName).exists();
    if (!exists) {
      await pubSubClient.createTopic(topicName);
      logger.info(`Topic ${topicName} created.`);
    }
    return pubSubClient.topic(topicName);
  } catch (error) {
    logger.error(`Error creating topic ${topicName}:`, error);
    throw error;
  }
}

/**
 * Publishes events to PubSub for WebSocket communication
 */
export async function publishEvent(
  eventType: EventType, 
  data: any, 
  topicName: string,
  scope: 'broadcast' | 'direct' = 'broadcast',
  recipientId?: string,
): Promise<string> {
  try {
    const dataBuffer = Buffer.from(JSON.stringify(data));
    const attributes: Record<string, string> = {
      scope,
      eventType
    };
    
    if (scope === 'direct' && recipientId) {
      attributes.recipientId = recipientId;
    }
    
    logger.info(`Publishing ${scope} message to ${topicName}`);
    const messageId = await pubSubClient.topic(topicName).publish(dataBuffer, attributes);
    logger.info(`Published ${scope} message to ${topicName} with ID: ${messageId}${recipientId ? `, recipient: ${recipientId}` : ''}`);
    
    return messageId;
  } catch (error) {
    logger.error(`Error publishing ${eventType} event to PubSub:`, error);
    throw error;
  }
} 