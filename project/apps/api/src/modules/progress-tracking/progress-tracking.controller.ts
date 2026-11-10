import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ProgressTrackingService } from './progress-tracking.service';
import { JwtAuthGuard } from '../authentication/jwt-auth.guard';

@Controller('progress')
@UseGuards(JwtAuthGuard)
export class ProgressTrackingController {
  constructor(private readonly progressTrackingService: ProgressTrackingService) {}

  @Post(':jobId/save')
  saveProgress(@Param('jobId') jobId: string, @Body() progressData: any) {
    try {
      this.progressTrackingService.saveProgress(jobId, progressData);
      return { success: true, message: 'Progress saved' };
    } catch (error) {
      throw new Error(`Failed to save progress: ${error.message}`);
    }
  }

  @Get(':jobId')
  getProgress(@Param('jobId') jobId: string) {
    try {
      const progress = this.progressTrackingService.getProgress(jobId);
      return progress || { message: 'No progress found' };
    } catch (error) {
      throw new Error(`Failed to retrieve progress: ${error.message}`);
    }
  }

  @Post(':jobId/recover')
  recoverProgress(@Param('jobId') jobId: string) {
    try {
      const recovered = this.progressTrackingService.recoverProgress(jobId);
      return recovered || { message: 'No progress to recover' };
    } catch (error) {
      throw new Error(`Failed to recover progress: ${error.message}`);
    }
  }
}
