import { onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

interface SupportSubmission {
  category: 'idea' | 'problem' | 'other';
  title: string;
  description: string;
  userId: string;
  userEmail: string;
  createdAt: number;
  status: 'new' | 'in-review' | 'completed';
}

export const submitSupportRequest = onCall<Omit<SupportSubmission, 'createdAt' | 'status'>>(async (request) => {
  try {
    // Ensure user is authenticated
    if (!request.auth) {
      throw new Error('Unauthorized');
    }

    const { category, title, description, userId, userEmail } = request.data;

    // Validate required fields
    if (!category || !title || !description) {
      throw new Error('Missing required fields');
    }

    // Create the submission document
    const submission: SupportSubmission = {
      category,
      title,
      description,
      userId,
      userEmail,
      createdAt: Date.now(),
      status: 'new'
    };

    // Save to Firestore
    const docRef = await admin.firestore()
      .collection('support_requests')
      .add(submission);

    logger.info('Support request created:', docRef.id);

    return {
      success: true,
      id: docRef.id,
      message: 'Support request submitted successfully'
    };

  } catch (error) {
    logger.error('Error submitting support request:', error);
    throw new Error(error instanceof Error ? error.message : 'Unknown error occurred');
  }
}); 