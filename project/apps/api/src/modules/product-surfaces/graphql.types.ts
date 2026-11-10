import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class JobRecord {
  @Field(() => ID) id: string;
  @Field() status: string;
  @Field() fileName: string;
  @Field(() => Int) fileSize: number;
  @Field(() => Int) progress: number;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
  @Field({ nullable: true }) completedAt?: Date;
  @Field(() => Int, { nullable: true }) elapsedMs?: number;
  @Field(() => [String]) selectedSheets: string[];
  @Field() sourceLanguage: string;
  @Field() targetLanguage: string;
}

@ObjectType()
export class NotificationRecord {
  @Field(() => ID) id: string;
  @Field({ nullable: true }) jobId: string | null;
  @Field() type: string;
  @Field() title: string;
  @Field() message: string;
  @Field() isRead: boolean;
  @Field() createdAt: Date;
}

@ObjectType()
export class ProfileRecord {
  @Field(() => ID) id: string;
  @Field() username: string;
  @Field({ nullable: true }) email: string | null;
  @Field({ nullable: true }) fullName: string | null;
  @Field() createdAt: Date;
}

@ObjectType()
export class ChangelogRecord {
  @Field(() => ID) id: string;
  @Field() title: string;
  @Field() details: string;
  @Field() publishedAt: Date;
}

@ObjectType()
export class JobPage {
  @Field(() => [JobRecord]) data: JobRecord[];
  @Field({ nullable: true }) nextCursor: string | null;
}

@ObjectType()
export class NotificationPage {
  @Field(() => [NotificationRecord]) data: NotificationRecord[];
  @Field({ nullable: true }) nextCursor: string | null;
}

@ObjectType()
export class ChangelogPage {
  @Field(() => [ChangelogRecord]) data: ChangelogRecord[];
  @Field({ nullable: true }) nextCursor: string | null;
}

@ObjectType()
export class MutationResult {
  @Field() ok: boolean;
}

@ObjectType()
export class PreviewSheet {
  @Field() name: string;
  @Field(() => [[String]]) rows: string[][];
}

@ObjectType()
export class WorkbookPreview {
  @Field() fileName: string;
  @Field() version: string;
  @Field(() => [PreviewSheet]) sheets: PreviewSheet[];
}
