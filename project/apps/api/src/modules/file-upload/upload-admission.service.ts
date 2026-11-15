import {
  ConflictException,
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";

@Injectable()
export class UploadAdmissionService implements OnModuleDestroy {
  private active = false;
  private shuttingDown = false;
  private settled: Promise<void> = Promise.resolve();

  acquire(): () => void {
    if (this.shuttingDown)
      throw new ServiceUnavailableException(
        "Workbook uploads are shutting down.",
      );
    if (this.active)
      throw new ConflictException({
        statusCode: 409,
        code: "UPLOAD_BUSY",
        message:
          "Another workbook upload is receiving or validating. Retry shortly.",
      });
    this.active = true;
    let finish!: () => void;
    this.settled = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active = false;
      finish();
    };
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    await this.settled;
  }
}
