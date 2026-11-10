import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, Context, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { PrismaService } from '../persistence/prisma.service';
import { ProductSurfacesService } from './product-surfaces.service';
import { ChangelogPage, JobPage, MutationResult, NotificationPage, ProfileRecord, WorkbookPreview } from './graphql.types';

@Resolver()
export class ProductSurfacesResolver {
  constructor(private readonly prisma: PrismaService, private readonly surfaces: ProductSurfacesService) {}
  private owner(context: any): string { return String(context.req.user.userId); }

  @Query(() => JobPage)
  history(@Context() context: any, @Args('cursor', { type: () => String, nullable: true }) cursor?: string) {
    return this.surfaces.history(this.owner(context), cursor);
  }

  @Query(() => ProfileRecord)
  profile(@Context() context: any) { return this.surfaces.getProfile(this.owner(context)); }

  @Query(() => NotificationPage)
  async notifications(@Context() context: any, @Args('cursor', { type: () => String, nullable: true }) cursor?: string) {
    const userId = this.owner(context);
    if (cursor && !(await this.prisma.notification.findFirst({ where: { id: cursor, userId }, select: { id: true } }))) throw new BadRequestException('Invalid notification cursor.');
    const items = await this.prisma.notification.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 21, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    const hasMore = items.length > 20;
    const data = items.slice(0, 20);
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  @Query(() => ChangelogPage)
  changelog(@Args('cursor', { type: () => String, nullable: true }) cursor?: string) { return this.surfaces.changelog(cursor); }

  @Query(() => WorkbookPreview)
  preview(
    @Context() context: any,
    @Args('jobId', { type: () => ID }) jobId: string,
    @Args('version', { type: () => String, nullable: true }) version = 'translated',
  ) { return this.surfaces.preview(jobId, this.owner(context), version); }

  @Query(() => String)
  downloadUrl(@Context() context: any, @Args('jobId', { type: () => ID }) jobId: string) {
    return this.surfaces.downloadUrl(jobId, this.owner(context));
  }

  @Mutation(() => MutationResult)
  deleteHistoryItem(@Context() context: any, @Args('id', { type: () => ID }) id: string) {
    return this.surfaces.deleteHistoryItem(id, this.owner(context));
  }

  @Mutation(() => ProfileRecord)
  updateProfile(
    @Context() context: any,
    @Args('fullName', { type: () => String, nullable: true }) fullName?: string,
    @Args('email', { type: () => String, nullable: true }) email?: string,
  ) { return this.surfaces.updateProfile(this.owner(context), { fullName, email }); }

  @Mutation(() => MutationResult)
  async markNotificationRead(@Context() context: any, @Args('id', { type: () => ID }) id: string) {
    const result = await this.prisma.notification.updateMany({ where: { id, userId: this.owner(context) }, data: { isRead: true } });
    if (!result.count) throw new NotFoundException('Notification not found.');
    return { ok: true };
  }
}
