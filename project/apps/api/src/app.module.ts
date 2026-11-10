import { Module } from '@nestjs/common';
import { FileUploadModule } from './modules/file-upload/file-upload.module';
import { TextExtractionModule } from './modules/text-extraction/text-extraction.module';
import { TranslationModule } from './modules/translation/translation.module';
import { JobManagementModule } from './modules/job-management/job-management.module';
import { AuthenticationModule } from './modules/authentication/authentication.module';
import { ProgressTrackingModule } from './modules/progress-tracking/progress-tracking.module';
import { PersistenceModule } from './modules/persistence/persistence.module';
import { VocabularyModule } from './modules/vocabulary/vocabulary.module';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'node:path';
import { ProductSurfacesModule } from './modules/product-surfaces/product-surfaces.module';

const graphqlBasePath = (process.env.BASE_PATH || '/excel-convert').replace(/^\/+|\/+$/g, '');

@Module({
  imports: [
    PersistenceModule,
    FileUploadModule,
    TextExtractionModule,
    TranslationModule,
    JobManagementModule,
    AuthenticationModule,
    ProgressTrackingModule,
    VocabularyModule,
    ProductSurfacesModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      path: `${graphqlBasePath ? `/${graphqlBasePath}` : ''}/graphql`,
      autoSchemaFile: join(process.cwd(), 'src/modules/product-surfaces/schema.gql'),
      sortSchema: true,
      context: ({ req }) => ({ req }),
    }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
