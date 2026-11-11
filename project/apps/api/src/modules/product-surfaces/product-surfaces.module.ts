import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { ProductSurfacesController } from './product-surfaces.controller';
import { ProductSurfacesResolver } from './graphql.resolver';
import { ProductSurfacesService } from './product-surfaces.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({ imports: [AuthenticationModule, NotificationsModule], controllers: [ProductSurfacesController], providers: [ProductSurfacesService, ProductSurfacesResolver], exports: [ProductSurfacesService] })
export class ProductSurfacesModule {}
