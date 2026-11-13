import { BeforeApplicationShutdown, Injectable } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements BeforeApplicationShutdown
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL must be configured.");
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  // Nest calls this phase after all providers' onModuleDestroy hooks finish.
  async beforeApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
