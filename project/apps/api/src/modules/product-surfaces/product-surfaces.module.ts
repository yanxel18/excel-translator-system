import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { ProductSurfacesController } from './product-surfaces.controller';
import { ProductSurfacesResolver } from './graphql.resolver';
import { GraphqlAuthGuard } from './graphql-auth.guard';
import { ProductSurfacesService } from './product-surfaces.service';

@Module({ imports: [AuthenticationModule], controllers: [ProductSurfacesController], providers: [ProductSurfacesService, ProductSurfacesResolver, GraphqlAuthGuard], exports: [ProductSurfacesService] })
export class ProductSurfacesModule {}
