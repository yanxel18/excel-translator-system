import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { ProductSurfacesController } from './product-surfaces.controller';
import { ProductSurfacesResolver } from './graphql.resolver';
import { ProductSurfacesService } from './product-surfaces.service';

@Module({ imports: [AuthenticationModule], controllers: [ProductSurfacesController], providers: [ProductSurfacesService, ProductSurfacesResolver], exports: [ProductSurfacesService] })
export class ProductSurfacesModule {}
