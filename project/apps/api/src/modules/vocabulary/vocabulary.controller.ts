import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { JwtAuthGuard } from "../authentication/jwt-auth.guard";
import { VocabularyService } from "./vocabulary.service";
import { strictObject, uuid } from "../../common/management-validation";

const groupFields = [
  "name",
  "description",
  "sourceLanguage",
  "targetLanguage",
] as const;
const entryFields = ["source", "target"] as const;

@Controller("vocabulary")
@UseGuards(JwtAuthGuard)
export class VocabularyController {
  constructor(private readonly service: VocabularyService) {}
  private owner(req: Request): string {
    return String((req as any).user?.userId ?? "local-user");
  }

  @Get() list(@Req() req: Request) {
    return this.service.list(this.owner(req));
  }
  @Post() createGroup(@Req() req: Request, @Body() body: unknown) {
    return this.service.createGroup(
      this.owner(req),
      strictObject(body, groupFields),
    );
  }
  @Patch(":id") updateGroup(
    @Param("id") id: string,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return this.service.updateGroup(
      uuid(id),
      this.owner(req),
      strictObject(body, groupFields),
    );
  }
  @Delete(":id") deleteGroup(@Param("id") id: string, @Req() req: Request) {
    return this.service.deleteGroup(uuid(id), this.owner(req));
  }
  @Post(":id/entries") createEntry(
    @Param("id") id: string,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return this.service.createEntry(
      uuid(id),
      this.owner(req),
      strictObject(body, entryFields),
    );
  }
  @Patch(":id/entries/:entryId") updateEntry(
    @Param("id") id: string,
    @Param("entryId") entryId: string,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return this.service.updateEntry(
      uuid(id),
      uuid(entryId),
      this.owner(req),
      strictObject(body, entryFields),
    );
  }
  @Delete(":id/entries/:entryId") deleteEntry(
    @Param("id") id: string,
    @Param("entryId") entryId: string,
    @Req() req: Request,
  ) {
    return this.service.deleteEntry(uuid(id), uuid(entryId), this.owner(req));
  }
}
