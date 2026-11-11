import { Args, Context, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ProductSurfacesService } from './product-surfaces.service';
import { ChangelogPage, JobPage, MutationResult, NotificationPage, ProfileRecord, WorkbookPreview } from './graphql.types';
import { NotificationsService } from '../notifications/notifications.service';

@Resolver()
export class ProductSurfacesResolver {
  constructor(private readonly surfaces: ProductSurfacesService, private readonly notificationsService: NotificationsService) {}
  private owner(context: any): string { return String(context.req.user.userId); }

  @Query(() => JobPage)
  history(@Context() context: any, @Args('cursor', { type: () => String, nullable: true }) cursor?: string) {
    return this.surfaces.history(this.owner(context), cursor);
  }

  @Query(() => ProfileRecord)
  profile(@Context() context: any) { return this.surfaces.getProfile(this.owner(context)); }

  @Query(() => NotificationPage)
  notifications(@Context() context: any, @Args('cursor', { type: () => String, nullable: true }) cursor?: string) {
    return this.notificationsService.list(this.owner(context), cursor);
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
  markNotificationRead(@Context() context: any, @Args('id', { type: () => ID }) id: string) {
    return this.notificationsService.markRead(this.owner(context), id);
  }
}
