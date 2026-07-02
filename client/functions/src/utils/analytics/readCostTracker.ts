import * as logger from "firebase-functions/logger";

/**
 * Interface for tracking Firestore read costs
 */
export interface ReadCost {
  operation: string;
  reads: number;
  timestamp: number;
  functionName?: string;
}

/**
 * Class for tracking Firestore read costs within functions
 */
export class ReadCostTracker {
  private readCosts: ReadCost[] = [];
  private functionName: string;

  constructor(functionName: string) {
    this.functionName = functionName;
    this.reset();
  }

  /**
   * Track a read operation with associated cost
   * @param operation The name of the operation being performed
   * @param reads The number of document reads
   * @returns The number of reads for chaining
   */
  trackRead(operation: string, reads: number): number {
    const cost: ReadCost = {
      operation,
      reads,
      timestamp: Date.now(),
      functionName: this.functionName
    };
    this.readCosts.push(cost);
    logger.info(`[${this.functionName}] Firestore Read: [${operation}] - ${reads} document reads`);
    return reads;
  }

  /**
   * Track a read operation with associated cost
   * @param operation The name of the operation being performed
   * @param write The number of document reads
   * @returns The number of reads for chaining
   */
  trackWrite(operation: string, write: number): number {
    const cost: ReadCost = {
      operation,
      reads: write,
      timestamp: Date.now(),
      functionName: this.functionName
    };
    this.readCosts.push(cost);
    logger.info(`[${this.functionName}] Firestore Write: [${operation}] - ${write} document writes`);
    return write;
  }

  /**
   * Reset the read tracking
   */
  reset(): void {
    this.readCosts = [];
  }

  /**
   * Get a summary of all read operations
   * @returns Object containing total reads and breakdown by operation
   */
  getSummary(): { total: number, operations: ReadCost[] } {
    const total = this.readCosts.reduce((sum, item) => sum + item.reads, 0);
    return { 
      total, 
      operations: [...this.readCosts] 
    };
  }

  /**
   * Store read metrics in Firestore for analysis
   * This allows tracking read patterns over time
   */
  async storeMetrics() {
    try {
      const admin = await import('firebase-admin');
      const summary = this.getSummary();
      
      await admin.firestore().collection('metrics').doc().set({
        type: 'readCost',
        functionName: this.functionName,
        timestamp: Date.now(),
        totalReads: summary.total,
        operations: summary.operations,
      });
      
      logger.info(`Stored read metrics for ${this.functionName}: ${summary.total} total reads`);
    } catch (error) {
      logger.error('Error storing read metrics:', error);
    }
  }
}

/**
 * Create a function to estimate query cost before execution
 * @param collectionPath The collection path
 * @param estimatedResults Estimated number of results
 * @returns Estimated read cost information
 */
export function estimateQueryCost(
  collectionPath: string, 
  estimatedResults: number
): { estimatedReads: number, explanation: string } {
  // Basic estimation - in reality this would be more complex based on indexes, etc.
  return {
    estimatedReads: estimatedResults,
    explanation: `Query on ${collectionPath} with approximately ${estimatedResults} results will cost ${estimatedResults} reads`
  };
} 