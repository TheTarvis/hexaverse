import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

interface SupportSubmissionRequest {
  category: 'idea' | 'problem' | 'other';
  title: string;
  description: string;
  userId: string;
  userEmail: string;
}

interface SupportSubmissionResponse {
  success: boolean;
  id: string;
  message: string;
}

export async function submitSupportRequest(data: SupportSubmissionRequest): Promise<SupportSubmissionResponse> {
  const functions = getFunctions(getApp());
  const submitRequest = httpsCallable<SupportSubmissionRequest, SupportSubmissionResponse>(
    functions,
    'submitSupportRequest'
  );

  const result = await submitRequest(data);
  return result.data;
} 