import { Injectable } from '@nestjs/common';

@Injectable()
export class ProgressTrackingService {
  private progressStore: Map<string, any> = new Map();

  saveProgress(jobId: string, progressData: any): void {
    this.progressStore.set(jobId, {
      ...progressData,
      timestamp: new Date(),
    });
  }

  getProgress(jobId: string): any {
    return this.progressStore.get(jobId);
  }

  recoverProgress(jobId: string): any {
    const progress = this.progressStore.get(jobId);
    if (!progress) {
      return null;
    }
    
    // Simulate recovery process
    return {
      ...progress,
      recoveredAt: new Date(),
    };
  }

  clearProgress(jobId: string): void {
    this.progressStore.delete(jobId);
  }
}